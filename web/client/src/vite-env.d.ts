/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Preferred backend origin. Unset in dev (uses Vite proxy). */
  readonly VITE_BACKEND_URL?: string;
  /** Legacy fallback for existing deployments. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
