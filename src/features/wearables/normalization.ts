import type {
  WearableConnectionStatus,
  WearableMetricState,
  WearableProvider,
} from "./types";

type Capability = "supported" | "unsupported" | "provider_score";
type MetricCapabilityKey =
  | "steps"
  | "sleep"
  | "activity"
  | "workouts"
  | "recovery"
  | "strain"
  | "stress"
  | "body_battery";

export const providerCapabilityMatrix: Record<
  string,
  Record<MetricCapabilityKey, Capability>
> = {
  garmin: {
    steps: "supported",
    sleep: "supported",
    activity: "supported",
    workouts: "supported",
    recovery: "supported",
    strain: "unsupported",
    stress: "provider_score",
    body_battery: "provider_score",
  },
  whoop: {
    steps: "unsupported",
    sleep: "supported",
    activity: "supported",
    workouts: "supported",
    recovery: "provider_score",
    strain: "provider_score",
    stress: "unsupported",
    body_battery: "unsupported",
  },
};

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const dateKeyFromIso = (value: unknown): string | null => {
  const raw = stringOrNull(value);
  if (!raw) return null;
  return raw.slice(0, 10);
};

export function getProviderCapability(
  provider: WearableProvider,
  metric: MetricCapabilityKey,
): Capability {
  const normalizedProvider = provider.toLowerCase();
  return providerCapabilityMatrix[normalizedProvider]?.[metric] ?? "unsupported";
}

export function getProviderScoreLabel(provider: WearableProvider, score: string) {
  const normalizedProvider = provider.toLowerCase();
  const normalizedScore = score.toLowerCase().replace(/_/g, " ");
  if (normalizedProvider === "whoop" && normalizedScore === "strain") {
    return "WHOOP strain";
  }
  if (normalizedProvider === "whoop" && normalizedScore === "recovery") {
    return "WHOOP recovery";
  }
  if (normalizedProvider === "garmin" && normalizedScore === "stress") {
    return "Garmin stress";
  }
  if (normalizedProvider === "garmin" && normalizedScore === "body battery") {
    return "Garmin body battery";
  }
  return `${provider.toUpperCase()} ${normalizedScore}`;
}

export function getWearableMetricState(params: {
  supported: boolean;
  value: unknown;
  status: WearableConnectionStatus | string | null | undefined;
  lastSyncAt: string | null | undefined;
  now?: string;
  freshnessThresholdHours: number;
}): WearableMetricState {
  if (!params.supported) return "unsupported";
  if (params.status === "sync_failed") return "sync_failed";
  if (params.status !== "connected") return "no_data";
  if (!params.lastSyncAt) return "no_data";

  const nowMs = new Date(params.now ?? new Date().toISOString()).getTime();
  const lastSyncMs = new Date(params.lastSyncAt).getTime();
  const staleMs = params.freshnessThresholdHours * 60 * 60 * 1000;
  if (Number.isFinite(nowMs) && Number.isFinite(lastSyncMs) && nowMs - lastSyncMs > staleMs) {
    return "stale";
  }

  return params.value === null || params.value === undefined ? "no_data" : "connected";
}

export function normalizeDailyMetric(params: {
  workspaceId: string;
  clientId: string;
  provider: WearableProvider;
  metricDate: string;
  source: Record<string, unknown>;
}) {
  const { workspaceId, clientId, provider, metricDate, source } = params;
  return {
    workspace_id: workspaceId,
    client_id: clientId,
    provider,
    metric_date: metricDate,
    steps: numberOrNull(source.steps),
    active_minutes: numberOrNull(source.active_minutes ?? source.activeMinutes),
    distance_meters: numberOrNull(source.distance_meters ?? source.distanceMeters),
    calories_active_kcal: numberOrNull(source.calories_active_kcal ?? source.activeCalories),
    calories_total_kcal: numberOrNull(source.calories_total_kcal ?? source.totalCalories),
    avg_heart_rate_bpm: numberOrNull(source.avg_heart_rate_bpm ?? source.averageHeartRate),
    max_heart_rate_bpm: numberOrNull(source.max_heart_rate_bpm ?? source.maxHeartRate),
    resting_heart_rate_bpm: numberOrNull(source.resting_heart_rate_bpm ?? source.restingHeartRate),
    hrv_rmssd_ms: numberOrNull(source.hrv_rmssd_ms ?? source.hrvRmssdMs),
    spo2_percent: numberOrNull(source.spo2_percent ?? source.spo2Percent),
    data_quality: stringOrNull(source.data_quality ?? source.dataQuality),
    upsertKey: `${workspaceId}:${clientId}:${provider}:${metricDate}`,
  };
}

