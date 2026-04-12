import type { RouteName } from '../types';
import { store } from '../store/store';

/** Simple hash-based router for the SPA */
export function initRouter(): void {
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
}

function handleHashChange(): void {
  const hash = window.location.hash.replace('#/', '').replace('#', '');
  const route = (hash || 'dashboard') as RouteName;
  store.dispatch({ type: 'SET_ROUTE', payload: route });
}

export function navigate(route: RouteName): void {
  window.location.hash = `#/${route}`;
}
