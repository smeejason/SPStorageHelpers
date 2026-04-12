# M365 SPA Starter Template

A ready-to-go TypeScript SPA template with working Microsoft 365 authentication.
Clone this branch as a starting point for any new M365/SharePoint app.

## Quick Start

```bash
# Clone this template
git clone -b template/m365-spa-starter https://github.com/smeejason/SPStorageHelpers.git my-new-app
cd my-new-app

# Remove template git history and start fresh
rm -rf .git
git init

# Install dependencies
npm install

# Configure auth
cp .env.example .env.local
# Edit .env.local with your VITE_CLIENT_ID and VITE_TENANT_ID

# Run
npm run dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ES2020) |
| Bundler | Vite |
| Auth | MSAL Browser v3 (OAuth2 PKCE, redirect flow) |
| API | Microsoft Graph Client |
| UI | Vanilla TypeScript + DOM manipulation |
| State | Custom Redux-like store |
| Data Export | ExcelJS, PapaParse, JSZip |
| Hosting | Azure Static Web Apps |

## Auth Setup (What You Need)

### 1. Azure AD App Registration

Create an App Registration in Azure Portal → Entra ID:

- **Platform**: Single-page application (SPA)
- **Redirect URI**: `http://localhost:5173` (dev)
- **Delegated permissions** (admin-consent required):
  - `User.Read`, `User.ReadBasic.All`, `People.Read`
  - `Sites.ReadWrite.All`, `Sites.Manage.All`
  - `Files.ReadWrite.All`, `Group.ReadWrite.All`
  - `Directory.ReadWrite.All`, `Reports.Read.All`

### 2. Environment Variables

Create `.env.local` in the project root:

```
VITE_CLIENT_ID=your-app-registration-client-id
VITE_TENANT_ID=your-azure-tenant-id
```

### 3. That's It

The auth flow works like this:

```
App loads → initAuth() → handleRedirectPromise()
  → Has token in sessionStorage?
    YES → Skip login, show app
    NO  → Show "Sign in with Microsoft" screen
      → Click → loginRedirect() → page navigates to Microsoft login
      → User authenticates → Microsoft redirects back to app
      → handleRedirectPromise() picks up the token
      → App renders authenticated
```

## Auth Architecture (Key Files)

| File | What It Does |
|------|-------------|
| `src/auth/msalConfig.ts` | MSAL config: reads `VITE_CLIENT_ID`/`VITE_TENANT_ID`, sets sessionStorage cache, defines scopes |
| `src/auth/authService.ts` | `initAuth()`, `signIn()` (redirect), `signOut()`, `getToken(scopes?)`, `isAuthenticated()` |
| `src/ui/components/authPanel.ts` | Login screen: centered card with "Sign in with Microsoft" button |
| `src/main.ts` | Bootstrap: init MSAL → check auth → show login or mount app |
| `src/services/graphClient.ts` | Graph client with auto-injected bearer token via `getToken()` |

## Key Decisions & Gotchas

- **MSAL v3** (`@azure/msal-browser@^3.x`): v5 has breaking popup issues with Vite 8. Stick with v3.
- **Redirect flow, not popup**: Popup flow has cross-window issues with Vite's dev server. Redirect flow is reliable everywhere.
- **sessionStorage** (not localStorage): Auth tokens are per-tab, cleared on browser close. More secure.
- **Runtime config override**: If `window.__APP_CONFIG__` exists (Azure Static Web Apps injection), it takes precedence over Vite env vars.
- **Scopes**: Edit `loginRequest.scopes` in `msalConfig.ts` to match your app's needs.

## Customising for a New Project

1. Update `package.json` name/description
2. Edit scopes in `src/auth/msalConfig.ts` to match your app's permissions
3. Replace pages in `src/ui/pages/` with your own
4. Update nav items in `src/ui/components/navbar.ts`
5. Update types in `src/types/index.ts`
6. Add your Graph API calls in `src/services/`

## Deployment

Configured for **Azure Static Web Apps** via `staticwebapp.config.json`.

- **App location**: `/`
- **Output location**: `dist`
- **Build command**: `npm run build`
- **Prod redirect URI**: Add your Azure SWA URL to the App Registration
