import { initAuth, getActiveAccount } from './auth/authService';
import { store } from './store/store';
import { mountApp } from './ui/app';
import { initRouter } from './ui/router';
import './styles/main.css';

async function bootstrap(): Promise<void> {
  // Initialise MSAL
  await initAuth();

  // Check for existing session
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

  // Mount the application
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app element');
  mountApp(root);

  // Activate hash-based router
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
