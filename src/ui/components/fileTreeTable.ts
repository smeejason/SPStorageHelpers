import { formatBytes, formatDate } from '../../utils/format'
import type { SiteFileInventory } from '../../types'

// ─── SVG icons ────────────────────────────────────────────────────────────────

const LIBRARY_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--color-primary)" xmlns="http://www.w3.org/2000/svg">
  <path d="M1 2.5A1.5 1.5 0 012.5 1h3.379a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.12 3H13.5A1.5 1.5 0 0115 4.5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-10z"/>
</svg>`

const CHEVRON_RIGHT = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M4.5 2l4 4-4 4"/></svg>`
const CHEVRON_DOWN = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4.5l4 4 4-4"/></svg>`

const VERSION_ICON = `<svg width="12" height="12" viewBox="0 0 12 12" fill="var(--color-text-muted)"><circle cx="6" cy="6" r="2.5" stroke="currentColor" stroke-width="1" fill="none"/></svg>`

// ─── Inject styles ────────────────────────────────────────────────────────────

function injectTreeStyles(): void {
  if (document.getElementById('tree-table-styles')) return
  const style = document.createElement('style')
  style.id = 'tree-table-styles'
  style.textContent = `
    .tree-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .tree-table th { text-align: left; padding: 6px 8px; background: var(--color-surface-alt);
      border-bottom: 1px solid var(--color-border); font-weight: 600; position: sticky; top: 0; z-index: 1; }
    .tree-table td { padding: 4px 8px; border-bottom: 1px solid var(--color-border); vertical-align: middle; white-space: nowrap; }
    .tree-table tbody tr:hover { background: #f5f5f5; }

    .tree-node { cursor: pointer; user-select: none; }
    .tree-node:hover { background: var(--color-primary-light); }
    .tree-node td { font-weight: 600; background: var(--color-surface-alt); padding: 8px; }
    .tree-toggle { display: inline-flex; align-items: center; gap: 6px; }
    .tree-toggle svg { flex-shrink: 0; transition: transform 0.15s; }

    .tree-file td:first-child { padding-left: 32px; }
    .tree-version td:first-child { padding-left: 56px; }
    .tree-version td { color: var(--color-text-muted); font-size: 0.78rem; }
    .tree-version-label { display: inline-flex; align-items: center; gap: 4px; }

    .tree-summary { display: flex; gap: 16px; font-size: 0.8rem; color: var(--color-text-muted); margin-left: auto; }
    .tree-summary-item { white-space: nowrap; }

    .tree-hidden { display: none; }
    .tree-size-warn { color: var(--color-warning); font-weight: 600; }
    .tree-size-danger { color: var(--color-danger); font-weight: 600; }
  `
  document.head.appendChild(style)
}

// ─── Render tree table ────────────────────────────────────────────────────────

