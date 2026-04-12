import { initAuth, isAuthenticated, getActiveAccount } from './auth/authService'
import { store } from './store/store'
import { mountApp } from './ui/app'
import { initRouter } from './ui/router'
import './styles/main.css'

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) throw new Error('Missing #app element')

  // Show a loading state while MSAL initialises
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Segoe UI,sans-serif;color:#605e5c;">
      Loading…
    </div>
  `

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
