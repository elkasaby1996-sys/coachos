/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_EXERCISE_DATASET_BASE_URL?: string;
  readonly VITE_EXERCISE_DATASET_API_KEY?: string;
  readonly VITE_EXERCISE_DATASET_API_KEY_HEADER?: string;
  readonly VITE_EXERCISE_DATASET_API_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
