import { store } from '../store/store';
import { renderNavbar } from './components/navbar';
import { renderLoader, showLoader, hideLoader } from './components/loader';
import { renderDashboard } from './pages/dashboard';
import { renderSiteAnalysis } from './pages/siteAnalysis';
import { renderCleanup } from './pages/cleanup';
import { renderExportPage } from './pages/exportPage';
import type { RouteName } from '../types';

const pageRenderers: Record<RouteName, (el: HTMLElement) => void> = {
  dashboard: renderDashboard,
  sites: renderSiteAnalysis,
  cleanup: renderCleanup,
  export: renderExportPage,
};

export function mountApp(root: HTMLElement): void {
  root.innerHTML = '';

  // Navbar
  const navContainer = document.createElement('header');
  renderNavbar(navContainer);
  root.appendChild(navContainer);

  // Loader overlay
  const loaderEl = renderLoader(root);

  // Main content area
  const main = document.createElement('main');
  main.className = 'main-content';
  root.appendChild(main);

  // Footer
  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.textContent = 'SP Storage Helpers — SharePoint Tenant Storage Analytics';
  root.appendChild(footer);

  // Re-render page on state changes
  let currentRoute: RouteName | null = null;
  store.subscribe((state) => {
    // Handle loading overlay
    if (state.loading) showLoader(loaderEl);
    else hideLoader(loaderEl);

    // Handle error toast
    if (state.error) {
      showError(root, state.error);
      store.dispatch({ type: 'SET_ERROR', payload: null });
    }

    // Route changes
    if (state.route !== currentRoute) {
      currentRoute = state.route;
      const renderer = pageRenderers[currentRoute] ?? pageRenderers.dashboard;
      renderer(main);
    }
  });

  // Initial render
  const initialRoute = store.getState().route;
  currentRoute = initialRoute;
  const renderer = pageRenderers[initialRoute] ?? pageRenderers.dashboard;
  renderer(main);
}

function showError(root: HTMLElement, message: string): void {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
