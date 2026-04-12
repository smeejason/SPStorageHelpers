import { signIn, isAuthenticated } from '../../auth/authService'
import { getGraphClient } from '../../services/graphClient'
import { store } from '../../store/store'

export function renderAuthPanel(
  container: HTMLElement,
  onAuthenticated: () => void,
): void {
  // If already authenticated, skip login
  if (isAuthenticated()) {
    onAuthenticated()
    return
  }

  container.innerHTML = `
    <div class="auth-panel-wrapper">
      <div class="auth-panel-card">
        <div class="auth-panel-logo">SP</div>
        <h1 class="auth-panel-title">SP Storage Helpers</h1>
        <p class="auth-panel-subtitle">Sign in with your Microsoft 365 account to analyse and manage SharePoint tenant storage.</p>
        <button id="btn-signin" class="btn btn-microsoft btn-large">
          <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Sign in with Microsoft
        </button>
        <div id="auth-status" class="auth-panel-status" style="display:none"></div>
      </div>
    </div>
  `

  container.querySelector('#btn-signin')!.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-signin') as HTMLButtonElement
    const status = container.querySelector('#auth-status') as HTMLElement
    btn.disabled = true
    btn.textContent = 'Signing in…'
    status.style.display = 'none'

    try {
      const account = await signIn()

      store.dispatch({
        type: 'SET_AUTH',
        payload: {
          isAuthenticated: true,
          userName: account.name ?? null,
          userEmail: account.username ?? null,
          tenantId: account.tenantId ?? null,
        },
      })

      // Verify Graph connectivity
      status.className = 'auth-panel-status'
      status.textContent = 'Verifying Graph API connection…'
      status.style.display = 'block'

      try {
        const client = getGraphClient()
        await client.api('/sites/root').select('id,displayName').get()
      } catch {
        console.warn('[Auth] Could not reach root site — continuing anyway')
      }

      onAuthenticated()
    } catch (err) {
      console.error('[Auth] Sign-in failed', err)
      status.className = 'auth-panel-status error'
      status.textContent = `Sign-in failed: ${(err as Error).message}`
      status.style.display = 'block'
      btn.disabled = false
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
          <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
        </svg>
        Sign in with Microsoft
      `
    }
  })
}
