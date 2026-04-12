import { signIn, isAuthenticated } from '../../auth/authService';
import { getGraphClient } from '../../services/graphClient';
import { store } from '../../store/store';

/**
 * Render a centered login card with a "Sign in with Microsoft" button.
 * On success, verifies Graph connectivity then dispatches auth state.
 */
export function renderAuthPanel(
  container: HTMLElement,
  onAuthenticated: () => void,
): void {
  // If already authenticated, skip straight to the app
  if (isAuthenticated()) {
    onAuthenticated();
    return;
  }

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'auth-panel-wrapper';

  const card = document.createElement('div');
  card.className = 'auth-panel-card';

  const logo = document.createElement('div');
  logo.className = 'auth-panel-logo';
  logo.textContent = 'SP';
  card.appendChild(logo);

  const title = document.createElement('h1');
  title.className = 'auth-panel-title';
  title.textContent = 'SP Storage Helpers';
  card.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'auth-panel-subtitle';
  subtitle.textContent =
    'Sign in with your Microsoft 365 account to analyse and manage SharePoint tenant storage.';
  card.appendChild(subtitle);

  const signInBtn = document.createElement('button');
  signInBtn.className = 'btn btn-microsoft';
  signInBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
    <span>Sign in with Microsoft</span>
  `;
  card.appendChild(signInBtn);

  const statusEl = document.createElement('p');
  statusEl.className = 'auth-panel-status';
  card.appendChild(statusEl);

  wrapper.appendChild(card);
  container.appendChild(wrapper);

  signInBtn.addEventListener('click', async () => {
    signInBtn.disabled = true;
    statusEl.textContent = 'Signing in...';
    statusEl.className = 'auth-panel-status';

    try {
      const account = await signIn();
      if (!account) {
        // Redirect flow triggered — page will reload
        statusEl.textContent = 'Redirecting...';
        return;
      }

      // Verify Graph connectivity
      statusEl.textContent = 'Verifying connection...';
      try {
        const client = getGraphClient();
        await client.api('/sites/root').select('id,displayName').get();
      } catch {
        // Non-fatal — auth succeeded but Graph root site may be restricted
        console.warn('[Auth] Could not reach root site — continuing anyway');
      }

      store.dispatch({
        type: 'SET_AUTH',
        payload: {
          isAuthenticated: true,
          userName: account.name ?? null,
          userEmail: account.username ?? null,
          tenantId: account.tenantId ?? null,
        },
      });

      onAuthenticated();
    } catch (err) {
      statusEl.textContent =
        err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      statusEl.className = 'auth-panel-status error';
      signInBtn.disabled = false;
    }
  });
}
