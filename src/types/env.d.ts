/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ENABLE_OUTBOX_SYNC_IN_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
