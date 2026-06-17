import { store } from '../store/store'
import { signOut } from '../auth/authService'
import { resetGraphClient } from '../services/graphClient'
import { renderAuthPanel } from './components/authPanel'
import { renderLoader, showLoader, hideLoader } from './components/loader'
import { renderDashboard } from './pages/dashboard'
import { renderSiteAnalysis } from './pages/siteAnalysis'
import { renderCleanup } from './pages/cleanup'
import { renderExportPage } from './pages/exportPage'
import type { RouteName } from '../types'

// ─── Waffle SVG ───────────────────────────────────────────────────────────────

const WAFFLE_SVG = `
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="0"   y="0"   width="5" height="5" rx="1"/>
    <rect x="6.5" y="0"   width="5" height="5" rx="1"/>
    <rect x="13"  y="0"   width="5" height="5" rx="1"/>
    <rect x="0"   y="6.5" width="5" height="5" rx="1"/>
    <rect x="6.5" y="6.5" width="5" height="5" rx="1"/>
    <rect x="13"  y="6.5" width="5" height="5" rx="1"/>
    <rect x="0"   y="13"  width="5" height="5" rx="1"/>
    <rect x="6.5" y="13"  width="5" height="5" rx="1"/>
    <rect x="13"  y="13"  width="5" height="5" rx="1"/>
  </svg>`

// ─── Navigation items ─────────────────────────────────────────────────────────

const navItems: { label: string; route: RouteName }[] = [
  { label: 'Dashboard', route: 'dashboard' },
  { label: 'Site Analysis', route: 'sites' },
  { label: 'Cleanup', route: 'cleanup' },
  { label: 'Export', route: 'export' },
]

const pageRenderers: Record<RouteName, (el: HTMLElement) => void> = {
  dashboard: renderDashboard,
  sites: renderSiteAnalysis,
  cleanup: renderCleanup,
  export: renderExportPage,
}

// ─── App shell HTML ───────────────────────────────────────────────────────────

function shellHtml(user: string): string {
  return `
    <header class="app-header">
      <div class="header-left">
        <div class="waffle-wrap">
          <button id="btn-waffle" class="waffle-btn" title="Apps" aria-label="Apps">
            ${WAFFLE_SVG}
          </button>
          <div id="waffle-menu" class="waffle-menu" hidden>
            ${navItems.map(({ label, route }) =>
              `<div class="waffle-menu-item" data-route="${route}">${escHtml(label)}</div>`
            ).join('')}
          </div>
        </div>
        <span class="app-logo">SP Storage Helpers</span>
      </div>
      <div class="header-right">
        <span class="header-user">${escHtml(user)}</span>
        <button id="btn-signout" class="btn btn-ghost btn-sm">Sign out</button>
      </div>
    </header>
    <nav class="workspace-tabs" id="app-tabs">
      ${navItems.map(({ label, route }) =>
        `<button class="tab-btn" data-route="${route}">${label}</button>`
      ).join('')}
      <div class="tab-spacer"></div>
    </nav>
    <main id="app-main" class="workspace-panel"></main>
  `
}

// ─── Main render function ─────────────────────────────────────────────────────

export function mountApp(root: HTMLElement): void {
  injectShellStyles()

  const { auth } = store.getState()

  // If not authenticated, show the login screen
  if (!auth.isAuthenticated) {
    renderAuthPanel(root, () => mountApp(root))
    return
  }

  root.innerHTML = shellHtml(auth.userName ?? auth.userEmail ?? '')

  // Loader overlay
  const loaderEl = renderLoader(root)

  // Wire up sign out
  attachSignOut(root)

  // Wire up waffle menu
  attachWaffle(root)

  // Wire up tabs
  const main = root.querySelector('#app-main') as HTMLElement
  const tabs = root.querySelectorAll('.tab-btn[data-route]')

  function setActiveTab(route: RouteName): void {
    tabs.forEach((t) =>
      t.classList.toggle('tab-btn--active', t.getAttribute('data-route') === route)
    )
  }

  function renderPage(route: RouteName): void {
    main.innerHTML = ''
    const contentWrap = document.createElement('div')
    contentWrap.className = 'main-content'
    main.appendChild(contentWrap)
    const renderer = pageRenderers[route] ?? pageRenderers.dashboard
    renderer(contentWrap)
    setActiveTab(route)
  }

  // Tab click handlers
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const route = tab.getAttribute('data-route') as RouteName
      store.dispatch({ type: 'SET_ROUTE', payload: route })
    })
  })

  // Subscribe to state changes
  let currentRoute: RouteName | null = null
  store.subscribe((state) => {
    if (state.loading) showLoader(loaderEl)
    else hideLoader(loaderEl)

    if (state.error) {
      showError(root, state.error)
      store.dispatch({ type: 'SET_ERROR', payload: null })
    }

    if (state.route !== currentRoute) {
      currentRoute = state.route
      renderPage(currentRoute)
    }
  })

  // Initial render
  currentRoute = store.getState().route
  renderPage(currentRoute)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function attachSignOut(root: HTMLElement): void {
  root.querySelector('#btn-signout')?.addEventListener('click', async () => {
    try {
      resetGraphClient()
      store.dispatch({ type: 'RESET' })
      await signOut()
    } catch {
      // signOut redirects — ignore errors
    }
  })
}

