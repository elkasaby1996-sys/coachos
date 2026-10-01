/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PADDLE_SANDBOX_CLIENT_TOKEN?: string;
  readonly VITE_BILLING_PROVIDER?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_MARKETING_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
