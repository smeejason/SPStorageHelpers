import ExcelJS from 'exceljs'
import type { LibraryInventory, SiteFileInventory } from '../types'
import { formatBytes } from '../utils/format'
import { getGraphClient } from './graphClient'

const SP_SITE_ID = import.meta.env.VITE_SP_SITE_ID ?? ''
const FOLDER_PATH = 'SPStorage'

// ─── Ensure folder ────────────────────────────────────────────────────────────

let folderChecked = false

async function ensureFolder(): Promise<void> {
  if (folderChecked) return
  const client = getGraphClient()
  try {
    await client.api(`/sites/${SP_SITE_ID}/drive/root:/${FOLDER_PATH}`).get()
    folderChecked = true
  } catch {
    await client.api(`/sites/${SP_SITE_ID}/drive/root/children`).post({
      name: FOLDER_PATH, folder: {}, '@microsoft.graph.conflictBehavior': 'fail',
    })
    folderChecked = true
  }
}

// ─── File name helpers ────────────────────────────────────────────────────────

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 60)
}

export function libraryExcelFileName(siteName: string, libName: string): string {
  return `${safeName(siteName)}_${safeName(libName)}.xlsx`
}

// ─── Build workbook for a single library ──────────────────────────────────────

export function buildLibraryWorkbook(lib: LibraryInventory): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SP Storage Helpers'

  // Sheet 1: Files
  const filesSheet = wb.addWorksheet('Files')
  const fh = filesSheet.addRow([
    'Name', 'Title', 'Path', 'Size (bytes)', 'Size',
    'Created', 'Created By', 'Modified', 'Modified By',
    'Current Version', 'Version Count', 'Total Version Size', 'Total Version Size (formatted)',
  ])
  styleHeader(fh)

  for (const file of lib.files) {
    const tvs = file.versions.reduce((s, v) => s + v.size, 0)
    filesSheet.addRow([
      file.name, file.title, file.path, file.size, formatBytes(file.size),
      file.createdDateTime, file.createdBy,
      file.lastModifiedDateTime, file.lastModifiedBy,
      file.versionLabel, file.versions.length, tvs, formatBytes(tvs),
    ])
  }
  autoWidth(filesSheet)

  // Sheet 2: Versions
  const versionsSheet = wb.addWorksheet('Versions')
  const vh = versionsSheet.addRow([
    'File Name', 'File Path', 'Version', 'Size (bytes)', 'Size', 'Modified', 'Modified By',
  ])
  styleHeader(vh)

  for (const file of lib.files) {
    for (const ver of file.versions) {
      versionsSheet.addRow([
        file.name, file.path, ver.versionLabel, ver.size, formatBytes(ver.size),
        ver.lastModifiedDateTime, ver.lastModifiedBy,
      ])
    }
  }
  autoWidth(versionsSheet)

  return wb
}

// ─── Save library Excel to SharePoint ─────────────────────────────────────────

export async function saveLibraryExcelToSP(
  siteName: string,
  lib: LibraryInventory,
): Promise<void> {
  if (!SP_SITE_ID) return
  const client = getGraphClient()
  await ensureFolder()

  const wb = buildLibraryWorkbook(lib)
  const buffer = await wb.xlsx.writeBuffer()
  const fileName = libraryExcelFileName(siteName, lib.driveName)

  // Must send as Blob with correct MIME type — the Graph SDK
  // corrupts raw ArrayBuffers by serializing them as JSON
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  await client
    .api(`/sites/${SP_SITE_ID}/drive/root:/${FOLDER_PATH}/${fileName}:/content`)
    .put(blob)

  console.log(`[ExcelCache] Saved ${fileName}`)
}

// ─── Load library Excel from SharePoint ───────────────────────────────────────

