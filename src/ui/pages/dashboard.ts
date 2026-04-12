import { store } from '../../store/store'
import { fetchSiteStorage, buildTenantSummary } from '../../services/storageService'
import { loadDashboardCache, saveDashboardCache } from '../../services/cacheService'
import { renderStorageBar } from '../components/storageBar'
import { formatBytes, formatDate } from '../../utils/format'
import type { SiteStorageInfo, TenantStorageSummary } from '../../types'

export function renderDashboard(container: HTMLElement): void {
  container.innerHTML = ''

  const header = document.createElement('h1')
  header.textContent = 'Tenant Storage Dashboard'
  container.appendChild(header)

  const { auth } = store.getState()
  if (!auth.isAuthenticated) {
    container.innerHTML += '<p class="info-message">Please sign in to view your tenant storage analytics.</p>'
    return
  }

  // Controls
  const controls = document.createElement('div')
  controls.className = 'controls-row'

  const refreshBtn = document.createElement('button')
  refreshBtn.className = 'btn btn-primary'
  refreshBtn.textContent = 'Refresh from Graph API'
  refreshBtn.addEventListener('click', () => refreshFromGraph())
  controls.appendChild(refreshBtn)

  const cacheInfo = document.createElement('span')
  cacheInfo.className = 'cache-info'
  cacheInfo.style.cssText = 'font-size:0.82rem;color:var(--color-text-muted);margin-left:8px;'
  controls.appendChild(cacheInfo)

  container.appendChild(controls)

  const summarySection = document.createElement('section')
  summarySection.className = 'card'
  summarySection.innerHTML = '<h2>Tenant Overview</h2><p style="color:var(--color-text-muted)">Loading cached data...</p>'
  container.appendChild(summarySection)

  const sitesSection = document.createElement('section')
  sitesSection.className = 'card'
  sitesSection.innerHTML = '<h2>All Sites</h2>'
  container.appendChild(sitesSection)

  // ─── Render helpers ───────────────────────────────────────────────

  function renderSummary(summary: TenantStorageSummary): void {
    summarySection.innerHTML = '<h2>Tenant Overview</h2>'
    renderStorageBar(
      summarySection,
      summary.usedStorageInBytes,
      summary.totalStorageInBytes,
      'Total Tenant Storage',
    )

    const stats = document.createElement('div')
    stats.className = 'stats-grid'
    stats.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${summary.siteCount}</div>
        <div class="stat-label">Sites</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatBytes(summary.usedStorageInBytes)}</div>
        <div class="stat-label">Used</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatBytes(summary.availableStorageInBytes)}</div>
        <div class="stat-label">Available</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatDate(summary.lastRefreshed)}</div>
        <div class="stat-label">Last Refreshed</div>
      </div>
    `
    summarySection.appendChild(stats)
  }

  function renderSitesTable(sites: SiteStorageInfo[]): void {
    const sorted = [...sites].sort((a, b) => b.storageUsedInBytes - a.storageUsedInBytes)

    sitesSection.innerHTML = '<h2>All Sites</h2>'
    const table = document.createElement('table')
    table.className = 'data-table'
    table.innerHTML = `
      <thead>
        <tr>
          <th>Site</th>
          <th>Used</th>
          <th>Allocated</th>
          <th>Usage %</th>
          <th>Last Modified</th>
          <th></th>
        </tr>
      </thead>
    `
    const tbody = document.createElement('tbody')
    sorted.forEach((site) => {
      const pct = site.storageUsedPercentage
      const pctColor = pct > 90 ? 'var(--color-danger)' : pct > 70 ? 'var(--color-warning)' : 'var(--color-text)'
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td><a href="${escHtml(site.webUrl)}" target="_blank" rel="noopener">${escHtml(site.displayName)}</a></td>
        <td>${formatBytes(site.storageUsedInBytes)}</td>
        <td>${formatBytes(site.storageAllocatedInBytes)}</td>
        <td style="color:${pctColor};font-weight:600">${pct.toFixed(1)}%</td>
        <td>${formatDate(site.lastModifiedDateTime)}</td>
        <td></td>
      `
      // Analyse link in last column
      const analyseBtn = document.createElement('button')
      analyseBtn.className = 'btn btn-ghost btn-sm'
      analyseBtn.textContent = 'Analyse'
      analyseBtn.addEventListener('click', () => {
        store.dispatch({ type: 'SET_SELECTED_SITE', payload: site.id })
        store.dispatch({ type: 'SET_ROUTE', payload: 'sites' })
      })
      tr.querySelector('td:last-child')!.appendChild(analyseBtn)
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    sitesSection.appendChild(table)
  }

  // ─── Data loading ─────────────────────────────────────────────────

  async function loadFromCache(): Promise<boolean> {
    try {
      const cache = await loadDashboardCache()
      if (cache && cache.sites.length > 0) {
        cacheInfo.textContent = `Cached: ${formatDate(cache.lastRefreshed)}`
        store.dispatch({ type: 'SET_SITES', payload: cache.sites })
        store.dispatch({ type: 'SET_TENANT_SUMMARY', payload: cache.summary })
        renderSummary(cache.summary)
        renderSitesTable(cache.sites)
        return true
      }
    } catch {
      // Cache miss — will refresh from Graph
    }
    return false
  }

  async function refreshFromGraph(): Promise<void> {
    refreshBtn.disabled = true
    refreshBtn.textContent = 'Fetching sites...'
    cacheInfo.textContent = ''

    try {
      const sites = await fetchSiteStorage()
      const summary = buildTenantSummary(sites)

      renderSummary(summary)
      renderSitesTable(sites)

      // Save to SP list cache
      refreshBtn.textContent = 'Saving to cache...'
      const cacheData = {
        summary,
        sites,
        lastRefreshed: summary.lastRefreshed,
      }
      try {
        await saveDashboardCache(cacheData)
        cacheInfo.textContent = `Cached: ${formatDate(summary.lastRefreshed)}`
      } catch {
        cacheInfo.textContent = 'Cache save failed'
      }
    } catch {
      summarySection.innerHTML =
        '<h2>Tenant Overview</h2><p class="error-message">Failed to load data. Check permissions and try again.</p>'
    } finally {
      refreshBtn.disabled = false
      refreshBtn.textContent = 'Refresh from Graph API'
    }
  }

  // ─── Initial load ─────────────────────────────────────────────────

  // If we already have sites in the store, render immediately
  const existing = store.getState()
  if (existing.sites.length > 0 && existing.tenantSummary) {
    cacheInfo.textContent = `In memory`
    renderSummary(existing.tenantSummary)
    renderSitesTable(existing.sites)
  } else {
    // Try loading from SP list cache first
    loadFromCache().then((loaded) => {
      if (!loaded) {
        summarySection.innerHTML =
          '<h2>Tenant Overview</h2><p style="color:var(--color-text-muted)">Click "Refresh from Graph API" to load site data.</p>'
      }
    })
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
