export const wearableProviders = ["garmin", "whoop"] as const;
export type WearableProvider = (typeof wearableProviders)[number] | string;

export const wearableMetricGroups = [
  "sleep",
  "recovery",
  "load_strain",
  "activity",
  "workouts",
  "body_metrics",
] as const;
export type WearableMetricGroup = (typeof wearableMetricGroups)[number];

export type PtWearableVisibilityMode = "hidden" | "summary_only" | "full_metrics";
export type WearableConnectionStatus =
  | "disconnected"
  | "connected"
  | "sync_failed"
  | "revoked"
  | "pending";
export type WearableMetricState =
  | "unsupported"
  | "no_data"
  | "stale"
  | "sync_failed"
  | "connected";

export type WorkspaceWearableSettings = {
  id: string;
  workspace_id: string;
  enabled: boolean;
  allowed_providers: string[];
  enabled_metric_groups: WearableMetricGroup[];
  pt_visibility_mode: PtWearableVisibilityMode;
  client_can_disconnect: boolean;
  data_retention_mode: string;
  freshness_threshold_hours: number;
  client_consent_copy?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClientWearableConnection = {
  id: string;
  workspace_id: string;
  client_id: string;
  provider: string;
  open_wearables_user_id: string | null;
  open_wearables_connection_id: string | null;
  status: WearableConnectionStatus | string;
  consent_granted_at: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_provider_sync_at: string | null;
  revoked_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClientWearableDailyMetric = {
  id: string;
  workspace_id: string;
  client_id: string;
  provider: string;
  metric_date: string;
  steps: number | null;
  active_minutes: number | null;
  distance_meters: number | null;
  calories_active_kcal: number | null;
  calories_total_kcal: number | null;
  avg_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  resting_heart_rate_bpm: number | null;
  hrv_rmssd_ms: number | null;
  spo2_percent: number | null;
  data_quality: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClientWearableSleepSession = {
  id: string;
  workspace_id: string;
  client_id: string;
  provider: string;
  provider_record_id: string | null;
  sleep_date: string;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number | null;
  sleep_score: number | null;
  sleep_efficiency_percent: number | null;
  awake_minutes: number | null;
  light_minutes: number | null;
  deep_minutes: number | null;
  rem_minutes: number | null;
  avg_hr_bpm: number | null;
  avg_hrv_ms: number | null;
  avg_spo2_percent: number | null;
  respiratory_rate: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClientWearableHealthScore = {
  id: string;
  workspace_id: string;
  client_id: string;
  provider: string;
  provider_record_id: string | null;
  score_type: string;
  score_value: number | null;
  score_unit: string | null;
  recorded_at: string;
  components: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClientWearableActivity = {
  id: string;
  workspace_id: string;
  client_id: string;
  provider: string;
  provider_record_id: string | null;
  activity_type: string;
  start_at: string | null;
  end_at: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  calories_kcal: number | null;
  avg_hr_bpm: number | null;
  max_hr_bpm: number | null;
  strain_score: number | null;
  source_payload_ref: string | null;
  created_at: string | null;
  updated_at: string | null;
};
