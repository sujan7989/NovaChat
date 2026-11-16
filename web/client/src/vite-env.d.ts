/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. https://api.example.com. Unset in dev (uses Vite proxy). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
