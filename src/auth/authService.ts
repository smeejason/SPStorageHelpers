import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  BrowserAuthError,
  type AccountInfo,
} from '@azure/msal-browser';
import { msalConfig, loginRequest } from './msalConfig';

let msalInstance: PublicClientApplication | null = null;

/** Initialise the MSAL instance (call once at app startup) */
export async function initAuth(): Promise<PublicClientApplication> {
  msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();

  // Handle redirect promise (e.g. after redirect-based login)
  // Catch stale/corrupt sessionStorage entries that cause no_token_request_cache_error
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response?.account) {
      msalInstance.setActiveAccount(response.account);
    }
  } catch (err) {
    console.warn('[Auth] handleRedirectPromise failed — clearing stale cache', err);
    sessionStorage.clear();
  }

  // If no active account yet, pick the first cached one (session restore)
  if (!msalInstance.getActiveAccount()) {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      msalInstance.setActiveAccount(accounts[0]);
    }
  }

  return msalInstance;
}

/** Get the current MSAL instance */
export function getMsalInstance(): PublicClientApplication {
  if (!msalInstance) {
    throw new Error('MSAL not initialised – call initAuth() first');
  }
  return msalInstance;
}

/** Get the currently signed-in account, or null */
export function getActiveAccount(): AccountInfo | null {
  return getMsalInstance().getActiveAccount();
}

/** Check whether the user has an active session (token in sessionStorage) */
export function isAuthenticated(): boolean {
  return getMsalInstance().getActiveAccount() !== null;
}

/**
 * Sign in with a popup.
 * Falls back to redirect flow if the popup is blocked (COOP policy / browser settings).
 */
export async function signIn(): Promise<AccountInfo | null> {
  const msal = getMsalInstance();
  try {
    const result = await msal.loginPopup(loginRequest);
    msal.setActiveAccount(result.account);
    return result.account;
  } catch (err) {
    // Popup blocked — fall back to redirect
    if (
      err instanceof BrowserAuthError &&
      (err.errorCode === 'popup_window_error' ||
        err.errorCode === 'empty_window_error')
    ) {
      console.warn('[Auth] Popup blocked, falling back to redirect flow');
      await msal.loginRedirect(loginRequest);
      return null; // Page will redirect, this won't resolve
    }
    console.error('Sign-in failed', err);
    return null;
  }
}

/** Sign out (popup, with redirect fallback) */
export async function signOut(): Promise<void> {
  const msal = getMsalInstance();
  const account = msal.getActiveAccount();
  try {
    await msal.logoutPopup({ account });
  } catch {
    await msal.logoutRedirect({ account });
  }
}

/**
 * Acquire a token silently, falling back to popup (then redirect) if needed.
 * Pass custom scopes for SharePoint-scoped tokens, otherwise uses the login scopes.
 */
export async function getToken(
  scopes?: string[],
): Promise<string> {
  const msal = getMsalInstance();
  const account = msal.getActiveAccount();
  if (!account) {
    throw new Error('No active account – user must sign in first');
  }

  const requestScopes = scopes ?? loginRequest.scopes;

  try {
    const result = await msal.acquireTokenSilent({
      scopes: requestScopes,
      account,
    });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      try {
        const result = await msal.acquireTokenPopup({
          scopes: requestScopes,
          account,
        });
        return result.accessToken;
      } catch (popupErr) {
        // Popup blocked — redirect
        if (
          popupErr instanceof BrowserAuthError &&
          (popupErr.errorCode === 'popup_window_error' ||
            popupErr.errorCode === 'empty_window_error')
        ) {
          await msal.acquireTokenRedirect({
            scopes: requestScopes,
            account,
          });
          // Page redirects — will never reach here
          return '';
        }
        throw popupErr;
      }
    }
    throw err;
  }
}
