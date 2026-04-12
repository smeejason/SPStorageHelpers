import type { RouteName } from '../../types';
import { navigate } from '../router';
import { store } from '../../store/store';
import { signIn, signOut } from '../../auth/authService';

const navItems: { label: string; route: RouteName }[] = [
  { label: 'Dashboard', route: 'dashboard' },
  { label: 'Site Analysis', route: 'sites' },
  { label: 'Cleanup', route: 'cleanup' },
  { label: 'Export', route: 'export' },
];

export function renderNavbar(container: HTMLElement): void {
  const nav = document.createElement('nav');
  nav.className = 'navbar';

  const brand = document.createElement('div');
  brand.className = 'navbar-brand';
  brand.textContent = 'SP Storage Helpers';
  nav.appendChild(brand);

  const links = document.createElement('div');
  links.className = 'navbar-links';
  navItems.forEach(({ label, route }) => {
    const a = document.createElement('a');
    a.href = `#/${route}`;
    a.className = 'nav-link';
    a.textContent = label;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(route);
    });
    links.appendChild(a);
  });
  nav.appendChild(links);

  const authBtn = document.createElement('button');
  authBtn.className = 'btn btn-auth';
  nav.appendChild(authBtn);

  function updateAuth(): void {
    const { auth, route } = store.getState();
    authBtn.textContent = auth.isAuthenticated ? 'Sign Out' : 'Sign In';
    authBtn.onclick = auth.isAuthenticated
      ? async () => {
          await signOut();
          store.dispatch({
            type: 'SET_AUTH',
            payload: {
              isAuthenticated: false,
              userName: null,
              userEmail: null,
              tenantId: null,
            },
          });
          store.dispatch({ type: 'RESET' });
        }
      : async () => {
          const account = await signIn();
          if (account) {
            store.dispatch({
              type: 'SET_AUTH',
              payload: {
                isAuthenticated: true,
                userName: account.name ?? null,
                userEmail: account.username ?? null,
                tenantId: account.tenantId ?? null,
              },
            });
          }
        };

    // Highlight active route
    links.querySelectorAll('.nav-link').forEach((el, i) => {
      el.classList.toggle('active', navItems[i].route === route);
    });
  }

  store.subscribe(updateAuth);
  updateAuth();

  container.appendChild(nav);
}