export function normalizeSleepSession(params: {
  workspaceId: string;
  clientId: string;
  provider: WearableProvider;
  source: Record<string, unknown>;
}) {
  const { workspaceId, clientId, provider, source } = params;
  const providerRecordId =
    stringOrNull(source.id) ??
    stringOrNull(source.provider_record_id) ??
    `${stringOrNull(source.start_at) ?? "unknown-start"}:${stringOrNull(source.end_at) ?? "unknown-end"}`;
  const sleepDate =
    dateKeyFromIso(source.sleep_date) ??
    dateKeyFromIso(source.start_at) ??
    new Date().toISOString().slice(0, 10);

  return {
    workspace_id: workspaceId,
    client_id: clientId,
    provider,
    provider_record_id: providerRecordId,
    sleep_date: sleepDate,
    start_at: stringOrNull(source.start_at ?? source.startAt),
    end_at: stringOrNull(source.end_at ?? source.endAt),
    duration_minutes: numberOrNull(source.duration_minutes ?? source.durationMinutes),
    sleep_score: numberOrNull(source.sleep_score ?? source.sleepScore),
    sleep_efficiency_percent: numberOrNull(source.sleep_efficiency_percent ?? source.sleepEfficiencyPercent),
    awake_minutes: numberOrNull(source.awake_minutes ?? source.awakeMinutes),
    light_minutes: numberOrNull(source.light_minutes ?? source.lightMinutes),
    deep_minutes: numberOrNull(source.deep_minutes ?? source.deepMinutes),
    rem_minutes: numberOrNull(source.rem_minutes ?? source.remMinutes),
    avg_hr_bpm: numberOrNull(source.avg_hr_bpm ?? source.averageHeartRate),
    avg_hrv_ms: numberOrNull(source.avg_hrv_ms ?? source.averageHrv),
    avg_spo2_percent: numberOrNull(source.avg_spo2_percent ?? source.averageSpo2),
    respiratory_rate: numberOrNull(source.respiratory_rate ?? source.respiratoryRate),
    upsertKey: `${workspaceId}:${clientId}:${provider}:${providerRecordId}`,
  };
}

export function normalizeHealthScore(params: {
  workspaceId: string;
  clientId: string;
  provider: WearableProvider;
  source: Record<string, unknown>;
}) {
  const { workspaceId, clientId, provider, source } = params;
  const scoreType = stringOrNull(source.type ?? source.score_type) ?? "score";
  const providerRecordId =
    stringOrNull(source.id ?? source.provider_record_id) ??
    `${scoreType}:${stringOrNull(source.recorded_at) ?? "unknown"}`;

  return {
    workspace_id: workspaceId,
    client_id: clientId,
    provider,
    provider_record_id: providerRecordId,
    score_type: scoreType,
    score_value: numberOrNull(source.value ?? source.score_value),
    score_unit: stringOrNull(source.unit ?? source.score_unit),
    recorded_at:
      stringOrNull(source.recorded_at ?? source.recordedAt) ??
      new Date().toISOString(),
    components:
      source.components && typeof source.components === "object"
        ? (source.components as Record<string, unknown>)
        : null,
    label: getProviderScoreLabel(provider, scoreType),
    upsertKey: `${workspaceId}:${clientId}:${provider}:${providerRecordId}:${scoreType}`,
  };
}

export function normalizeActivity(params: {
  workspaceId: string;
  clientId: string;
  provider: WearableProvider;
  source: Record<string, unknown>;
}) {
  const { workspaceId, clientId, provider, source } = params;
  const providerRecordId =
    stringOrNull(source.id ?? source.provider_record_id) ??
    `${stringOrNull(source.activity_type) ?? "activity"}:${stringOrNull(source.start_at) ?? "unknown"}`;

  return {
    workspace_id: workspaceId,
    client_id: clientId,
    provider,
    provider_record_id: providerRecordId,
    activity_type:
      stringOrNull(source.activity_type ?? source.activityType ?? source.type) ??
      "activity",
    start_at: stringOrNull(source.start_at ?? source.startAt),
    end_at: stringOrNull(source.end_at ?? source.endAt),
    duration_seconds: numberOrNull(source.duration_seconds ?? source.durationSeconds),
    distance_meters: numberOrNull(source.distance_meters ?? source.distanceMeters),
    calories_kcal: numberOrNull(source.calories_kcal ?? source.calories),
    avg_hr_bpm: numberOrNull(source.avg_hr_bpm ?? source.averageHeartRate),
    max_hr_bpm: numberOrNull(source.max_hr_bpm ?? source.maxHeartRate),
    strain_score: numberOrNull(source.strain_score ?? source.strain),
    source_payload_ref: stringOrNull(source.source_payload_ref ?? source.sourcePayloadRef),
    upsertKey: `${workspaceId}:${clientId}:${provider}:${providerRecordId}`,
  };
}
