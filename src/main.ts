import { initAuth, isAuthenticated, getActiveAccount } from './auth/authService'
import { store } from './store/store'
import { mountApp } from './ui/app'
import { initRouter } from './ui/router'

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) throw new Error('Missing #app element')

  // Show a loading state while MSAL initialises
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Segoe UI,sans-serif;color:#605e5c;">
      Loading…
    </div>
  `

  // ─── Startup diagnostics ───────────────────────────────────────────
  const clientId = import.meta.env.VITE_CLIENT_ID
  const tenantId = import.meta.env.VITE_TENANT_ID
  console.log('[Config] VITE_CLIENT_ID:', clientId || '⚠️  MISSING')
  console.log('[Config] VITE_TENANT_ID:', tenantId || '⚠️  MISSING')
  console.log('[Config] redirectUri:', window.location.origin)

  if (!clientId || !tenantId) {
    root.innerHTML = `
      <div style="padding:2rem;font-family:Segoe UI,sans-serif;max-width:600px;margin:2rem auto;">
        <h1 style="color:#d13438;">Configuration Missing</h1>
        <p style="margin:1rem 0;">The app cannot start because environment variables are not set.</p>
        <table style="border-collapse:collapse;width:100%;">
          <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">VITE_CLIENT_ID</td>
              <td style="padding:8px;border:1px solid #ccc;">${clientId || '<span style=color:red>NOT SET</span>'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">VITE_TENANT_ID</td>
              <td style="padding:8px;border:1px solid #ccc;">${tenantId || '<span style=color:red>NOT SET</span>'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">Redirect URI</td>
              <td style="padding:8px;border:1px solid #ccc;">${window.location.origin}</td></tr>
        </table>
        <h2 style="margin-top:1.5rem;">How to fix</h2>
        <ol style="margin:0.5rem 0 0 1.5rem;line-height:2;">
          <li>Copy <code>.env.example</code> to <code>.env.local</code></li>
          <li>Set <code>VITE_CLIENT_ID</code> to your Azure App Registration client ID</li>
          <li>Set <code>VITE_TENANT_ID</code> to your Azure AD tenant ID</li>
          <li>Restart the dev server (<code>npm run dev</code>)</li>
        </ol>
      </div>
    `
    return
  }

  try {
    await initAuth()

    if (isAuthenticated()) {
      const account = getActiveAccount()
      if (account) {
        store.dispatch({
          type: 'SET_AUTH',
          payload: {
            isAuthenticated: true,
            userName: account.name ?? null,
            userEmail: account.username ?? null,
            tenantId: account.tenantId ?? null,
          },
        })
      }
    }
  } catch (err) {
    console.error('[Bootstrap] Auth init failed', err)
    // Continue anyway — the auth panel will handle sign-in
  }

  mountApp(root)
  initRouter()
}

bootstrap().catch(console.error)
