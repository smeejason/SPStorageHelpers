import ExcelJS from 'exceljs'
import type { SiteFileInventory } from '../types'
import { formatBytes } from '../utils/format'

/** Export the full file inventory (with versions) to an Excel workbook and trigger download */
export async function exportInventoryToExcel(inventory: SiteFileInventory): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SP Storage Helpers'

  // ─── Sheet 1: All Files ─────────────────────────────────────────

  const filesSheet = wb.addWorksheet('Files')
  const fileHeaders = [
    'Library', 'Name', 'Title', 'Path', 'Size (bytes)', 'Size',
    'Created', 'Created By', 'Modified', 'Modified By',
    'Current Version', 'Version Count', 'Total Version Size', 'Total Version Size (formatted)',
  ]
  const headerRow = filesSheet.addRow(fileHeaders)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0078D4' } }
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }

  for (const lib of inventory.libraries) {
    for (const file of lib.files) {
      const totalVersionSize = file.versions.reduce((s, v) => s + v.size, 0)
      filesSheet.addRow([
        lib.driveName,
        file.name,
        file.title,
        file.path,
        file.size,
        formatBytes(file.size),
        file.createdDateTime,
        file.createdBy,
        file.lastModifiedDateTime,
        file.lastModifiedBy,
        file.versionLabel,
        file.versions.length,
        totalVersionSize,
        formatBytes(totalVersionSize),
      ])
    }
  }

  autoWidth(filesSheet)

  // ─── Sheet 2: All Versions ──────────────────────────────────────

  const versionsSheet = wb.addWorksheet('Versions')
  const versionHeaders = [
    'Library', 'File Name', 'File Path', 'Version', 'Size (bytes)', 'Size',
    'Modified', 'Modified By',
  ]
  const vHeaderRow = versionsSheet.addRow(versionHeaders)
  vHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  vHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0078D4' } }

  for (const lib of inventory.libraries) {
    for (const file of lib.files) {
      for (const ver of file.versions) {
        versionsSheet.addRow([
          lib.driveName,
          file.name,
          file.path,
          ver.versionLabel,
          ver.size,
          formatBytes(ver.size),
          ver.lastModifiedDateTime,
          ver.lastModifiedBy,
        ])
      }
    }
  }

  autoWidth(versionsSheet)

  // ─── Sheet 3: Library Summary ───────────────────────────────────

  const summarySheet = wb.addWorksheet('Library Summary')
  const sHeaders = ['Library', 'Files', 'Total Versions', 'Used', 'Quota', 'Version Storage']
  const sHeaderRow = summarySheet.addRow(sHeaders)
  sHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0078D4' } }

  for (const lib of inventory.libraries) {
    const totalVersions = lib.files.reduce((s, f) => s + f.versions.length, 0)
    const totalVersionSize = lib.files.reduce(
      (s, f) => s + f.versions.reduce((vs, v) => vs + v.size, 0), 0,
    )
    summarySheet.addRow([
      lib.driveName,
      lib.files.length,
      totalVersions,
      formatBytes(lib.usedBytes),
      formatBytes(lib.totalBytes),
      formatBytes(totalVersionSize),
    ])
  }

  autoWidth(summarySheet)

  // ─── Download ───────────────────────────────────────────────────

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${inventory.siteName.replace(/[^a-zA-Z0-9]/g, '_')}_file_inventory.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
