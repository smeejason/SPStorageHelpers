/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLIENT_ID: string
  readonly VITE_TENANT_ID: string
  readonly VITE_SP_SITE_ID: string
  readonly VITE_SP_LIST_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
