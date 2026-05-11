import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type OpenWearablesAction = "authorize" | "disconnect" | "status" | "sync";
const supportedProviders = ["garmin", "whoop"] as const;
type SupportedProvider = (typeof supportedProviders)[number];

type WearableSettings = {
  enabled: boolean;
  allowed_providers: string[] | null;
  client_can_disconnect: boolean;
  data_retention_mode: string | null;
};

type OptionalFetchResult = {
  payload: Record<string, unknown>;
  failed: boolean;
  label: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getOptionalEnv(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function normalizeProvider(
  value: string | undefined,
): SupportedProvider | null {
  const normalized = value?.trim().toLowerCase();
  return supportedProviders.includes(normalized as SupportedProvider)
    ? (normalized as SupportedProvider)
    : null;
}

function getAllowedRedirectOrigins(req: Request) {
  const configuredOrigins = getOptionalEnv("ALLOWED_WEARABLE_REDIRECT_ORIGINS")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const requestOrigin = req.headers.get("Origin")?.trim().replace(/\/+$/, "");
  return new Set([...configuredOrigins, requestOrigin].filter(Boolean));
}

function assertAllowedRedirectUri(redirectUri: string, req: Request) {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return jsonResponse({ error: "Redirect URI is invalid" }, 400);
  }

  if (parsed.pathname !== "/app/wearables") {
    return jsonResponse({ error: "Redirect URI path is not allowed" }, 400);
  }

  if (!getAllowedRedirectOrigins(req).has(parsed.origin)) {
    return jsonResponse({ error: "Redirect URI origin is not allowed" }, 400);
  }

  return null;
}

async function loadWearableSettings(
  supabase: any,
  workspaceId: string | null,
): Promise<WearableSettings> {
  if (!workspaceId) {
    return {
      enabled: false,
      allowed_providers: [],
      client_can_disconnect: true,
      data_retention_mode: "retain_on_disconnect",
    };
  }

  const { data, error } = await supabase
    .from("workspace_wearable_settings")
    .select(
      "enabled, allowed_providers, client_can_disconnect, data_retention_mode",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;

  return {
    enabled: Boolean(data?.enabled),
    allowed_providers: Array.isArray(data?.allowed_providers)
      ? data.allowed_providers
      : [],
    client_can_disconnect: data?.client_can_disconnect !== false,
    data_retention_mode: data?.data_retention_mode ?? "retain_on_disconnect",
  };
}

function assertWearablesEnabled(
  settings: WearableSettings,
  provider?: SupportedProvider | null,
) {
  if (!settings.enabled) {
    return jsonResponse({ error: "Wearables are not enabled" }, 403);
  }

  if (
    provider &&
    !settings.allowed_providers
      ?.map((item) => item.trim().toLowerCase())
      .includes(provider)
  ) {
    return jsonResponse(
      { error: "Provider is not enabled for this workspace" },
      403,
    );
  }

  return null;
}

function getOpenWearablesBaseUrl() {
  const apiUrl = getEnv("OPEN_WEARABLES_API_URL").replace(/\/+$/, "");
  return apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl}/api/v1`;
}

async function parseOpenWearablesResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : typeof payload?.message === "string"
          ? payload.message
          : "Open Wearables request failed";
    throw new Error(detail);
  }
  return payload;
}

async function openWearablesGet(path: string) {
  const apiUrl = getOpenWearablesBaseUrl();
  const apiKey = getEnv("OPEN_WEARABLES_API_KEY");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "GET",
      headers: {
        "X-Open-Wearables-API-Key": apiKey,
      },
      signal: controller.signal,
    });
    return await parseOpenWearablesResponse(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function openWearablesPost(
  path: string,
  body: Record<string, unknown> = {},
  timeoutMs = 12_000,
) {
  const apiUrl = getOpenWearablesBaseUrl();
  const apiKey = getEnv("OPEN_WEARABLES_API_KEY");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Open-Wearables-API-Key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await parseOpenWearablesResponse(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function optionalOpenWearablesGet(
  label: string,
  path: string,
): Promise<OptionalFetchResult> {
  try {
    return {
      payload: await openWearablesGet(path),
      failed: false,
      label,
    };
  } catch (error) {
    console.error(`Open Wearables ${label} fetch failed`, error);
    return { payload: { data: [] }, failed: true, label };
  }
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rowsFromPayload(
  payload: Record<string, unknown>,
): Array<Record<string, any>> {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(bearerToken);
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as {
      action: OpenWearablesAction;
      clientId: string;
      provider?: string;
      redirectUri?: string;
      window?: { start: string; end: string };
    };

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, workspace_id, user_id, email, display_name, full_name")
      .eq("id", body.clientId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client) return jsonResponse({ error: "Client not found" }, 404);

    const provider = normalizeProvider(body.provider);
    const actionRequiresProvider =
      body.action === "authorize" ||
      body.action === "sync" ||
      body.action === "disconnect";
    if (actionRequiresProvider && !body.provider?.trim()) {
      return jsonResponse({ error: "Provider is required" }, 400);
    }
    if (actionRequiresProvider && !provider) {
      return jsonResponse({ error: "Unsupported wearable provider" }, 400);
    }

    const settings = await loadWearableSettings(supabase, client.workspace_id);

    if (body.action === "authorize") {
      if (!body.redirectUri) {
        return jsonResponse({ error: "Redirect URI is required" }, 400);
      }
      const settingsError = assertWearablesEnabled(settings, provider);
      if (settingsError) return settingsError;
      const redirectError = assertAllowedRedirectUri(body.redirectUri, req);
      if (redirectError) return redirectError;

      const existingUsers = await openWearablesGet(
        `/users?search=${encodeURIComponent(client.id)}&limit=100`,
      );
      const existingItems = Array.isArray(existingUsers.items)
        ? existingUsers.items
        : [];
      const existingUser = existingItems.find(
        (item) => item?.external_user_id === client.id,
      );
      const ensured =
        existingUser ??
        (await openWearablesPost("/users", {
          external_user_id: client.id,
          email: client.email ?? `${client.id}@repsync.local`,
          first_name: client.display_name ?? client.full_name ?? null,
          last_name: client.workspace_id,
        }));

      const openWearablesUserId = ensured.id;
      if (!openWearablesUserId) {
        throw new Error("Open Wearables did not return a user id");
      }
      const authQuery = new URLSearchParams({
        user_id: openWearablesUserId,
        redirect_uri: body.redirectUri,
      });
      const authPayload = await openWearablesGet(
        `/oauth/${provider}/authorize?${authQuery.toString()}`,
      );
      await supabase.from("client_wearable_connections").upsert(
        {
          workspace_id: client.workspace_id,
          client_id: client.id,
          provider,
          open_wearables_user_id: openWearablesUserId,
          status: "pending",
          consent_granted_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,client_id,provider" },
      );

      return jsonResponse({
        authorizationUrl:
          authPayload.authorization_url ?? authPayload.authorizationUrl,
      });
    }

    if (body.action === "disconnect") {
      if (settings.client_can_disconnect === false) {
        return jsonResponse({ error: "Disconnect disabled" }, 403);
      }
      await supabase
        .from("client_wearable_connections")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("client_id", client.id)
        .eq("provider", provider);
      if (settings.data_retention_mode === "delete_on_disconnect") {
        await Promise.all([
          supabase
            .from("client_wearable_daily_metrics")
            .delete()
            .eq("client_id", client.id)
            .eq("provider", provider),
          supabase
            .from("client_wearable_sleep_sessions")
            .delete()
            .eq("client_id", client.id)
            .eq("provider", provider),
          supabase
            .from("client_wearable_health_scores")
            .delete()
            .eq("client_id", client.id)
            .eq("provider", provider),
          supabase
            .from("client_wearable_activities")
            .delete()
            .eq("client_id", client.id)
            .eq("provider", provider),
        ]);
      }
      return jsonResponse({ status: "revoked" });
    }

    if (body.action === "status") {
      const { data } = await supabase
        .from("client_wearable_connections")
        .select("*")
        .eq("client_id", client.id);
      return jsonResponse({ connections: data ?? [] });
    }

    if (body.action === "sync") {
      const settingsError = assertWearablesEnabled(settings, provider);
      if (settingsError) return settingsError;
      const { data: connection } = await supabase
        .from("client_wearable_connections")
        .select("*")
        .eq("client_id", client.id)
        .eq("provider", provider)
        .maybeSingle();
      if (!connection?.open_wearables_user_id) {
        return jsonResponse({ error: "No Open Wearables user mapping" }, 409);
      }
      const window = body.window ?? {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      };
      const windowStartDate = window.start.slice(0, 10);
      const windowEndDate = window.end.slice(0, 10);
      const syncQuery = new URLSearchParams({
        summary_start_time: window.start,
        summary_end_time: window.end,
      });
      const openWearablesUserId = encodeURIComponent(
        connection.open_wearables_user_id,
      );
      const syncPayload = await openWearablesPost(
        `/providers/${provider}/users/${openWearablesUserId}/sync?${syncQuery.toString()}`,
        {},
        6_000,
      ).catch((error) => {
        console.error("Open Wearables sync trigger failed", error);
        return { status: "sync_trigger_failed" };
      });
      const timeseriesQuery = new URLSearchParams({
        start_time: window.start,
        end_time: window.end,
      });
      for (const type of [
        "steps",
        "heart_rate",
        "energy",
        "resting_heart_rate",
        "heart_rate_variability",
        "oxygen_saturation",
      ]) {
        timeseriesQuery.append("types", type);
      }
      const datedQuery = new URLSearchParams({
        start_date: windowStartDate,
        end_date: windowEndDate,
      });
      const [timeseries, sleep, workouts, scores] = await Promise.all([
        provider === "whoop"
          ? Promise.resolve({
              payload: { data: [] },
              failed: false,
              label: "timeseries",
            } satisfies OptionalFetchResult)
          : optionalOpenWearablesGet(
              "timeseries",
              `/users/${openWearablesUserId}/timeseries?${timeseriesQuery.toString()}`,
            ),
        optionalOpenWearablesGet(
          "sleep",
          `/users/${openWearablesUserId}/events/sleep?${datedQuery.toString()}`,
        ),
        optionalOpenWearablesGet(
          "workouts",
          `/users/${openWearablesUserId}/events/workouts?${datedQuery.toString()}`,
        ),
        optionalOpenWearablesGet(
          "health scores",
          `/users/${openWearablesUserId}/health-scores?${datedQuery.toString()}`,
        ),
      ]);

      const optionalFetches = [timeseries, sleep, workouts, scores];
      const failedFetches = optionalFetches
        .filter((result) => result.failed)
        .map((result) => result.label);
      const syncTriggerFailed = syncPayload.status === "sync_trigger_failed";
      const syncStatus =
        syncTriggerFailed || failedFetches.length === optionalFetches.length
          ? "sync_failed"
          : failedFetches.length > 0
            ? "sync_partial"
            : "succeeded";
      const syncRunStatus = syncStatus === "succeeded" ? "succeeded" : "failed";

      const dailyRows = rowsFromPayload(timeseries.payload).map((row) => ({
        workspace_id: client.workspace_id,
        client_id: client.id,
        provider,
        metric_date:
          stringOrNull(row.metric_date ?? row.date ?? row.recorded_at)?.slice(
            0,
            10,
          ) ?? new Date().toISOString().slice(0, 10),
        steps: numberOrNull(row.steps),
        active_minutes: numberOrNull(row.active_minutes ?? row.activeMinutes),
        distance_meters: numberOrNull(
          row.distance_meters ?? row.distanceMeters,
        ),
        calories_active_kcal: numberOrNull(
          row.calories_active_kcal ?? row.activeCalories,
        ),
        calories_total_kcal: numberOrNull(
          row.calories_total_kcal ?? row.totalCalories,
        ),
        avg_heart_rate_bpm: numberOrNull(
          row.avg_heart_rate_bpm ?? row.averageHeartRate,
        ),
        max_heart_rate_bpm: numberOrNull(
          row.max_heart_rate_bpm ?? row.maxHeartRate,
        ),
        resting_heart_rate_bpm: numberOrNull(
          row.resting_heart_rate_bpm ?? row.restingHeartRate,
        ),
        hrv_rmssd_ms: numberOrNull(row.hrv_rmssd_ms ?? row.hrvRmssdMs),
        spo2_percent: numberOrNull(row.spo2_percent ?? row.spo2Percent),
        data_quality: stringOrNull(row.data_quality ?? row.dataQuality),
      }));
      const sleepRows = rowsFromPayload(sleep.payload).map((row) => {
        const stages = objectOrEmpty(row.stages);
        const components = objectOrEmpty(row.components);
        return {
          workspace_id: client.workspace_id,
          client_id: client.id,
          provider,
          provider_record_id:
            stringOrNull(row.provider_record_id ?? row.id) ??
            `${stringOrNull(row.start_at ?? row.startAt ?? row.start_time) ?? "start"}:${stringOrNull(row.end_at ?? row.endAt ?? row.end_time) ?? "end"}`,
          sleep_date:
            stringOrNull(
              row.sleep_date ?? row.start_at ?? row.startAt ?? row.start_time,
            )?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
          start_at: stringOrNull(row.start_at ?? row.startAt ?? row.start_time),
          end_at: stringOrNull(row.end_at ?? row.endAt ?? row.end_time),
          duration_minutes:
            numberOrNull(row.duration_minutes ?? row.durationMinutes) ??
            (() => {
              const seconds = numberOrNull(
                row.sleep_duration_seconds ?? row.duration_seconds,
              );
              return seconds === null ? null : Math.round(seconds / 60);
            })(),
          sleep_score: numberOrNull(row.sleep_score ?? row.sleepScore),
          sleep_efficiency_percent: numberOrNull(
            row.sleep_efficiency_percent ??
              row.sleepEfficiencyPercent ??
              row.efficiency_percent ??
              objectOrEmpty(components.sleep_efficiency_percentage).value,
          ),
          awake_minutes: numberOrNull(
            row.awake_minutes ?? row.awakeMinutes ?? stages.awake_minutes,
          ),
          light_minutes: numberOrNull(
            row.light_minutes ?? row.lightMinutes ?? stages.light_minutes,
          ),
          deep_minutes: numberOrNull(
            row.deep_minutes ?? row.deepMinutes ?? stages.deep_minutes,
          ),
          rem_minutes: numberOrNull(
            row.rem_minutes ?? row.remMinutes ?? stages.rem_minutes,
          ),
          avg_hr_bpm: numberOrNull(
            row.avg_hr_bpm ?? row.averageHeartRate ?? row.avg_heart_rate_bpm,
          ),
          avg_hrv_ms: numberOrNull(
            row.avg_hrv_ms ?? row.averageHrv ?? row.avg_hrv_ms,
          ),
          avg_spo2_percent: numberOrNull(
            row.avg_spo2_percent ?? row.averageSpo2 ?? row.avg_spo2_percent,
          ),
          respiratory_rate: numberOrNull(
            row.respiratory_rate ?? row.respiratoryRate,
          ),
        };
      });
      const activityRows = rowsFromPayload(workouts.payload).map((row) => ({
        workspace_id: client.workspace_id,
        client_id: client.id,
        provider,
        provider_record_id:
          stringOrNull(row.provider_record_id ?? row.id) ??
          `${stringOrNull(row.activity_type ?? row.type) ?? "activity"}:${stringOrNull(row.start_at ?? row.startAt ?? row.start_time) ?? "start"}`,
        activity_type:
          stringOrNull(row.activity_type ?? row.activityType ?? row.type) ??
          "activity",
        start_at: stringOrNull(row.start_at ?? row.startAt ?? row.start_time),
        end_at: stringOrNull(row.end_at ?? row.endAt ?? row.end_time),
        duration_seconds: numberOrNull(
          row.duration_seconds ?? row.durationSeconds,
        ),
        distance_meters: numberOrNull(
          row.distance_meters ?? row.distanceMeters,
        ),
        calories_kcal: numberOrNull(row.calories_kcal ?? row.calories),
        avg_hr_bpm: numberOrNull(
          row.avg_hr_bpm ?? row.averageHeartRate ?? row.avg_heart_rate_bpm,
        ),
        max_hr_bpm: numberOrNull(
          row.max_hr_bpm ?? row.maxHeartRate ?? row.max_heart_rate_bpm,
        ),
        strain_score: numberOrNull(row.strain_score ?? row.strain),
        source_payload_ref: stringOrNull(
          row.source_payload_ref ?? row.sourcePayloadRef,
        ),
      }));
      const scoreRows = rowsFromPayload(scores.payload).map((row) => {
        const scoreType =
          stringOrNull(row.score_type ?? row.type ?? row.category) ?? "score";
        return {
          workspace_id: client.workspace_id,
          client_id: client.id,
          provider,
          provider_record_id:
            stringOrNull(row.provider_record_id ?? row.id) ??
            `${scoreType}:${stringOrNull(row.recorded_at ?? row.recordedAt) ?? "recorded"}`,
          score_type: scoreType,
          score_value: numberOrNull(row.score_value ?? row.value),
          score_unit: stringOrNull(row.score_unit ?? row.unit),
          recorded_at:
            stringOrNull(row.recorded_at ?? row.recordedAt) ??
            new Date().toISOString(),
          components:
            row.components && typeof row.components === "object"
              ? row.components
              : null,
        };
      });

      let recordsImported = 0;
      if (dailyRows.length) {
        const { error } = await supabase
          .from("client_wearable_daily_metrics")
          .upsert(dailyRows, {
            onConflict: "workspace_id,client_id,provider,metric_date",
          });
        if (error) throw error;
        recordsImported += dailyRows.length;
      }
      if (sleepRows.length) {
        const { error } = await supabase
          .from("client_wearable_sleep_sessions")
          .upsert(sleepRows, {
            onConflict: "workspace_id,client_id,provider,provider_record_id",
          });
        if (error) throw error;
        recordsImported += sleepRows.length;
      }
      if (activityRows.length) {
        const { error } = await supabase
          .from("client_wearable_activities")
          .upsert(activityRows, {
            onConflict: "workspace_id,client_id,provider,provider_record_id",
          });
        if (error) throw error;
        recordsImported += activityRows.length;
      }
      if (scoreRows.length) {
        const { error } = await supabase
          .from("client_wearable_health_scores")
          .upsert(scoreRows, {
            onConflict:
              "workspace_id,client_id,provider,provider_record_id,score_type",
          });
        if (error) throw error;
        recordsImported += scoreRows.length;
      }

      await supabase.from("client_wearable_sync_runs").insert({
        workspace_id: client.workspace_id,
        client_id: client.id,
        connection_id: connection.id,
        provider,
        sync_type: "manual",
        window_start: window.start,
        window_end: window.end,
        status: syncRunStatus,
        records_imported: recordsImported,
        completed_at: new Date().toISOString(),
      });
      await supabase
        .from("client_wearable_connections")
        .update({
          status: syncStatus === "succeeded" ? "connected" : "sync_failed",
          last_sync_at: new Date().toISOString(),
          error_code: syncStatus === "succeeded" ? null : syncStatus,
          error_message:
            syncStatus === "succeeded"
              ? null
              : `Open Wearables sync issue: ${[
                  syncTriggerFailed ? "sync_trigger_failed" : null,
                  ...failedFetches,
                ]
                  .filter(Boolean)
                  .join(", ")}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      return jsonResponse({
        ...syncPayload,
        recordsImported,
        syncStatus,
        failedFetches,
      });
    }

    return jsonResponse({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("open-wearables function failed", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
