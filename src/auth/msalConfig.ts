import { type Configuration, type PopupRequest, LogLevel } from '@azure/msal-browser';

// Read from Vite env vars, with optional runtime override from Azure Static Web Apps
const runtimeConfig = (window as unknown as Record<string, unknown>).__APP_CONFIG__ as
  | { clientId?: string; tenantId?: string }
  | undefined;

const clientId =
  runtimeConfig?.clientId ?? import.meta.env.VITE_CLIENT_ID ?? '';
const tenantId =
  runtimeConfig?.tenantId ?? import.meta.env.VITE_TENANT_ID ?? '';

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
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

/** Scopes requested at login — must be pre-consented in the Azure App Registration */
export const loginRequest: PopupRequest = {
  scopes: [
    'User.Read',
    'User.ReadBasic.All',
    'People.Read',
    'Sites.ReadWrite.All',
    'Sites.Manage.All',
    'Files.ReadWrite.All',
    'Group.ReadWrite.All',
    'Directory.ReadWrite.All',
    'Reports.Read.All',
  ],
};
