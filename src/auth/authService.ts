import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
} from '@azure/msal-browser';
import { msalConfig, graphScopes } from './msalConfig';

let msalInstance: PublicClientApplication | null = null;

/** Initialise the MSAL instance (call once at app startup) */
export async function initAuth(): Promise<PublicClientApplication> {
  msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();

  // Handle redirect promise (e.g. after login redirect)
  const response = await msalInstance.handleRedirectPromise();
  if (response?.account) {
    msalInstance.setActiveAccount(response.account);
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

/** Sign in with a popup */
export async function signIn(): Promise<AccountInfo | null> {
  const msal = getMsalInstance();
  try {
    const result: AuthenticationResult = await msal.loginPopup({
      scopes: graphScopes,
    });
    msal.setActiveAccount(result.account);
    return result.account;
  } catch (err) {
    console.error('Sign-in failed', err);
    return null;
  }
}

/** Sign out */
export async function signOut(): Promise<void> {
  const msal = getMsalInstance();
  const account = msal.getActiveAccount();
  await msal.logoutPopup({ account });
}

/** Acquire a token silently, falling back to popup if needed */
export async function getAccessToken(): Promise<string> {
  const msal = getMsalInstance();
  const account = msal.getActiveAccount();
  if (!account) {
    throw new Error('No active account – user must sign in first');
  }

  try {
    const result = await msal.acquireTokenSilent({
      scopes: graphScopes,
      account,
    });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const result = await msal.acquireTokenPopup({
        scopes: graphScopes,
        account,
      });
      return result.accessToken;
    }
    throw err;
  }
}
