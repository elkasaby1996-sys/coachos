import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BatteryMedium, Moon, Watch } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { StatusBanner } from "../../../components/client/portal";
import { supabase } from "../../../lib/supabase";
import {
  getProviderScoreLabel,
  getWearableMetricState,
} from "../../../features/wearables/normalization";
import type {
  ClientWearableActivity,
  ClientWearableConnection,
  ClientWearableDailyMetric,
  ClientWearableHealthScore,
  ClientWearableSleepSession,
  WorkspaceWearableSettings,
} from "../../../features/wearables/types";

type Props = {
  clientId: string | null;
  workspaceId: string | null;
};

const formatNumber = (value: number | null | undefined, suffix = "") =>
  typeof value === "number"
    ? `${Math.round(value).toLocaleString()}${suffix}`
    : "--";

const formatDecimal = (value: number | null | undefined, suffix = "") =>
  typeof value === "number" ? `${value.toFixed(1)}${suffix}` : "--";

const formatDateTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not synced";

function SourceMeta({
  provider,
  lastSyncAt,
}: {
  provider?: string | null;
  lastSyncAt?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="neutral">
        {provider ? provider.toUpperCase() : "No source"}
      </Badge>
      <Badge variant="muted">Last sync {formatDateTime(lastSyncAt)}</Badge>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  provider,
  state,
}: {
  label: string;
  value: string;
  provider?: string | null;
  state: "unsupported" | "no_data" | "stale" | "sync_failed" | "connected";
}) {
  const stateVariant =
    state === "connected"
      ? "success"
      : state === "sync_failed"
        ? "danger"
        : state === "stale"
          ? "warning"
          : "muted";

  return (
    <div className="rounded-lg border border-border/70 bg-card/45 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Badge variant={stateVariant}>{state.replace(/_/g, " ")}</Badge>
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      <div className="mt-3">
        <Badge variant="neutral">
          {provider ? provider.toUpperCase() : "No source"}
        </Badge>
      </div>
    </div>
  );
}

