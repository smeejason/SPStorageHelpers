# SP Storage Helpers

A TypeScript SPA that connects to Microsoft 365 via the Graph API to analyse SharePoint tenant storage usage, identify space-wasting content, and provide cleanup recommendations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ES2020) |
| Bundler | Vite |
| Auth | Azure MSAL Browser (OAuth2) |
| API | Microsoft Graph Client |
| UI | Vanilla TypeScript + DOM manipulation |
| State | Custom Redux-like store pattern |
| Data | ExcelJS, PapaParse, JSZip |
| Hosting | Azure Static Web Apps |

## Features

- **Dashboard** — Tenant-level storage overview with usage bars and top-site rankings
- **Site Analysis** — Drill into individual sites: large files, recycle bins, version bloat
- **Cleanup Recommendations** — Auto-generated suggestions ranked by savings and risk
- **Data Export** — Download reports as CSV, Excel, or a bundled ZIP

## Prerequisites

1. **Node.js** >= 18
2. An **Azure AD App Registration** (Entra ID) with:
   - **SPA** platform redirect URI: `http://localhost:3000` (dev) or your deployed URL
   - The following **delegated** permissions (admin-consented):
     - `User.Read`, `User.ReadBasic.All`, `People.Read`
     - `Sites.ReadWrite.All`, `Sites.Manage.All`
     - `Files.ReadWrite.All`, `Group.ReadWrite.All`
     - `Directory.ReadWrite.All`, `Reports.Read.All`

## Authentication

The app uses **MSAL.js with PKCE** — no client secrets in code.

| Variable | Purpose |
|----------|---------|
| `VITE_CLIENT_ID` | Azure App Registration client/application ID |
| `VITE_TENANT_ID` | Azure AD tenant ID (your org's directory ID) |

**Flow:** App loads → MSAL initialises → checks `sessionStorage` for an existing token → if authenticated, skips straight to the dashboard; otherwise shows a centered "Sign in with Microsoft" login screen. Login uses a popup, with automatic redirect fallback if the popup is blocked.

## Getting Started

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env.local
# Edit .env.local with your VITE_CLIENT_ID and VITE_TENANT_ID

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
  auth/           # MSAL authentication config & service
  services/       # Microsoft Graph client & storage data service
  store/          # Redux-like global state management
  types/          # TypeScript interfaces & type definitions
  ui/
    components/   # Reusable UI components (navbar, loader, storage bar, auth panel)
    pages/        # Page-level views (dashboard, site analysis, cleanup, export)
  utils/          # Formatting helpers
  styles/         # CSS styles
  main.ts         # Application entry point
```

## Deployment

This project is configured for **Azure Static Web Apps**. The `staticwebapp.config.json` handles SPA routing fallback and security headers.

Set the following in your Static Web App configuration:
- **App location**: `/`
- **Output location**: `dist`
- **Build command**: `npm run build`
