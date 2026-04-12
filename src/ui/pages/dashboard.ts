import { store } from '../../store/store';
import { fetchSiteStorage, buildTenantSummary } from '../../services/storageService';
import { renderStorageBar } from '../components/storageBar';
import { formatBytes, formatDate } from '../../utils/format';

export function renderDashboard(container: HTMLElement): void {
  container.innerHTML = '';

  const header = document.createElement('h1');
  header.textContent = 'Tenant Storage Dashboard';
  container.appendChild(header);

  const { auth } = store.getState();
  if (!auth.isAuthenticated) {
    const msg = document.createElement('p');
    msg.className = 'info-message';
    msg.textContent = 'Please sign in to view your tenant storage analytics.';
    container.appendChild(msg);
    return;
  }

  const summarySection = document.createElement('section');
  summarySection.className = 'card';
  summarySection.innerHTML = '<h2>Tenant Overview</h2>';
  container.appendChild(summarySection);

  const topSitesSection = document.createElement('section');
  topSitesSection.className = 'card';
  topSitesSection.innerHTML = '<h2>Top Sites by Storage Usage</h2>';
  container.appendChild(topSitesSection);

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn btn-primary';
  refreshBtn.textContent = 'Refresh Data';
  refreshBtn.addEventListener('click', loadData);
  container.insertBefore(refreshBtn, summarySection);

  async function loadData(): Promise<void> {
    try {
      const sites = await fetchSiteStorage();
      const summary = buildTenantSummary(sites);

      // Render summary
      summarySection.innerHTML = '<h2>Tenant Overview</h2>';
      renderStorageBar(
        summarySection,
        summary.usedStorageInBytes,
        summary.totalStorageInBytes,
        'Total Tenant Storage',
      );

      const stats = document.createElement('div');
      stats.className = 'stats-grid';
      stats.innerHTML = `
        <div class="stat-card">
          <div class="stat-value">${sites.length}</div>
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
      `;
      summarySection.appendChild(stats);

      // Top 10 sites table
      const sorted = [...sites].sort(
        (a, b) => b.storageUsedInBytes - a.storageUsedInBytes,
      );
      topSitesSection.innerHTML = '<h2>Top Sites by Storage Usage</h2>';
      const table = document.createElement('table');
      table.className = 'data-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Site</th>
            <th>Used</th>
            <th>Allocated</th>
            <th>Usage %</th>
            <th>Last Modified</th>
          </tr>
        </thead>
      `;
      const tbody = document.createElement('tbody');
      sorted.slice(0, 10).forEach((site) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><a href="${site.webUrl}" target="_blank" rel="noopener">${site.displayName}</a></td>
          <td>${formatBytes(site.storageUsedInBytes)}</td>
          <td>${formatBytes(site.storageAllocatedInBytes)}</td>
          <td>${site.storageUsedPercentage.toFixed(1)}%</td>
          <td>${formatDate(site.lastModifiedDateTime)}</td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      topSitesSection.appendChild(table);
    } catch {
      summarySection.innerHTML =
        '<p class="error-message">Failed to load data. Check permissions and try again.</p>';
    }
  }

  // Auto-load if we already have data
  const existing = store.getState();
  if (existing.sites.length > 0) {
    loadData();
  }
}