export function PtClientWearablesPanel({ clientId, workspaceId }: Props) {
  const settingsQuery = useQuery({
    queryKey: ["pt-client-wearable-settings", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_wearable_settings")
        .select("*")
        .eq("workspace_id", workspaceId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WorkspaceWearableSettings | null;
    },
  });

  const connectionQuery = useQuery({
    queryKey: ["pt-client-wearable-connection", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wearable_connections")
        .select("*")
        .eq("client_id", clientId ?? "")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientWearableConnection[];
    },
  });

  const metricsQuery = useQuery({
    queryKey: ["pt-client-wearable-metrics", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wearable_daily_metrics")
        .select("*")
        .eq("client_id", clientId ?? "")
        .order("metric_date", { ascending: false })
        .limit(14);
      if (error) throw error;
      return (data ?? []) as ClientWearableDailyMetric[];
    },
  });

  const sleepQuery = useQuery({
    queryKey: ["pt-client-wearable-sleep", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wearable_sleep_sessions")
        .select("*")
        .eq("client_id", clientId ?? "")
        .order("sleep_date", { ascending: false })
        .limit(7);
      if (error) throw error;
      return (data ?? []) as ClientWearableSleepSession[];
    },
  });

  const scoresQuery = useQuery({
    queryKey: ["pt-client-wearable-scores", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wearable_health_scores")
        .select("*")
        .eq("client_id", clientId ?? "")
        .order("recorded_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as ClientWearableHealthScore[];
    },
  });

  const activitiesQuery = useQuery({
    queryKey: ["pt-client-wearable-activities", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wearable_activities")
        .select("*")
        .eq("client_id", clientId ?? "")
        .order("start_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as ClientWearableActivity[];
    },
  });

  const settings = settingsQuery.data ?? null;
  const visibility = settings?.pt_visibility_mode ?? "hidden";
  const isHidden = !settings?.enabled || visibility === "hidden";
  const primaryConnection = (connectionQuery.data ?? [])[0] ?? null;
  const latestDaily = (metricsQuery.data ?? [])[0] ?? null;
  const latestSleep = (sleepQuery.data ?? [])[0] ?? null;
  const scores = scoresQuery.data ?? [];
  const latestRecovery = scores.find((score) =>
    ["recovery", "body_battery", "stress"].includes(score.score_type),
  );
  const latestLoad = scores.find((score) =>
    ["strain", "load", "stress"].includes(score.score_type),
  );
  const freshnessThreshold = settings?.freshness_threshold_hours ?? 24;
  const baseStateParams = {
    status: primaryConnection?.status,
    lastSyncAt: primaryConnection?.last_sync_at,
    freshnessThresholdHours: freshnessThreshold,
  };
  const isLoading =
    settingsQuery.isLoading ||
    connectionQuery.isLoading ||
    metricsQuery.isLoading ||
    sleepQuery.isLoading ||
    scoresQuery.isLoading ||
    activitiesQuery.isLoading;
  const error =
    settingsQuery.error ??
    connectionQuery.error ??
    metricsQuery.error ??
    sleepQuery.error ??
    scoresQuery.error ??
    activitiesQuery.error;
  const canShowDetails = visibility === "full_metrics";
  const connectionStatus = useMemo(() => {
    if (!primaryConnection) return "No wearable connected";
    return primaryConnection.status.replace(/_/g, " ");
  }, [primaryConnection]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <StatusBanner
        variant="error"
        title="Unable to load wearable data"
        description={error instanceof Error ? error.message : "Request failed."}
      />
    );
  }

  if (isHidden) {
    return (
      <StatusBanner
        variant="locked"
        title="Wearables hidden for PTs"
        description="Workspace settings do not currently allow coaches to view client wearable data."
      />
    );
  }

  if (!primaryConnection) {
    return (
      <StatusBanner
        variant="info"
        title="No wearable connected"
        description="When the client connects a provider, read-only wearable summaries will appear here."
        icon={<Watch className="h-5 w-5 text-primary" />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Wearables</CardTitle>
            <p className="text-sm text-muted-foreground">
              Read-only health data. This does not alter habit adherence.
            </p>
          </div>
          <SourceMeta
            provider={primaryConnection.provider}
            lastSyncAt={primaryConnection.last_sync_at}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusBanner
            variant={
              primaryConnection.status === "connected" ? "success" : "warning"
            }
            title={`Connection status: ${connectionStatus}`}
            description={`Freshness threshold: ${freshnessThreshold} hours. Provider sync: ${formatDateTime(primaryConnection.last_provider_sync_at)}.`}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryTile
              label="Steps"
              value={formatNumber(latestDaily?.steps)}
              provider={latestDaily?.provider ?? primaryConnection.provider}
              state={getWearableMetricState({
                ...baseStateParams,
                supported: true,
                value: latestDaily?.steps,
              })}
            />
            <SummaryTile
              label="Sleep"
              value={formatDecimal(
                latestSleep?.duration_minutes
                  ? latestSleep.duration_minutes / 60
                  : null,
                " hrs",
              )}
              provider={latestSleep?.provider ?? primaryConnection.provider}
              state={getWearableMetricState({
                ...baseStateParams,
                supported: true,
                value: latestSleep?.duration_minutes,
              })}
            />
            <SummaryTile
              label={
                latestRecovery
                  ? getProviderScoreLabel(
                      latestRecovery.provider,
                      latestRecovery.score_type,
                    )
                  : "Recovery"
              }
              value={formatDecimal(latestRecovery?.score_value)}
              provider={latestRecovery?.provider ?? primaryConnection.provider}
              state={getWearableMetricState({
                ...baseStateParams,
                supported: true,
                value: latestRecovery?.score_value,
              })}
            />
            <SummaryTile
              label={
                latestLoad
                  ? getProviderScoreLabel(
                      latestLoad.provider,
                      latestLoad.score_type,
                    )
                  : "Load / strain"
              }
              value={formatDecimal(latestLoad?.score_value)}
              provider={latestLoad?.provider ?? primaryConnection.provider}
              state={getWearableMetricState({
                ...baseStateParams,
                supported: true,
                value: latestLoad?.score_value,
              })}
            />
          </div>
        </CardContent>
      </Card>

      {canShowDetails ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BatteryMedium className="h-4 w-4 text-primary" />
                Scores
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {scores.length === 0 ? (
                <StatusBanner
                  variant="info"
                  title="Connected but no data"
                  description="Health scores have not been imported for this client yet."
                />
              ) : (
                scores.slice(0, 6).map((score) => (
                  <div
                    key={score.id}
                    className="rounded-lg border border-border/70 bg-card/45 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {getProviderScoreLabel(
                          score.provider,
                          score.score_type,
                        )}
                      </p>
                      <Badge variant="neutral">
                        {score.provider.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="mt-2 text-lg font-semibold">
                      {formatDecimal(
                        score.score_value,
                        score.score_unit ? ` ${score.score_unit}` : "",
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Recorded {formatDateTime(score.recorded_at)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Activities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(activitiesQuery.data ?? []).length === 0 ? (
                <StatusBanner
                  variant="info"
                  title="Connected but no data"
                  description="Workout summaries have not been imported yet."
                />
              ) : (
                (activitiesQuery.data ?? []).map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-lg border border-border/70 bg-card/45 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold capitalize">
                        {activity.activity_type.replace(/_/g, " ")}
                      </p>
                      <Badge variant="neutral">
                        {activity.provider.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(activity.start_at)} ·{" "}
                      {formatNumber(
                        activity.duration_seconds
                          ? activity.duration_seconds / 60
                          : null,
                        " min",
                      )}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Distance{" "}
                      {formatDecimal(
                        activity.distance_meters
                          ? activity.distance_meters / 1000
                          : null,
                        " km",
                      )}{" "}
                      · Avg HR {formatDecimal(activity.avg_hr_bpm, " bpm")}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <StatusBanner
          variant="locked"
          title="Summary-only visibility"
          description="Workspace settings allow top-level wearable cards but hide detailed metrics and activities."
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Moon className="h-4 w-4 text-primary" />
            Sleep summary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <SummaryTile
            label="Score"
            value={formatDecimal(latestSleep?.sleep_score)}
            provider={latestSleep?.provider}
            state={getWearableMetricState({
              ...baseStateParams,
              supported: true,
              value: latestSleep?.sleep_score,
            })}
          />
          <SummaryTile
            label="Deep"
            value={formatNumber(latestSleep?.deep_minutes, " min")}
            provider={latestSleep?.provider}
            state={getWearableMetricState({
              ...baseStateParams,
              supported: true,
              value: latestSleep?.deep_minutes,
            })}
          />
          <SummaryTile
            label="REM"
            value={formatNumber(latestSleep?.rem_minutes, " min")}
            provider={latestSleep?.provider}
            state={getWearableMetricState({
              ...baseStateParams,
              supported: true,
              value: latestSleep?.rem_minutes,
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
