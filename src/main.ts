import { initAuth, isAuthenticated, getActiveAccount } from './auth/authService';
import { store } from './store/store';
import { renderAuthPanel } from './ui/components/authPanel';
import { mountApp } from './ui/app';
import { initRouter } from './ui/router';
import './styles/main.css';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app element');

  // Initialise MSAL and handle any pending redirect
  await initAuth();

  // If already authenticated (token in sessionStorage), go straight to the app
  if (isAuthenticated()) {
    setAuthState();
    launchApp(root);
    return;
  }

  // Otherwise show the login screen
  renderAuthPanel(root, () => launchApp(root));
}

function setAuthState(): void {
  const account = getActiveAccount();
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
}

function launchApp(root: HTMLElement): void {
  setAuthState();
  mountApp(root);
  initRouter();
}

bootstrap().catch((err) => {
  console.error('App bootstrap failed', err);
  const root = document.getElementById('app');
  if (root) {
    root.innerHTML = `<div class="error-message" style="padding:2rem">
      <h1>Startup Error</h1>
      <p>The application failed to initialise. Please check your configuration.</p>
      <pre>${err instanceof Error ? err.message : String(err)}</pre>
    </div>`;
  }
});
