import { store } from '../../store/store'
import { fetchSiteStorage } from '../../services/storageService'
import { fetchSiteFileInventory } from '../../services/inventoryService'
import { exportInventoryToExcel } from '../../services/inventoryExport'
import { loadSiteAnalysis, saveSiteAnalysis } from '../../services/fileStorageService'
import { renderStorageBar } from '../components/storageBar'
import { renderFileTreeTable } from '../components/fileTreeTable'
import { formatBytes, formatDate } from '../../utils/format'
import type { SiteFileInventory, SiteAnalysisData } from '../../types'

export function renderSiteAnalysis(container: HTMLElement): void {
  container.innerHTML = ''

  const header = document.createElement('h1')
  header.textContent = 'Site Analysis'
  container.appendChild(header)

  const { auth } = store.getState()
  if (!auth.isAuthenticated) {
    container.innerHTML += '<p class="info-message">Please sign in to analyse site storage.</p>'
    return
  }

  // ─── Site picker controls ───────────────────────────────────────

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

  const analyseBtn = document.createElement('button')
  analyseBtn.className = 'btn btn-primary'
  analyseBtn.textContent = 'Analyse Site'
  analyseBtn.disabled = true
  analyseBtn.addEventListener('click', () => {
    if (siteSelect.value) runAnalysis(siteSelect.value)
  })
  controls.appendChild(analyseBtn)

  const exportBtn = document.createElement('button')
  exportBtn.className = 'btn btn-secondary'
  exportBtn.textContent = 'Export to Excel'
  exportBtn.disabled = true
  exportBtn.style.display = 'none'
  controls.appendChild(exportBtn)

  const statusSpan = document.createElement('span')
  statusSpan.style.cssText = 'font-size:0.82rem;color:var(--color-text-muted);margin-left:8px;'
  controls.appendChild(statusSpan)

  container.appendChild(controls)

  // ─── Content sections ───────────────────────────────────────────

  const progressSection = document.createElement('div')
  progressSection.style.cssText = 'padding:12px 0;color:var(--color-text-muted);font-size:0.85rem;'
  container.appendChild(progressSection)

  const overviewSection = document.createElement('section')
  overviewSection.className = 'card hidden'
  container.appendChild(overviewSection)

  const treeContainer = document.createElement('section')
  treeContainer.className = 'card hidden'
  treeContainer.style.cssText = 'overflow-x:auto;padding:12px;'
  container.appendChild(treeContainer)

  siteSelect.addEventListener('change', () => {
    analyseBtn.disabled = !siteSelect.value
    exportBtn.style.display = 'none'
    exportBtn.disabled = true
    if (siteSelect.value) tryLoadCached(siteSelect.value)
  })

  // ─── Load site list ─────────────────────────────────────────────

  async function loadSiteList(): Promise<void> {
    let sites = store.getState().sites
    if (sites.length === 0) {
      loadSitesBtn.textContent = 'Loading...'
      sites = await fetchSiteStorage()
      loadSitesBtn.textContent = 'Load Sites'
    }
    populateSelect(sites)
  }

  function populateSelect(sites: Array<{ id: string; displayName: string; storageUsedInBytes: number }>): void {
    siteSelect.innerHTML = '<option value="">-- Select a site --</option>'
    const sorted = [...sites].sort((a, b) => b.storageUsedInBytes - a.storageUsedInBytes)
    sorted.forEach((site) => {
      const opt = document.createElement('option')
      opt.value = site.id
      opt.textContent = `${site.displayName} (${formatBytes(site.storageUsedInBytes)})`
      siteSelect.appendChild(opt)
    })
  }

  // ─── Try loading cached analysis ────────────────────────────────

  async function tryLoadCached(siteId: string): Promise<void> {
    statusSpan.textContent = 'Checking cache...'
    const cached = await loadSiteAnalysis(siteId)
    if (cached && 'libraries' in cached) {
      // It's a full inventory (new format)
      const inv = cached as unknown as SiteFileInventory
      statusSpan.textContent = `Cached: ${formatDate(inv.lastScanned ?? (cached as SiteAnalysisData).lastAnalysed)}`

      renderResults(inv)
    } else if (cached) {
      statusSpan.textContent = `Old cache format — click Analyse to rescan`
      clearSections()
    } else {
      statusSpan.textContent = 'No cached data — click Analyse'
      clearSections()
    }
  }

  function clearSections(): void {
    overviewSection.classList.add('hidden')
    overviewSection.innerHTML = ''
    treeContainer.classList.add('hidden')
    treeContainer.innerHTML = ''
    progressSection.textContent = ''
    exportBtn.style.display = 'none'

  }

  // ─── Run full analysis ──────────────────────────────────────────

  async function runAnalysis(siteId: string): Promise<void> {
    const sites = store.getState().sites
    const site = sites.find((s) => s.id === siteId)
    if (!site) return

    analyseBtn.disabled = true
    analyseBtn.textContent = 'Analysing...'
    exportBtn.style.display = 'none'
    statusSpan.textContent = ''
    clearSections()

    try {
      const inventory = await fetchSiteFileInventory(
        siteId,
        site.displayName,
        (msg) => { progressSection.textContent = msg },
      )


      progressSection.textContent = ''
      renderResults(inventory)

      // Save to Documents/SPStorage/
      statusSpan.textContent = 'Saving...'
      try {
        // Save as the new inventory format (compatible with SiteAnalysisData via shared fields)
        await saveSiteAnalysis(inventory as unknown as SiteAnalysisData)
        statusSpan.textContent = `Saved: ${formatDate(inventory.lastScanned)}`
      } catch {
        statusSpan.textContent = 'Save failed'
      }
    } catch (err) {
      progressSection.textContent = ''
      overviewSection.classList.remove('hidden')
      overviewSection.innerHTML = `<p class="error-message">Analysis failed: ${(err as Error).message}</p>`
    } finally {
      analyseBtn.disabled = false
      analyseBtn.textContent = 'Analyse Site'
    }
  }

  // ─── Render results ─────────────────────────────────────────────

  function renderResults(inventory: SiteFileInventory): void {
    // Overview card
    overviewSection.classList.remove('hidden')
    overviewSection.innerHTML = ''

    const h2 = document.createElement('h2')
    h2.textContent = inventory.siteName
    overviewSection.appendChild(h2)

    // Total storage bar from all libraries
    const totalUsed = inventory.libraries.reduce((s, l) => s + l.usedBytes, 0)
    const totalQuota = inventory.libraries.reduce((s, l) => s + l.totalBytes, 0)
    if (totalQuota > 0) {
      renderStorageBar(overviewSection, totalUsed, totalQuota)
    }

    const totalFiles = inventory.libraries.reduce((s, l) => s + l.files.length, 0)
    const totalVersions = inventory.libraries.reduce(
      (s, l) => s + l.files.reduce((fs, f) => fs + f.versions.length, 0), 0,
    )
    const totalVersionSize = inventory.libraries.reduce(
      (s, l) => s + l.files.reduce((fs, f) => fs + f.versions.reduce((vs, v) => vs + v.size, 0), 0), 0,
    )

    const stats = document.createElement('div')
    stats.className = 'stats-grid'
    stats.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${inventory.libraries.length}</div>
        <div class="stat-label">Libraries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalFiles.toLocaleString()}</div>
        <div class="stat-label">Files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalVersions.toLocaleString()}</div>
        <div class="stat-label">Total Versions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatBytes(totalVersionSize)}</div>
        <div class="stat-label">Version Storage</div>
      </div>
    `
    overviewSection.appendChild(stats)

    // Tree table
    treeContainer.classList.remove('hidden')
    treeContainer.innerHTML = '<h2>File Inventory</h2>'
    renderFileTreeTable(treeContainer, inventory)

    // Enable Excel export
    exportBtn.style.display = ''
    exportBtn.disabled = false
    exportBtn.onclick = async () => {
      exportBtn.disabled = true
      exportBtn.textContent = 'Exporting...'
      try {
        await exportInventoryToExcel(inventory)
        exportBtn.textContent = 'Export to Excel'
      } catch {
        exportBtn.textContent = 'Export failed'
        setTimeout(() => { exportBtn.textContent = 'Export to Excel' }, 2000)
      }
      exportBtn.disabled = false
    }
  }

  // ─── Initial load ─────────────────────────────────────────────────

  const sites = store.getState().sites
  if (sites.length > 0) {
    populateSelect(sites)
  } else {
    loadSiteList()
  }

  // If a site was pre-selected from the dashboard
  const selectedSiteId = store.getState().selectedSiteId
  if (selectedSiteId) {
    siteSelect.value = selectedSiteId
    analyseBtn.disabled = false
    store.dispatch({ type: 'SET_SELECTED_SITE', payload: null })
    tryLoadCached(selectedSiteId)
  }
}
