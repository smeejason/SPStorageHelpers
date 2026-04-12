import { store } from '../../store/store';
import {
  fetchSiteStorage,
  fetchLargeFiles,
  fetchRecycleBinItems,
} from '../../services/storageService';
import { renderStorageBar } from '../components/storageBar';
import { formatBytes, formatDate } from '../../utils/format';

export function renderSiteAnalysis(container: HTMLElement): void {
  container.innerHTML = '';

  const header = document.createElement('h1');
  header.textContent = 'Site Analysis';
  container.appendChild(header);

  const { auth } = store.getState();
  if (!auth.isAuthenticated) {
    const msg = document.createElement('p');
    msg.className = 'info-message';
    msg.textContent = 'Please sign in to analyse site storage.';
    container.appendChild(msg);
    return;
  }

  // Site picker
  const controls = document.createElement('div');
  controls.className = 'controls-row';

  const siteSelect = document.createElement('select');
  siteSelect.className = 'select-input';
  siteSelect.innerHTML = '<option value="">-- Select a site --</option>';
  controls.appendChild(siteSelect);

  const loadSitesBtn = document.createElement('button');
  loadSitesBtn.className = 'btn btn-primary';
  loadSitesBtn.textContent = 'Load Sites';
  loadSitesBtn.addEventListener('click', loadSites);
  controls.appendChild(loadSitesBtn);

  const analyseBtn = document.createElement('button');
  analyseBtn.className = 'btn btn-secondary';
  analyseBtn.textContent = 'Analyse Selected Site';
  analyseBtn.disabled = true;
  controls.appendChild(analyseBtn);

  container.appendChild(controls);

  const detailSection = document.createElement('section');
  detailSection.className = 'card';
  container.appendChild(detailSection);

  const largeFilesSection = document.createElement('section');
  largeFilesSection.className = 'card hidden';
  container.appendChild(largeFilesSection);

  const recycleBinSection = document.createElement('section');
  recycleBinSection.className = 'card hidden';
  container.appendChild(recycleBinSection);

  siteSelect.addEventListener('change', () => {
    analyseBtn.disabled = !siteSelect.value;
  });

  analyseBtn.addEventListener('click', () => {
    if (siteSelect.value) analyseSite(siteSelect.value);
  });

  async function loadSites(): Promise<void> {
    let sites = store.getState().sites;
    if (sites.length === 0) {
      sites = await fetchSiteStorage();
    }
    siteSelect.innerHTML = '<option value="">-- Select a site --</option>';
    sites.forEach((site) => {
      const opt = document.createElement('option');
      opt.value = site.id;
      opt.textContent = `${site.displayName} (${formatBytes(site.storageUsedInBytes)})`;
      siteSelect.appendChild(opt);
    });
  }

  async function analyseSite(siteId: string): Promise<void> {
    const sites = store.getState().sites;
    const site = sites.find((s) => s.id === siteId);

    // Site detail card
    detailSection.innerHTML = '';
    if (site) {
      const h2 = document.createElement('h2');
      h2.textContent = site.displayName;
      detailSection.appendChild(h2);
      renderStorageBar(
        detailSection,
        site.storageUsedInBytes,
        site.storageAllocatedInBytes,
      );

      const meta = document.createElement('div');
      meta.className = 'meta-info';
      meta.innerHTML = `
        <p><strong>URL:</strong> <a href="${site.webUrl}" target="_blank" rel="noopener">${site.webUrl}</a></p>
        <p><strong>Owner:</strong> ${site.owner ?? 'N/A'}</p>
        <p><strong>Last Modified:</strong> ${formatDate(site.lastModifiedDateTime)}</p>
      `;
      detailSection.appendChild(meta);
    }

    // Large files
    try {
      largeFilesSection.classList.remove('hidden');
      largeFilesSection.innerHTML = '<h2>Large Files (> 10 MB)</h2><p>Scanning...</p>';
      const files = await fetchLargeFiles(siteId);

      largeFilesSection.innerHTML = '<h2>Large Files (> 10 MB)</h2>';
      if (files.length === 0) {
        largeFilesSection.innerHTML += '<p>No large files found.</p>';
      } else {
        const table = document.createElement('table');
        table.className = 'data-table';
        table.innerHTML = `
          <thead>
            <tr><th>File</th><th>Size</th><th>Library</th><th>Modified</th><th>Modified By</th></tr>
          </thead>
        `;
        const tbody = document.createElement('tbody');
        files.forEach((f) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><a href="${f.webUrl}" target="_blank" rel="noopener">${f.name}</a></td>
            <td>${formatBytes(f.size)}</td>
            <td>${f.libraryName}</td>
            <td>${formatDate(f.lastModifiedDateTime)}</td>
            <td>${f.lastModifiedBy}</td>
          `;
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        largeFilesSection.appendChild(table);
      }
    } catch {
      largeFilesSection.innerHTML =
        '<h2>Large Files</h2><p class="error-message">Unable to scan for large files.</p>';
    }

    // Recycle bin
    try {
      recycleBinSection.classList.remove('hidden');
      recycleBinSection.innerHTML = '<h2>Recycle Bin</h2><p>Scanning...</p>';
      const items = await fetchRecycleBinItems(siteId);

      recycleBinSection.innerHTML = '<h2>Recycle Bin</h2>';
      if (items.length === 0) {
        recycleBinSection.innerHTML += '<p>Recycle bin is empty.</p>';
      } else {
        const totalSize = items.reduce((s, item) => s + item.size, 0);
        const summary = document.createElement('p');
        summary.innerHTML = `<strong>${items.length} items</strong> totalling <strong>${formatBytes(totalSize)}</strong>`;
        recycleBinSection.appendChild(summary);

        const table = document.createElement('table');
        table.className = 'data-table';
        table.innerHTML = `
          <thead>
            <tr><th>Name</th><th>Size</th><th>Deleted</th><th>Type</th></tr>
          </thead>
        `;
        const tbody = document.createElement('tbody');
        items.slice(0, 50).forEach((item) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${item.title}</td>
            <td>${formatBytes(item.size)}</td>
            <td>${formatDate(item.deletedDateTime)}</td>
            <td>${item.itemType}</td>
          `;
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        recycleBinSection.appendChild(table);
      }
    } catch {
      recycleBinSection.innerHTML =
        '<h2>Recycle Bin</h2><p class="error-message">Unable to access recycle bin.</p>';
    }
  }
}
