import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { store } from '../../store/store';
import { formatBytes } from '../../utils/format';

export function renderExportPage(container: HTMLElement): void {
  container.innerHTML = '';

  const header = document.createElement('h1');
  header.textContent = 'Export Data';
  container.appendChild(header);

  const { auth } = store.getState();
  if (!auth.isAuthenticated) {
    const msg = document.createElement('p');
    msg.className = 'info-message';
    msg.textContent = 'Please sign in to export data.';
    container.appendChild(msg);
    return;
  }

  const intro = document.createElement('p');
  intro.textContent =
    'Download your storage analysis data in various formats for offline review or reporting.';
  container.appendChild(intro);

  const btnGroup = document.createElement('div');
  btnGroup.className = 'btn-group';

  const csvBtn = document.createElement('button');
  csvBtn.className = 'btn btn-primary';
  csvBtn.textContent = 'Export CSV';
  csvBtn.addEventListener('click', exportCSV);
  btnGroup.appendChild(csvBtn);

  const excelBtn = document.createElement('button');
  excelBtn.className = 'btn btn-primary';
  excelBtn.textContent = 'Export Excel';
  excelBtn.addEventListener('click', exportExcel);
  btnGroup.appendChild(excelBtn);

  const zipBtn = document.createElement('button');
  zipBtn.className = 'btn btn-secondary';
  zipBtn.textContent = 'Export All (ZIP)';
  zipBtn.addEventListener('click', exportZip);
  btnGroup.appendChild(zipBtn);

  container.appendChild(btnGroup);

  const statusEl = document.createElement('p');
  statusEl.className = 'export-status';
  container.appendChild(statusEl);

  function getSiteRows() {
    return store.getState().sites.map((s) => ({
      'Site Name': s.displayName,
      URL: s.webUrl,
      'Used (bytes)': s.storageUsedInBytes,
      'Used (formatted)': formatBytes(s.storageUsedInBytes),
      'Allocated (bytes)': s.storageAllocatedInBytes,
      'Allocated (formatted)': formatBytes(s.storageAllocatedInBytes),
      'Usage %': `${s.storageUsedPercentage.toFixed(1)}%`,
      'Last Modified': s.lastModifiedDateTime,
      Owner: s.owner ?? '',
    }));
  }

  function exportCSV(): void {
    const rows = getSiteRows();
    if (rows.length === 0) {
      statusEl.textContent = 'No data to export. Load site data first.';
      return;
    }
    const csv = Papa.unparse(rows);
    downloadBlob(csv, 'sp-storage-report.csv', 'text/csv');
    statusEl.textContent = `Exported ${rows.length} sites to CSV.`;
  }

  async function exportExcel(): Promise<void> {
    const rows = getSiteRows();
    if (rows.length === 0) {
      statusEl.textContent = 'No data to export. Load site data first.';
      return;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SP Storage Helpers';
    const ws = wb.addWorksheet('Site Storage');

    // Header row
    const headers = Object.keys(rows[0]);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };

    // Data rows
    rows.forEach((row) => ws.addRow(Object.values(row)));

    // Auto-width columns
    ws.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 40);
    });

    const buffer = await wb.xlsx.writeBuffer();
    downloadBlob(
      buffer,
      'sp-storage-report.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    statusEl.textContent = `Exported ${rows.length} sites to Excel.`;
  }

  async function exportZip(): Promise<void> {
    const rows = getSiteRows();
    if (rows.length === 0) {
      statusEl.textContent = 'No data to export. Load site data first.';
      return;
    }

    const zip = new JSZip();

    // CSV
    zip.file('sp-storage-report.csv', Papa.unparse(rows));

    // Excel
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Site Storage');
    const headers = Object.keys(rows[0]);
    ws.addRow(headers);
    rows.forEach((row) => ws.addRow(Object.values(row)));
    const buffer = await wb.xlsx.writeBuffer();
    zip.file('sp-storage-report.xlsx', buffer);

    // JSON
    zip.file(
      'sp-storage-report.json',
      JSON.stringify(store.getState().sites, null, 2),
    );

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, 'sp-storage-report.zip', 'application/zip');
    statusEl.textContent = `Exported ZIP with ${rows.length} sites (CSV + Excel + JSON).`;
  }
}

function downloadBlob(
  data: BlobPart,
  filename: string,
  mimeType: string,
): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
