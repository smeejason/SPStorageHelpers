import {
  PublicClientApplication,
  type AccountInfo,
  InteractionRequiredAuthError,
} from '@azure/msal-browser'
import { msalConfig, loginRequest } from './msalConfig'

// ─── MSAL instance ────────────────────────────────────────────────────────────

const msalInstance = new PublicClientApplication(msalConfig)

let _initialized = false

export async function initAuth(): Promise<void> {
  if (_initialized) return
  await msalInstance.initialize()
  // Handle redirect response — this picks up the auth code after
  // Microsoft redirects back to our app
  const response = await msalInstance.handleRedirectPromise()
  if (response?.account) {
    msalInstance.setActiveAccount(response.account)
  }
  _initialized = true
}

// ─── Account helpers ──────────────────────────────────────────────────────────

function getAccount(): AccountInfo | null {
  return msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null
}

export function isAuthenticated(): boolean {
  return getAccount() !== null
}

export function getActiveAccount(): AccountInfo | null {
  return getAccount()
}

// ─── Sign in / out ────────────────────────────────────────────────────────────

/** Sign in using redirect flow (full page navigation, no popups) */
export async function signIn(): Promise<void> {
  await msalInstance.loginRedirect(loginRequest)
  // Page navigates away — this never resolves
}

export async function signOut(): Promise<void> {
  const account = getAccount()
  await msalInstance.logoutRedirect({ account: account ?? undefined })
}

// ─── Token acquisition ────────────────────────────────────────────────────────

export async function getToken(scopes: string[] = loginRequest.scopes ?? []): Promise<string> {
  const account = getAccount()
  if (!account) throw new Error('Not authenticated')

  try {
    const result = await msalInstance.acquireTokenSilent({ scopes, account })
    return result.accessToken
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      // Token expired and needs interaction — redirect to re-auth
      await msalInstance.acquireTokenRedirect({ scopes, account })
      return '' // Page navigates away
    }
    throw err
  }
}