function attachWaffle(root: HTMLElement): void {
  const btn = root.querySelector('#btn-waffle') as HTMLElement | null
  const menu = root.querySelector('#waffle-menu') as HTMLElement | null
  if (!btn || !menu) return

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    menu.hidden = !menu.hidden
  })

  const closeOnOutsideClick = (): void => {
    if (!document.contains(btn)) {
      document.removeEventListener('click', closeOnOutsideClick)
      return
    }
    menu.hidden = true
  }
  document.addEventListener('click', closeOnOutsideClick)

  menu.querySelectorAll('.waffle-menu-item[data-route]').forEach((item) => {
    item.addEventListener('click', () => {
      menu.hidden = true
      const route = item.getAttribute('data-route') as RouteName
      store.dispatch({ type: 'SET_ROUTE', payload: route })
    })
  })
}

function showError(root: HTMLElement, message: string): void {
  const toast = document.createElement('div')
  toast.className = 'error-toast'
  toast.textContent = message
  root.appendChild(toast)
  setTimeout(() => toast.remove(), 5000)
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Injected styles ─────────────────────────────────────────────────────────

function injectShellStyles(): void {
  if (document.getElementById('shell-styles')) return
  const style = document.createElement('style')
  style.id = 'shell-styles'
  style.textContent = `
    /* ─── Header ─── */
    .app-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 16px 0 4px; height: 48px; background: var(--color-primary);
      color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.15); flex-shrink: 0;
    }
    .header-left { display: flex; align-items: center; gap: 8px; }
    .app-logo { font-weight: 700; font-size: 1rem; letter-spacing: 0.01em; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .header-user { font-size: 0.85rem; opacity: 0.85; }
    .app-header .btn-ghost {
      color: rgba(255,255,255,0.9); border-color: rgba(255,255,255,0.4);
      background: transparent;
    }
    .app-header .btn-ghost:hover { background: rgba(255,255,255,0.15); }

    /* ─── Waffle ─── */
    .waffle-wrap { position: relative; display: flex; align-items: center; }
    .waffle-btn {
      display: flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; background: transparent; border: none;
      border-radius: 4px; cursor: pointer; color: rgba(255,255,255,0.9);
      flex-shrink: 0;
    }
    .waffle-btn:hover { background: rgba(255,255,255,0.15); }
    .waffle-menu {
      position: absolute; top: calc(100% + 6px); left: 0;
      background: white; border: 1px solid var(--color-border);
      border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      min-width: 180px; z-index: 300; padding: 6px 0;
    }
    .waffle-menu-item {
      padding: 10px 16px; font-size: 0.875rem; cursor: pointer;
      color: var(--color-text); font-weight: 500;
    }
    .waffle-menu-item:hover { background: var(--color-surface-alt); }

    /* ─── Tabs ─── */
    .workspace-tabs {
      display: flex; align-items: center; gap: 2px; padding: 0 16px;
      background: white; border-bottom: 1px solid var(--color-border);
      height: 44px; flex-shrink: 0;
    }
    .tab-btn {
      padding: 8px 16px; background: none; border: none; border-bottom: 3px solid transparent;
      font-family: inherit; font-size: 0.875rem; cursor: pointer; color: var(--color-text-muted);
      transition: color 0.15s; margin-bottom: -1px;
    }
    .tab-btn:hover { color: var(--color-text); }
    .tab-btn--active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }
    .tab-spacer { flex: 1; }
    .workspace-panel { flex: 1; overflow-y: auto; background: var(--color-bg); }

    /* ─── Main content ─── */
    .main-content {
      max-width: 1200px; width: 100%; margin: 0 auto; padding: 24px 32px;
    }

    /* ─── Buttons ─── */
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
      border: 1px solid transparent; border-radius: 4px; font-family: inherit;
      font-size: 0.875rem; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
    .btn-primary { background: var(--color-primary); color: white; border-color: var(--color-primary); }
    .btn-primary:hover:not(:disabled) { background: var(--color-primary-dark); border-color: var(--color-primary-dark); }
    .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-secondary { background: white; color: var(--color-text); border-color: var(--color-border); }
    .btn-secondary:hover { background: var(--color-surface-alt); }
    .btn-ghost { background: transparent; color: var(--color-text); border-color: var(--color-border); }
    .btn-ghost:hover { background: var(--color-surface-alt); }
    .btn-sm { padding: 5px 12px; font-size: 0.82rem; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0; }

    /* ─── Cards ─── */
    .card { background: white; border: 1px solid var(--color-border); border-radius: 4px;
      padding: 20px 24px; margin-bottom: 16px; }
    .card h2 { font-size: 1rem; font-weight: 600; margin-bottom: 12px; color: var(--color-text); }

    /* ─── Stats Grid ─── */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 12px; }
    .stat-card { background: var(--color-surface-alt); border-radius: 4px; padding: 16px; text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: var(--color-primary); }
    .stat-label { font-size: 0.8rem; color: var(--color-text-muted); margin-top: 4px; }

    /* ─── Storage Bar ─── */
    .storage-bar-wrapper { margin: 12px 0; }
    .storage-bar-label { font-weight: 600; margin-bottom: 4px; font-size: 0.875rem; }
    .storage-bar-track { height: 20px; background: var(--color-border); border-radius: 10px; overflow: hidden; }
    .storage-bar-fill { height: 100%; border-radius: 10px; transition: width 0.5s ease; }
    .storage-bar-info { font-size: 0.8rem; color: var(--color-text-muted); margin-top: 4px; }

    /* ─── Data Tables ─── */
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 12px; }
    .data-table th, .data-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--color-border); }
    .data-table th { background: var(--color-surface-alt); font-weight: 600; position: sticky; top: 0; }
    .data-table tbody tr:hover { background: #f9f9f9; }

    /* ─── Controls ─── */
    .controls-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
    .select-input { padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 4px;
      font-family: inherit; font-size: 0.875rem; min-width: 250px; outline: none; background: white; }
    .select-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-light); }

    /* ─── Recommendations ─── */
    .recommendation { border-left: 4px solid var(--color-border); }
    .recommendation.risk-low { border-left-color: var(--color-success); }
    .recommendation.risk-medium { border-left-color: var(--color-warning); }
    .recommendation.risk-high { border-left-color: var(--color-danger); }
    .rec-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .risk-badge { display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: white; }
    .risk-badge.low { background: var(--color-success); }
    .risk-badge.medium { background: var(--color-warning); }
    .risk-badge.high { background: var(--color-danger); }
    .rec-action-type { font-weight: 600; text-transform: capitalize; }
    .rec-savings { font-size: 0.85rem; color: var(--color-text-muted); margin-top: 8px; }

    /* ─── Messages ─── */
    .info-message { background: var(--color-primary-light); border-left: 4px solid var(--color-primary);
      padding: 10px 14px; border-radius: 4px; margin: 12px 0; font-size: 0.875rem; }
    .error-message { background: #fde7e9; border-left: 4px solid var(--color-danger);
      padding: 10px 14px; border-radius: 4px; margin: 12px 0; color: #a4262c; font-size: 0.875rem; }
    .export-status { margin-top: 12px; color: var(--color-text-muted); font-style: italic; font-size: 0.875rem; }

    /* ─── Loader ─── */
    .loader-overlay { position: fixed; inset: 0; background: rgba(255,255,255,0.8);
      display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 200; }
    .loader-overlay.hidden { display: none; }
    .spinner { width: 40px; height: 40px; border: 4px solid var(--color-border);
      border-top-color: var(--color-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ─── Error Toast ─── */
    .error-toast { position: fixed; bottom: 24px; right: 24px; background: var(--color-danger); color: white;
      padding: 10px 20px; border-radius: 4px; box-shadow: var(--shadow); z-index: 300;
      animation: slideIn 0.3s ease; font-size: 0.875rem; }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    /* ─── Auth Panel ─── */
    .auth-panel-wrapper { min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #0078d4 0%, #005a9e 100%); padding: 24px; }
    .auth-panel-card { background: white; border-radius: 12px; padding: 48px 40px;
      max-width: 420px; width: 100%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .auth-panel-logo { width: 64px; height: 64px; background: var(--color-primary); color: white;
      font-size: 1.75rem; font-weight: 700; border-radius: 12px;
      display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
    .auth-panel-title { font-size: 1.5rem; font-weight: 600; color: var(--color-text); margin-bottom: 12px; }
    .auth-panel-subtitle { font-size: 0.9rem; color: var(--color-text-muted); margin-bottom: 32px; line-height: 1.5; }
    .btn-microsoft { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px;
      background: var(--color-primary); color: white; border: none; border-radius: 4px;
      font-family: inherit; font-size: 1rem; font-weight: 600; cursor: pointer; width: 100%;
      justify-content: center; transition: background 0.15s; }
    .btn-microsoft:hover:not(:disabled) { background: var(--color-primary-dark); }
    .btn-microsoft:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-large { padding: 14px 28px; font-size: 1rem; width: 100%; justify-content: center; }
    .auth-panel-status { margin-top: 16px; padding: 10px 14px; border-radius: 4px; font-size: 0.85rem; display: none; }
    .auth-panel-status.info { background: var(--color-primary-light); color: var(--color-primary-dark); display: block; }
    .auth-panel-status.error { background: #fde7e9; color: #a4262c; display: block; }

    /* ─── Utilities ─── */
    .hidden { display: none !important; }
    a { color: var(--color-primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .meta-info p { margin: 4px 0; font-size: 0.85rem; }

    /* ─── Responsive ─── */
    @media (max-width: 768px) {
      .app-header { padding: 0 12px 0 4px; }
      .main-content { padding: 16px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .data-table { font-size: 0.78rem; }
      .controls-row { flex-direction: column; align-items: stretch; }
      .select-input { min-width: 100%; }
      .workspace-tabs { overflow-x: auto; padding: 0 8px; }
    }
  `
  document.head.appendChild(style)
}