export async function loadLibraryExcelFromSP(
  siteName: string,
  libName: string,
): Promise<LibraryInventory | null> {
  if (!SP_SITE_ID) return null
  const client = getGraphClient()
  const fileName = libraryExcelFileName(siteName, libName)

  try {
    console.log(`[ExcelCache] Loading ${fileName}...`)

    // Get a download URL for the file, then fetch the binary content directly
    const meta = await client
      .api(`/sites/${SP_SITE_ID}/drive/root:/${FOLDER_PATH}/${fileName}`)
      .select('@microsoft.graph.downloadUrl')
      .get()
    console.log('[ExcelCache] Got metadata, downloadUrl present:', !!meta['@microsoft.graph.downloadUrl'])

    const downloadUrl = meta['@microsoft.graph.downloadUrl'] as string
    if (!downloadUrl) {
      console.warn('[ExcelCache] No download URL returned. Meta keys:', Object.keys(meta))
      return null
    }

    console.log('[ExcelCache] Fetching binary...')
    const response = await fetch(downloadUrl)
    if (!response.ok) {
      console.warn(`[ExcelCache] Download failed: ${response.status} ${response.statusText}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    console.log(`[ExcelCache] Got ${arrayBuffer.byteLength} bytes, parsing Excel...`)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(arrayBuffer)
    console.log('[ExcelCache] Parsed workbook, sheets:', wb.worksheets.map(s => s.name))

    const filesSheet = wb.getWorksheet('Files')
    if (!filesSheet) return null

    const files: LibraryInventory['files'] = []
    filesSheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return // header
      const vals = row.values as unknown[]
      // ExcelJS row.values is 1-indexed
      files.push({
        id: '',
        driveId: '',
        libraryName: libName,
        name: String(vals[1] ?? ''),
        title: String(vals[2] ?? ''),
        path: String(vals[3] ?? ''),
        size: Number(vals[4] ?? 0),
        webUrl: '',
        createdDateTime: String(vals[6] ?? ''),
        createdBy: String(vals[7] ?? ''),
        lastModifiedDateTime: String(vals[8] ?? ''),
        lastModifiedBy: String(vals[9] ?? ''),
        versionLabel: String(vals[10] ?? ''),
        versions: [],
      })
    })

    // Load versions sheet
    const versionsSheet = wb.getWorksheet('Versions')
    if (versionsSheet) {
      const versionsByFile = new Map<string, LibraryInventory['files'][0]['versions']>()
      versionsSheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return
        const vals = row.values as unknown[]
        const fileName = String(vals[1] ?? '')
        if (!versionsByFile.has(fileName)) versionsByFile.set(fileName, [])
        versionsByFile.get(fileName)!.push({
          versionId: String(vals[3] ?? ''),
          versionLabel: String(vals[3] ?? ''),
          size: Number(vals[4] ?? 0),
          lastModifiedDateTime: String(vals[6] ?? ''),
          lastModifiedBy: String(vals[7] ?? ''),
        })
      })
      for (const file of files) {
        file.versions = versionsByFile.get(file.name) ?? []
      }
    }

    console.log(`[ExcelCache] Loaded ${fileName}: ${files.length} files`)
    return { driveId: '', driveName: libName, usedBytes: 0, totalBytes: 0, files }
  } catch (err) {
    console.error(`[ExcelCache] Failed to load ${fileName}:`, err)
    return null
  }
}

// ─── Download library Excel to browser ────────────────────────────────────────

export async function downloadLibraryExcel(
  siteName: string,
  lib: LibraryInventory,
): Promise<void> {
  const wb = buildLibraryWorkbook(lib)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = libraryExcelFileName(siteName, lib.driveName)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Export all libraries (full site) to browser download ─────────────────────

export async function exportInventoryToExcel(inventory: SiteFileInventory): Promise<void> {
  for (const lib of inventory.libraries) {
    await downloadLibraryExcel(inventory.siteName, lib)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0078D4' } }
}

function autoWidth(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    let maxLen = 10
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length
      if (len > maxLen) maxLen = len
    })
    col.width = Math.min(maxLen + 2, 45)
  })
}
