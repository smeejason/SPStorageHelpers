import { store } from '../../store/store'
import {
  fetchSiteStorage,
  fetchLargeFiles,
  fetchRecycleBinItems,
} from '../../services/storageService'
import { loadSiteAnalysis, saveSiteAnalysis } from '../../services/fileStorageService'
import { renderStorageBar } from '../components/storageBar'
import { formatBytes, formatDate } from '../../utils/format'
import { getGraphClient } from '../../services/graphClient'
import type { SiteAnalysisData, DriveStorageInfo } from '../../types'

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

  const cacheStatus = document.createElement('span')
  cacheStatus.style.cssText = 'font-size:0.82rem;color:var(--color-text-muted);margin-left:8px;'
  controls.appendChild(cacheStatus)

  container.appendChild(controls)

  // ─── Content sections ───────────────────────────────────────────

  const detailSection = document.createElement('section')
  detailSection.className = 'card'
  container.appendChild(detailSection)

  const drivesSection = document.createElement('section')
  drivesSection.className = 'card hidden'
  container.appendChild(drivesSection)

  const largeFilesSection = document.createElement('section')
  largeFilesSection.className = 'card hidden'
  container.appendChild(largeFilesSection)

  const recycleBinSection = document.createElement('section')
  recycleBinSection.className = 'card hidden'
  container.appendChild(recycleBinSection)

  siteSelect.addEventListener('change', () => {
    analyseBtn.disabled = !siteSelect.value
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
    cacheStatus.textContent = 'Checking cache...'
    const cached = await loadSiteAnalysis(siteId)
    if (cached) {
      cacheStatus.textContent = `Cached: ${formatDate(cached.lastAnalysed)}`
      renderAnalysis(cached)
    } else {
      cacheStatus.textContent = 'No cached data — click Analyse'
      clearSections()
    }
  }

  function clearSections(): void {
    detailSection.innerHTML = ''
    drivesSection.classList.add('hidden')
    largeFilesSection.classList.add('hidden')
    recycleBinSection.classList.add('hidden')
  }

  // ─── Run full analysis ──────────────────────────────────────────

  async function runAnalysis(siteId: string): Promise<void> {
    const sites = store.getState().sites
    const site = sites.find((s) => s.id === siteId)
    if (!site) return

    analyseBtn.disabled = true
    analyseBtn.textContent = 'Analysing...'
    cacheStatus.textContent = ''

    try {
      // Fetch drive breakdown
      detailSection.innerHTML = '<p style="color:var(--color-text-muted)">Fetching drive details...</p>'
      const driveBreakdown = await fetchDriveBreakdown(siteId)

      // Fetch large files
      detailSection.innerHTML = '<p style="color:var(--color-text-muted)">Scanning large files...</p>'
      const largeFiles = await fetchLargeFiles(siteId)

      // Fetch recycle bin
      detailSection.innerHTML = '<p style="color:var(--color-text-muted)">Checking recycle bin...</p>'
      let recycleBinItems: Awaited<ReturnType<typeof fetchRecycleBinItems>> = []
      try {
        recycleBinItems = await fetchRecycleBinItems(siteId)
      } catch {
        // Recycle bin access may be restricted
      }

      // Build analysis data
      const analysisData: SiteAnalysisData = {
        siteId: site.id,
        siteName: site.displayName,
        siteUrl: site.webUrl,
        storageUsedInBytes: site.storageUsedInBytes,
        storageAllocatedInBytes: site.storageAllocatedInBytes,
        largeFiles,
        recycleBinItems,
        driveBreakdown,
        lastAnalysed: new Date().toISOString(),
      }

      // Render
      renderAnalysis(analysisData)

      // Save to Documents/SPStorage/
      cacheStatus.textContent = 'Saving analysis...'
      try {
        await saveSiteAnalysis(analysisData)
        cacheStatus.textContent = `Saved: ${formatDate(analysisData.lastAnalysed)}`
      } catch {
        cacheStatus.textContent = 'Save failed'
      }
    } catch (err) {
      detailSection.innerHTML = `<p class="error-message">Analysis failed: ${(err as Error).message}</p>`
    } finally {
      analyseBtn.disabled = false
      analyseBtn.textContent = 'Analyse Site'
    }
  }

  // ─── Render analysis results ────────────────────────────────────

  function renderAnalysis(data: SiteAnalysisData): void {
    // Site overview card
    detailSection.innerHTML = ''
    const h2 = document.createElement('h2')
    h2.textContent = data.siteName
    detailSection.appendChild(h2)
    renderStorageBar(detailSection, data.storageUsedInBytes, data.storageAllocatedInBytes)

    const meta = document.createElement('div')
    meta.className = 'meta-info'
    meta.innerHTML = `
      <p><strong>URL:</strong> <a href="${escHtml(data.siteUrl)}" target="_blank" rel="noopener">${escHtml(data.siteUrl)}</a></p>
      <p><strong>Last Analysed:</strong> ${formatDate(data.lastAnalysed)}</p>
    `
    detailSection.appendChild(meta)

    // Drive breakdown
    if (data.driveBreakdown.length > 0) {
      drivesSection.classList.remove('hidden')
      drivesSection.innerHTML = '<h2>Storage by Library</h2>'
      const table = document.createElement('table')
      table.className = 'data-table'
      table.innerHTML = `<thead><tr><th>Library</th><th>Used</th><th>Total</th><th>Items</th></tr></thead>`
      const tbody = document.createElement('tbody')
      data.driveBreakdown
        .sort((a, b) => b.usedBytes - a.usedBytes)
        .forEach((d) => {
          const tr = document.createElement('tr')
          tr.innerHTML = `
            <td>${escHtml(d.driveName)}</td>
            <td>${formatBytes(d.usedBytes)}</td>
            <td>${formatBytes(d.totalBytes)}</td>
            <td>${d.itemCount}</td>
          `
          tbody.appendChild(tr)
        })
      table.appendChild(tbody)
      drivesSection.appendChild(table)
    } else {
      drivesSection.classList.add('hidden')
    }

    // Large files
    largeFilesSection.classList.remove('hidden')
    largeFilesSection.innerHTML = '<h2>Large Files (&gt; 10 MB)</h2>'
    if (data.largeFiles.length === 0) {
      largeFilesSection.innerHTML += '<p>No large files found.</p>'
    } else {
      const totalLargeSize = data.largeFiles.reduce((s, f) => s + f.size, 0)
      largeFilesSection.innerHTML += `<p><strong>${data.largeFiles.length} files</strong> totalling <strong>${formatBytes(totalLargeSize)}</strong></p>`
      const table = document.createElement('table')
      table.className = 'data-table'
      table.innerHTML = `<thead><tr><th>File</th><th>Size</th><th>Library</th><th>Modified</th><th>Modified By</th></tr></thead>`
      const tbody = document.createElement('tbody')
      data.largeFiles.forEach((f) => {
        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td><a href="${escHtml(f.webUrl)}" target="_blank" rel="noopener">${escHtml(f.name)}</a></td>
          <td>${formatBytes(f.size)}</td>
          <td>${escHtml(f.libraryName)}</td>
          <td>${formatDate(f.lastModifiedDateTime)}</td>
          <td>${escHtml(f.lastModifiedBy)}</td>
        `
        tbody.appendChild(tr)
      })
      table.appendChild(tbody)
      largeFilesSection.appendChild(table)
    }

    // Recycle bin
    recycleBinSection.classList.remove('hidden')
    recycleBinSection.innerHTML = '<h2>Recycle Bin</h2>'
    if (data.recycleBinItems.length === 0) {
      recycleBinSection.innerHTML += '<p>Recycle bin is empty.</p>'
    } else {
      const totalRecycleSize = data.recycleBinItems.reduce((s, item) => s + item.size, 0)
      recycleBinSection.innerHTML += `<p><strong>${data.recycleBinItems.length} items</strong> totalling <strong>${formatBytes(totalRecycleSize)}</strong></p>`
      const table = document.createElement('table')
      table.className = 'data-table'
      table.innerHTML = `<thead><tr><th>Name</th><th>Size</th><th>Deleted</th><th>Type</th></tr></thead>`
      const tbody = document.createElement('tbody')
      data.recycleBinItems.slice(0, 50).forEach((item) => {
        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td>${escHtml(item.title)}</td>
          <td>${formatBytes(item.size)}</td>
          <td>${formatDate(item.deletedDateTime)}</td>
          <td>${escHtml(item.itemType)}</td>
        `
        tbody.appendChild(tr)
      })
      table.appendChild(tbody)
      recycleBinSection.appendChild(table)
    }
  }

  // ─── Fetch drive breakdown ──────────────────────────────────────

  async function fetchDriveBreakdown(siteId: string): Promise<DriveStorageInfo[]> {
    const client = getGraphClient()
    const drivesResp = await client
      .api(`/sites/${siteId}/drives`)
      .select('id,name,quota')
      .get()

    const breakdown: DriveStorageInfo[] = []
    for (const drive of drivesResp.value ?? []) {
      const q = drive.quota ?? {}
      breakdown.push({
        driveId: drive.id,
        driveName: drive.name ?? 'Unnamed',
        usedBytes: q.used ?? 0,
        totalBytes: q.total ?? 0,
        itemCount: q.fileCount ?? 0,
      })
    }
    return breakdown
  }

  // ─── Initial load ─────────────────────────────────────────────────

  const sites = store.getState().sites
  if (sites.length > 0) {
    populateSelect(sites)
  } else {
    loadSiteList()
  }

  // If a site was pre-selected from the dashboard, select it and load cached data
  const selectedSiteId = store.getState().selectedSiteId
  if (selectedSiteId) {
    siteSelect.value = selectedSiteId
    analyseBtn.disabled = false
    store.dispatch({ type: 'SET_SELECTED_SITE', payload: null })
    tryLoadCached(selectedSiteId)
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
