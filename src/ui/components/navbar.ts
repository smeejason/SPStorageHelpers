import type { RouteName } from '../../types';
import { navigate } from '../router';
import { store } from '../../store/store';
import { signOut } from '../../auth/authService';
import { resetGraphClient } from '../../services/graphClient';

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

  // User info + sign out
  const authArea = document.createElement('div');
  authArea.className = 'navbar-auth';

  const userLabel = document.createElement('span');
  userLabel.className = 'navbar-user';
  authArea.appendChild(userLabel);

  const signOutBtn = document.createElement('button');
  signOutBtn.className = 'btn btn-auth';
  signOutBtn.textContent = 'Sign Out';
  signOutBtn.addEventListener('click', async () => {
    await signOut();
    resetGraphClient();
    store.dispatch({ type: 'RESET' });
    // Reload to show login screen
    window.location.reload();
  });
  authArea.appendChild(signOutBtn);
  nav.appendChild(authArea);

  function updateNav(): void {
    const { auth, route } = store.getState();
    userLabel.textContent = auth.userName ?? '';

    // Highlight active route
    links.querySelectorAll('.nav-link').forEach((el, i) => {
      el.classList.toggle('active', navItems[i].route === route);
    });
  }

  store.subscribe(updateNav);
  updateNav();

  container.appendChild(nav);
}
