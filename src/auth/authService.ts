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
  console.log('[Auth] Starting MSAL initialization...');

  // Proactively clear any stale MSAL temporary cache entries
  // that cause no_token_request_cache_error on page reload
  try {
    const clientId = msalConfig.auth?.clientId ?? '';
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key &&
        (key.startsWith('msal.') ||
          key.startsWith(`msal.${clientId}.`) ||
          key.includes('interaction.status') ||
          key.includes('request.params') ||
          key.includes('urlHash'))
      ) {
        keysToRemove.push(key);
      }
    }
    if (keysToRemove.length > 0) {
      console.log('[Auth] Clearing stale MSAL keys:', keysToRemove);
      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    }
  } catch (e) {
    console.warn('[Auth] Could not clear sessionStorage', e);
  }

  try {
    msalInstance = new PublicClientApplication(msalConfig);
    console.log('[Auth] MSAL instance created, calling initialize()...');
    await msalInstance.initialize();
    console.log('[Auth] MSAL initialized successfully');
  } catch (initErr) {
    console.warn('[Auth] initialize() failed, clearing ALL sessionStorage and retrying', initErr);
    sessionStorage.clear();
    msalInstance = new PublicClientApplication(msalConfig);
    await msalInstance.initialize();
    console.log('[Auth] MSAL initialized successfully on retry');
  }

  // Handle redirect promise (e.g. after redirect-based login)
  try {
    console.log('[Auth] Calling handleRedirectPromise()...');
    const response = await msalInstance.handleRedirectPromise();
    if (response?.account) {
      console.log('[Auth] Redirect login successful:', response.account.username);
      msalInstance.setActiveAccount(response.account);
    } else {
      console.log('[Auth] No redirect response (normal fresh load)');
    }
  } catch (err) {
    console.warn('[Auth] handleRedirectPromise() failed — clearing sessionStorage', err);
    sessionStorage.clear();
  }

  // If no active account yet, pick the first cached one (session restore)
  if (!msalInstance.getActiveAccount()) {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      console.log('[Auth] Restoring cached account:', accounts[0].username);
      msalInstance.setActiveAccount(accounts[0]);
    } else {
      console.log('[Auth] No cached accounts — user needs to sign in');
    }
  } else {
    console.log('[Auth] Active account:', msalInstance.getActiveAccount()?.username);
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
    console.log('[Auth] Attempting popup login...');
    const result = await msal.loginPopup({
      ...loginRequest,
      redirectUri: `${window.location.origin}/redirect.html`,
    });
    console.log('[Auth] Popup login successful:', result.account.username);
    msal.setActiveAccount(result.account);
    return result.account;
  } catch (err) {
    // Popup blocked — fall back to full-page redirect
    if (
      err instanceof BrowserAuthError &&
      (err.errorCode === 'popup_window_error' ||
        err.errorCode === 'empty_window_error')
    ) {
      console.warn('[Auth] Popup blocked, falling back to redirect flow');
      await msal.loginRedirect(loginRequest);
      return null;
    }
    console.error('[Auth] Sign-in failed', err);
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
          redirectUri: `${window.location.origin}/redirect.html`,
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
          return '';
        }
        throw popupErr;
      }
    }
    throw err;
  }
}
