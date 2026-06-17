import { signIn } from '../../auth/authService'

export function renderAuthPanel(
  container: HTMLElement,
  _onAuthenticated: () => void,
): void {
  container.innerHTML = `
    <div class="auth-panel-wrapper">
      <div class="auth-panel-card">
        <div class="auth-panel-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="8" fill="#0078d4"/>
            <path d="M12 24L24 12L36 24L24 36L12 24Z" fill="white" opacity="0.9"/>
            <path d="M24 12L36 24L24 36" fill="white" opacity="0.4"/>
          </svg>
        </div>
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
        <div id="auth-status" class="auth-panel-status"></div>
      </div>
    </div>
  `

  container.querySelector('#btn-signin')!.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-signin') as HTMLButtonElement
    const status = container.querySelector('#auth-status') as HTMLElement
    btn.disabled = true
    btn.textContent = 'Redirecting to Microsoft…'
    status.className = 'auth-panel-status'

    try {
      await signIn()
    } catch (err) {
      console.error('[Auth] Sign-in failed', err)
      status.className = 'auth-panel-status error'
      status.textContent = `Sign-in failed: ${(err as Error).message}`
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