export function renderFileTreeTable(container: HTMLElement, inventory: SiteFileInventory): void {
  injectTreeStyles()
  container.innerHTML = ''

  const table = document.createElement('table')
  table.className = 'tree-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Path</th>
        <th>Size</th>
        <th>Modified</th>
        <th>Modified By</th>
        <th>Created</th>
        <th>Created By</th>
        <th>Version</th>
      </tr>
    </thead>
  `
  const tbody = document.createElement('tbody')

  for (const lib of inventory.libraries) {
    const libId = `lib-${lib.driveId}`
    const totalFiles = lib.files.length
    const totalVersions = lib.files.reduce((s, f) => s + f.versions.length, 0)
    const totalSize = lib.files.reduce((s, f) => s + f.size, 0)

    // Library node row
    const libRow = document.createElement('tr')
    libRow.className = 'tree-node'
    libRow.dataset.libId = libId
    libRow.innerHTML = `
      <td colspan="5">
        <span class="tree-toggle">
          <span class="tree-chevron">${CHEVRON_RIGHT}</span>
          ${LIBRARY_ICON}
          <span>${escHtml(lib.driveName)}</span>
        </span>
      </td>
      <td colspan="3">
        <span class="tree-summary">
          <span class="tree-summary-item">${totalFiles} files</span>
          <span class="tree-summary-item">${totalVersions} versions</span>
          <span class="tree-summary-item">${formatBytes(totalSize)}</span>
          <span class="tree-summary-item">Quota: ${formatBytes(lib.usedBytes)} / ${formatBytes(lib.totalBytes)}</span>
        </span>
      </td>
    `
    tbody.appendChild(libRow)

    // File rows (initially hidden)
    for (const file of lib.files) {
      const fileId = `file-${file.id}`
      const hasVersions = file.versions.length > 1

      const fileRow = document.createElement('tr')
      fileRow.className = `tree-file tree-hidden tree-child-${libId}`
      fileRow.dataset.fileId = fileId
      if (hasVersions) {
        fileRow.classList.add('tree-node')
      }

      const sizeClass = file.size > 100 * 1024 * 1024 ? 'tree-size-danger'
        : file.size > 10 * 1024 * 1024 ? 'tree-size-warn' : ''

      fileRow.innerHTML = `
        <td>
          ${hasVersions ? `<span class="tree-toggle"><span class="tree-chevron">${CHEVRON_RIGHT}</span>${escHtml(file.name)}</span>` : escHtml(file.name)}
        </td>
        <td>${escHtml(file.path)}</td>
        <td class="${sizeClass}">${formatBytes(file.size)}</td>
        <td>${formatDate(file.lastModifiedDateTime)}</td>
        <td>${escHtml(file.lastModifiedBy)}</td>
        <td>${formatDate(file.createdDateTime)}</td>
        <td>${escHtml(file.createdBy)}</td>
        <td>${escHtml(file.versionLabel)}</td>
      `
      tbody.appendChild(fileRow)

      // Version rows (initially hidden)
      if (hasVersions) {
        for (const ver of file.versions) {
          const verRow = document.createElement('tr')
          verRow.className = `tree-version tree-hidden tree-child-${fileId}`
          verRow.innerHTML = `
            <td><span class="tree-version-label">${VERSION_ICON} v${escHtml(ver.versionLabel)}</span></td>
            <td></td>
            <td>${formatBytes(ver.size)}</td>
            <td>${formatDate(ver.lastModifiedDateTime)}</td>
            <td>${escHtml(ver.lastModifiedBy)}</td>
            <td></td>
            <td></td>
            <td>${escHtml(ver.versionLabel)}</td>
          `
          tbody.appendChild(verRow)
        }
      }
    }
  }

  table.appendChild(tbody)
  container.appendChild(table)

  // ─── Toggle expand/collapse ──────────────────────────────────────

  tbody.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest('tr.tree-node') as HTMLElement | null
    if (!row) return

    const id = row.dataset.libId ?? row.dataset.fileId
    if (!id) return

    const isExpanded = row.classList.contains('tree-expanded')
    row.classList.toggle('tree-expanded')

    // Update chevron
    const chevron = row.querySelector('.tree-chevron')
    if (chevron) {
      chevron.innerHTML = isExpanded ? CHEVRON_RIGHT : CHEVRON_DOWN
    }

    // Toggle children
    const children = tbody.querySelectorAll(`.tree-child-${id}`)
    children.forEach((child) => {
      if (isExpanded) {
        child.classList.add('tree-hidden')
        // Also collapse any expanded children
        if (child.classList.contains('tree-expanded')) {
          child.classList.remove('tree-expanded')
          const subChevron = child.querySelector('.tree-chevron')
          if (subChevron) subChevron.innerHTML = CHEVRON_RIGHT
          const subId = (child as HTMLElement).dataset.fileId
          if (subId) {
            tbody.querySelectorAll(`.tree-child-${subId}`).forEach((sc) => sc.classList.add('tree-hidden'))
          }
        }
      } else {
        child.classList.remove('tree-hidden')
      }
    })
  })
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
