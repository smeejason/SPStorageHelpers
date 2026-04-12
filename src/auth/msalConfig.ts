import { Configuration, LogLevel } from '@azure/msal-browser';

/**
 * MSAL configuration.
 *
 * Before running, create a `.env.local` file in the project root with:
 *   VITE_AZURE_CLIENT_ID=<your-app-registration-client-id>
 *   VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/<your-tenant-id>
 *   VITE_AZURE_REDIRECT_URI=http://localhost:3000
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID ?? '',
    authority:
      import.meta.env.VITE_AZURE_AUTHORITY ??
      'https://login.microsoftonline.com/common',
    redirectUri:
      import.meta.env.VITE_AZURE_REDIRECT_URI ?? window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (_level, message, containsPii) => {
        if (!containsPii) {
          console.warn('[MSAL]', message);
        }
      },
    },
  },
};

/** Graph API scopes required by this application */
export const graphScopes = [
  'User.Read',
  'Sites.Read.All',
  'Sites.ReadWrite.All',
  'Reports.Read.All',
];
