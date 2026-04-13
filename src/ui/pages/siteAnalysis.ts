import { store } from '../../store/store'
import { fetchSiteStorage } from '../../services/storageService'
import { fetchSiteDrives, scanLibrary, type InventoryProgress } from '../../services/inventoryService'
import {
  saveLibraryExcelToSP,
  loadLibraryExcelFromSP,
  downloadLibraryExcel,
  libraryExcelFileName,
} from '../../services/inventoryExport'
import { renderStorageBar } from '../components/storageBar'
import { renderFileTreeTable } from '../components/fileTreeTable'
import { formatBytes, formatDate } from '../../utils/format'
import type { LibraryInventory, SiteFileInventory } from '../../types'
import { getGraphClient } from '../../services/graphClient'

const SP_SITE_ID = import.meta.env.VITE_SP_SITE_ID ?? ''
const FOLDER_PATH = 'SPStorage'

export function renderSiteAnalysis(container: HTMLElement): void {
  container.innerHTML = ''
  injectStyles()

  const header = document.createElement('h1')
  header.textContent = 'Site Analysis'
  container.appendChild(header)

  const { auth } = store.getState()
  if (!auth.isAuthenticated) {
    container.innerHTML += '<p class="info-message">Please sign in to analyse site storage.</p>'
    return
  }

  // ─── Site picker ────────────────────────────────────────────────

  const controls = document.createElement('div')
  controls.className = 'controls-row'

  const siteSelect = document.createElement('select')
  siteSelect.className = 'select-input'
  siteSelect.innerHTML = '<option value="">-- Select a site --</option>'
  controls.appendChild(siteSelect)

  const loadSitesBtn = document.createElement('button')
  loadSitesBtn.className = 'btn btn-ghost btn-sm'
  loadSitesBtn.textContent = 'Load Sites'
  loadSitesBtn.addEventListener('click', loadSiteList)
  controls.appendChild(loadSitesBtn)

  container.appendChild(controls)

  // ─── Libraries panel ────────────────────────────────────────────

  const libPanel = document.createElement('section')
  libPanel.className = 'card hidden'
  container.appendChild(libPanel)

  // ─── Progress bar ───────────────────────────────────────────────

  const progressEl = document.createElement('div')
  progressEl.className = 'analysis-progress hidden'
  progressEl.innerHTML = `
    <div class="progress-spinner"></div>
    <div class="progress-details">
      <div class="progress-phase"></div>
      <div class="progress-bar-track"><div class="progress-bar-fill"></div></div>
      <div class="progress-counts"></div>
    </div>
  `
  container.appendChild(progressEl)
  const progressPhase = progressEl.querySelector('.progress-phase') as HTMLElement
  const progressFill = progressEl.querySelector('.progress-bar-fill') as HTMLElement
  const progressCounts = progressEl.querySelector('.progress-counts') as HTMLElement

  // ─── Results ────────────────────────────────────────────────────

  const resultsContainer = document.createElement('div')
  container.appendChild(resultsContainer)

  // ─── State ──────────────────────────────────────────────────────

  let currentSiteId = ''
  let currentSiteName = ''
  type DriveInfo = { id: string; name: string; usedBytes: number; totalBytes: number }
  let drives: DriveInfo[] = []
  const scannedLibs = new Map<string, LibraryInventory>()

  siteSelect.addEventListener('change', () => {
    if (siteSelect.value) loadLibraries(siteSelect.value)
    else {
      libPanel.classList.add('hidden')
      resultsContainer.innerHTML = ''
    }
  })

  // ─── Load site list ─────────────────────────────────────────────

  async function loadSiteList(): Promise<void> {
    let sites = store.getState().sites
    if (sites.length === 0) {
      loadSitesBtn.textContent = 'Loading...'
      sites = await fetchSiteStorage()
      loadSitesBtn.textContent = 'Load Sites'
    }
    siteSelect.innerHTML = '<option value="">-- Select a site --</option>'
    const sorted = [...sites].sort((a, b) => b.storageUsedInBytes - a.storageUsedInBytes)
    sorted.forEach((s) => {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = `${s.displayName} (${formatBytes(s.storageUsedInBytes)})`
      siteSelect.appendChild(opt)
    })
  }

  // ─── Load libraries for selected site ───────────────────────────

  async function loadLibraries(siteId: string): Promise<void> {
    const sites = store.getState().sites
    const site = sites.find((s) => s.id === siteId)
    currentSiteId = siteId
    currentSiteName = site?.displayName ?? 'Site'
    scannedLibs.clear()
    resultsContainer.innerHTML = ''

    libPanel.classList.remove('hidden')
    libPanel.innerHTML = '<p style="color:var(--color-text-muted)">Loading libraries...</p>'

    try {
      drives = await fetchSiteDrives(siteId)
      renderLibraryList()
      // Check for cached Excel files
      await checkCachedExcels()
    } catch (err) {
      libPanel.innerHTML = `<p class="error-message">Failed to load libraries: ${(err as Error).message}</p>`
    }
  }

  // ─── Render library list with checkboxes ────────────────────────

  function renderLibraryList(): void {
    libPanel.innerHTML = ''

    const headerRow = document.createElement('div')
    headerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;'
    headerRow.innerHTML = `<h2 style="margin:0;">Document Libraries</h2>`

    const btnGroup = document.createElement('div')
    btnGroup.style.cssText = 'display:flex;gap:8px;'

    const scanBtn = document.createElement('button')
    scanBtn.className = 'btn btn-primary btn-sm'
    scanBtn.textContent = 'Scan Selected'
    scanBtn.addEventListener('click', scanSelected)
    btnGroup.appendChild(scanBtn)

    const selectAllBtn = document.createElement('button')
    selectAllBtn.className = 'btn btn-ghost btn-sm'
    selectAllBtn.textContent = 'Select All'
    selectAllBtn.addEventListener('click', () => {
      libPanel.querySelectorAll<HTMLInputElement>('.lib-checkbox').forEach((cb) => { cb.checked = true })
    })
    btnGroup.appendChild(selectAllBtn)

    headerRow.appendChild(btnGroup)
    libPanel.appendChild(headerRow)

    const table = document.createElement('table')
    table.className = 'data-table'
    table.innerHTML = `<thead><tr>
      <th style="width:32px;"></th>
      <th>Library</th>
      <th>Used</th>
      <th>Quota</th>
      <th>Cache</th>
      <th></th>
    </tr></thead>`

    const tbody = document.createElement('tbody')
    for (const drv of drives) {
      const tr = document.createElement('tr')
      tr.dataset.driveId = drv.id

      const cbTd = document.createElement('td')
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.className = 'lib-checkbox'
      cb.dataset.driveId = drv.id
      cbTd.appendChild(cb)
      tr.appendChild(cbTd)

      const nameTd = document.createElement('td')
      nameTd.style.fontWeight = '600'
      nameTd.textContent = drv.name
      tr.appendChild(nameTd)

      const usedTd = document.createElement('td')
      usedTd.textContent = formatBytes(drv.usedBytes)
      tr.appendChild(usedTd)

      const quotaTd = document.createElement('td')
      quotaTd.textContent = formatBytes(drv.totalBytes)
      tr.appendChild(quotaTd)

      const cacheTd = document.createElement('td')
      cacheTd.className = 'lib-cache-status'
      cacheTd.dataset.driveId = drv.id
      cacheTd.style.cssText = 'font-size:0.78rem;color:var(--color-text-muted);'
      cacheTd.textContent = '—'
      tr.appendChild(cacheTd)

      const actionTd = document.createElement('td')
      actionTd.className = 'lib-actions'
      actionTd.dataset.driveId = drv.id
      tr.appendChild(actionTd)

      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    libPanel.appendChild(table)
  }

  // ─── Check for cached Excel files ───────────────────────────────

  async function checkCachedExcels(): Promise<void> {
    if (!SP_SITE_ID) return
    const client = getGraphClient()

    try {
      const resp = await client
        .api(`/sites/${SP_SITE_ID}/drive/root:/${FOLDER_PATH}:/children`)
        .select('name,lastModifiedDateTime')
        .get()

      const fileMap = new Map<string, string>()
      for (const item of resp.value ?? []) {
        if ((item.name as string).endsWith('.xlsx')) {
          fileMap.set(item.name as string, item.lastModifiedDateTime as string)
        }
      }

      for (const drv of drives) {
        const fileName = libraryExcelFileName(currentSiteName, drv.name)
        const cacheTd = libPanel.querySelector<HTMLElement>(`.lib-cache-status[data-drive-id="${drv.id}"]`)
        const actionTd = libPanel.querySelector<HTMLElement>(`.lib-actions[data-drive-id="${drv.id}"]`)
        if (fileMap.has(fileName) && cacheTd) {
          const date = fileMap.get(fileName)!
          cacheTd.innerHTML = `<span style="color:var(--color-success);">Cached: ${formatDate(date)}</span>`

          // Add load + download buttons
          if (actionTd) {
            const loadBtn = document.createElement('button')
            loadBtn.className = 'btn btn-ghost btn-sm'
            loadBtn.textContent = 'Load'
            loadBtn.addEventListener('click', () => loadCachedLibrary(drv))
            actionTd.appendChild(loadBtn)

            const dlBtn = document.createElement('button')
            dlBtn.className = 'btn btn-ghost btn-sm'
            dlBtn.textContent = 'Download'
            dlBtn.addEventListener('click', async () => {
              const lib = scannedLibs.get(drv.id) ?? await loadLibraryFromCache(drv)
              if (lib) await downloadLibraryExcel(currentSiteName, lib)
            })
            actionTd.appendChild(dlBtn)
          }
        }
      }
    } catch {
      // Folder may not exist yet
    }
  }

  async function loadLibraryFromCache(drv: DriveInfo): Promise<LibraryInventory | null> {
    const lib = await loadLibraryExcelFromSP(currentSiteName, drv.name)
    if (lib) {
      lib.driveId = drv.id
      lib.usedBytes = drv.usedBytes
      lib.totalBytes = drv.totalBytes
      scannedLibs.set(drv.id, lib)
    }
    return lib
  }

  async function loadCachedLibrary(drv: DriveInfo): Promise<void> {
    const cacheTd = libPanel.querySelector<HTMLElement>(`.lib-cache-status[data-drive-id="${drv.id}"]`)
    if (cacheTd) cacheTd.textContent = 'Loading...'
    const lib = await loadLibraryFromCache(drv)
    if (lib) {
      if (cacheTd) cacheTd.innerHTML = `<span style="color:var(--color-success);">Loaded: ${lib.files.length} files</span>`
      renderAllResults()
    } else {
      if (cacheTd) cacheTd.textContent = 'Load failed'
    }
  }

  // ─── Scan selected libraries ────────────────────────────────────

  async function scanSelected(): Promise<void> {
    const checked = Array.from(libPanel.querySelectorAll<HTMLInputElement>('.lib-checkbox:checked'))
    if (checked.length === 0) return

    const selectedDrives = checked
      .map((cb) => drives.find((d) => d.id === cb.dataset.driveId))
      .filter((d): d is DriveInfo => !!d)

    for (let i = 0; i < selectedDrives.length; i++) {
      const drv = selectedDrives[i]
      const cacheTd = libPanel.querySelector<HTMLElement>(`.lib-cache-status[data-drive-id="${drv.id}"]`)

      // Show progress
      progressEl.classList.remove('hidden')
      if (cacheTd) cacheTd.innerHTML = `<span style="color:var(--color-primary);">Scanning...</span>`

      try {
        const lib = await scanLibrary(
          drv.id, drv.name, drv.usedBytes, drv.totalBytes,
          (p: InventoryProgress) => {
            progressPhase.textContent = `[${i + 1}/${selectedDrives.length}] ${p.message}`
            const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0
            progressFill.style.width = `${pct}%`
            progressCounts.textContent = p.total > 0 ? `${p.current} / ${p.total}` : ''
          },
        )

        scannedLibs.set(drv.id, lib)

        // Save Excel immediately
        if (cacheTd) cacheTd.innerHTML = `<span style="color:var(--color-primary);">Saving Excel...</span>`
        try {
          await saveLibraryExcelToSP(currentSiteName, lib)
          if (cacheTd) cacheTd.innerHTML = `<span style="color:var(--color-success);">${lib.files.length} files saved</span>`
        } catch {
          if (cacheTd) cacheTd.innerHTML = `<span style="color:var(--color-warning);">${lib.files.length} files (save failed)</span>`
        }

        // Update tree after each library completes
        renderAllResults()
      } catch (err) {
        if (cacheTd) cacheTd.innerHTML = `<span style="color:var(--color-danger);">Failed</span>`
        console.error(`[Analysis] Failed to scan ${drv.name}`, err)
      }
    }

    progressEl.classList.add('hidden')
  }

  // ─── Render all scanned results ─────────────────────────────────

  function renderAllResults(): void {
    resultsContainer.innerHTML = ''

    if (scannedLibs.size === 0) return

    // Overview stats
    const overview = document.createElement('section')
    overview.className = 'card'

    const totalFiles = Array.from(scannedLibs.values()).reduce((s, l) => s + l.files.length, 0)
    const totalVersions = Array.from(scannedLibs.values()).reduce(
      (s, l) => s + l.files.reduce((fs, f) => fs + f.versions.length, 0), 0,
    )
    const totalUsed = Array.from(scannedLibs.values()).reduce((s, l) => s + l.usedBytes, 0)
    const totalQuota = Array.from(scannedLibs.values()).reduce((s, l) => s + l.totalBytes, 0)
    const totalVersionSize = Array.from(scannedLibs.values()).reduce(
      (s, l) => s + l.files.reduce((fs, f) => fs + f.versions.reduce((vs, v) => vs + v.size, 0), 0), 0,
    )

    overview.innerHTML = `<h2>${esc(currentSiteName)}</h2>`
    if (totalQuota > 0) renderStorageBar(overview, totalUsed, totalQuota)

    const stats = document.createElement('div')
    stats.className = 'stats-grid'
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-value">${scannedLibs.size}</div><div class="stat-label">Libraries</div></div>
      <div class="stat-card"><div class="stat-value">${totalFiles.toLocaleString()}</div><div class="stat-label">Files</div></div>
      <div class="stat-card"><div class="stat-value">${totalVersions.toLocaleString()}</div><div class="stat-label">Versions</div></div>
      <div class="stat-card"><div class="stat-value">${formatBytes(totalVersionSize)}</div><div class="stat-label">Version Storage</div></div>
    `
    overview.appendChild(stats)
    resultsContainer.appendChild(overview)

    // Tree table
    const treeSection = document.createElement('section')
    treeSection.className = 'card'
    treeSection.style.cssText = 'overflow-x:auto;padding:12px;'
    treeSection.innerHTML = '<h2>File Inventory</h2>'

    const inventory: SiteFileInventory = {
      siteId: currentSiteId,
      siteName: currentSiteName,
      libraries: Array.from(scannedLibs.values()),
      lastScanned: new Date().toISOString(),
    }
    renderFileTreeTable(treeSection, inventory)
    resultsContainer.appendChild(treeSection)
  }

  // ─── Initial load ───────────────────────────────────────────────

  const sites = store.getState().sites
  if (sites.length > 0) {
    siteSelect.innerHTML = '<option value="">-- Select a site --</option>'
    const sorted = [...sites].sort((a, b) => b.storageUsedInBytes - a.storageUsedInBytes)
    sorted.forEach((s) => {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = `${s.displayName} (${formatBytes(s.storageUsedInBytes)})`
      siteSelect.appendChild(opt)
    })
  } else {
    loadSiteList()
  }

  // Pre-select from dashboard
  const selectedSiteId = store.getState().selectedSiteId
  if (selectedSiteId) {
    siteSelect.value = selectedSiteId
    store.dispatch({ type: 'SET_SELECTED_SITE', payload: null })
    loadLibraries(selectedSiteId)
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('analysis-progress-styles')) return
  const style = document.createElement('style')
  style.id = 'analysis-progress-styles'
  style.textContent = `
    .analysis-progress {
      display: flex; align-items: center; gap: 16px;
      padding: 20px 24px; background: white; border: 1px solid var(--color-border);
      border-radius: 4px; margin-bottom: 16px;
    }
    .analysis-progress.hidden { display: none; }
    .progress-spinner {
      width: 32px; height: 32px; flex-shrink: 0;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: progress-spin 0.8s linear infinite;
    }
    @keyframes progress-spin { to { transform: rotate(360deg); } }
    .progress-details { flex: 1; min-width: 0; }
    .progress-phase {
      font-size: 0.875rem; color: var(--color-text); font-weight: 500;
      margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .progress-bar-track {
      height: 8px; background: var(--color-border); border-radius: 4px;
      overflow: hidden; margin-bottom: 4px;
    }
    .progress-bar-fill {
      height: 100%; background: var(--color-primary); border-radius: 4px;
      transition: width 0.2s ease; width: 0%;
    }
    .progress-counts {
      font-size: 0.75rem; color: var(--color-text-muted); text-align: right;
    }
    .lib-checkbox { width: 16px; height: 16px; cursor: pointer; }
    .lib-actions { display: flex; gap: 4px; }
  `
  document.head.appendChild(style)
}
