import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  BatteryMedium,
  HeartPulse,
  Link as LinkIcon,
  Moon,
  RefreshCw,
  Unlink,
  Watch,
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
  StatusBanner,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { supabase } from "../../lib/supabase";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { selectActiveClientProfile } from "../../lib/client-profile-selection";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import {
  getProviderCapability,
  getProviderScoreLabel,
  getWearableMetricState,
} from "../../features/wearables/normalization";
import type {
  ClientWearableActivity,
  ClientWearableConnection,
  ClientWearableDailyMetric,
  ClientWearableHealthScore,
  ClientWearableSleepSession,
  WorkspaceWearableSettings,
} from "../../features/wearables/types";

type ClientProfile = {
  id: string;
  workspace_id: string | null;
  timezone: string | null;
  created_at: string | null;
};

const defaultSettings: Omit<
  WorkspaceWearableSettings,
  "id" | "workspace_id" | "created_at" | "updated_at"
> = {
  enabled: false,
  allowed_providers: ["garmin", "whoop"],
  enabled_metric_groups: [
    "sleep",
    "recovery",
    "load_strain",
    "activity",
    "workouts",
    "body_metrics",
  ],
  pt_visibility_mode: "summary_only",
  client_can_disconnect: true,
  data_retention_mode: "retain_on_disconnect",
  freshness_threshold_hours: 24,
  client_consent_copy:
    "I consent to share wearable health and activity data with my coaching workspace for coaching context. Wearable data does not complete habits automatically.",
};

const formatNumber = (value: number | null | undefined, suffix = "") =>
  typeof value === "number" ? `${Math.round(value).toLocaleString()}${suffix}` : "--";

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

function ProviderBadge({ provider }: { provider: string | null | undefined }) {
  return <Badge variant="neutral">{provider ? provider.toUpperCase() : "No source"}</Badge>;
}

function StateChip({
  state,
}: {
  state: "unsupported" | "no_data" | "stale" | "sync_failed" | "connected";
}) {
  const variant =
    state === "connected"
      ? "success"
      : state === "stale"
        ? "warning"
        : state === "sync_failed"
          ? "danger"
          : "muted";
  const label = state.replace(/_/g, " ");
  return <Badge variant={variant}>{label}</Badge>;
}

function MetricTile({
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
  return (
    <div className="rounded-lg border border-border/70 bg-card/45 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <StateChip state={state} />
      </div>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ProviderBadge provider={provider} />
      </div>
    </div>
  );
}

export function ClientWearablesPage() {
  const { session } = useSessionAuth();
  const { activeClientId } = useBootstrapAuth();
  const [selectedProvider, setSelectedProvider] = useState("garmin");
  const [actionError, setActionError] = useState<string | null>(null);

  const clientQuery = useQuery({
    queryKey: ["client-wearables-profile", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, workspace_id, timezone, created_at")
        .eq("user_id", session?.user?.id ?? "")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientProfile[];
    },
  });

  const clientProfile = useMemo(
    () => selectActiveClientProfile(clientQuery.data ?? [], activeClientId),
    [activeClientId, clientQuery.data],
  );
  const clientId = clientProfile?.id ?? null;
  const workspaceId = clientProfile?.workspace_id ?? null;
  const todayKey = getTodayInTimezone(clientProfile?.timezone ?? null);
  const trendStart7 = addDaysToDateString(todayKey, -6);
  const trendStart30 = addDaysToDateString(todayKey, -29);

  const settingsQuery = useQuery({
    queryKey: ["client-wearable-settings", workspaceId],
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
  const settings = settingsQuery.data ?? null;
  const resolvedSettings = settings
    ? settings
    : ({ ...defaultSettings, workspace_id: workspaceId ?? "", id: "" } as WorkspaceWearableSettings);

  const connectionQuery = useQuery({
    queryKey: ["client-wearable-connections", clientId],
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
    queryKey: ["client-wearable-daily", clientId, trendStart30, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wearable_daily_metrics")
        .select("*")
        .eq("client_id", clientId ?? "")
        .gte("metric_date", trendStart30)
        .lte("metric_date", todayKey)
        .order("metric_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientWearableDailyMetric[];
    },
  });

  const sleepQuery = useQuery({
    queryKey: ["client-wearable-sleep", clientId, trendStart30, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wearable_sleep_sessions")
        .select("*")
        .eq("client_id", clientId ?? "")
        .gte("sleep_date", trendStart30)
        .lte("sleep_date", todayKey)
        .order("sleep_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientWearableSleepSession[];
    },
  });

  const scoresQuery = useQuery({
    queryKey: ["client-wearable-scores", clientId, trendStart30],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wearable_health_scores")
        .select("*")
        .eq("client_id", clientId ?? "")
        .gte("recorded_at", `${trendStart30}T00:00:00.000Z`)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientWearableHealthScore[];
    },
  });

  const activitiesQuery = useQuery({
    queryKey: ["client-wearable-activities", clientId, trendStart30],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wearable_activities")
        .select("*")
        .eq("client_id", clientId ?? "")
        .gte("start_at", `${trendStart30}T00:00:00.000Z`)
        .order("start_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ClientWearableActivity[];
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      setActionError(null);
      const { data, error } = await supabase.functions.invoke("open-wearables", {
        body: {
          action: "authorize",
          provider,
          clientId,
          redirectUri: `${window.location.origin}/app/wearables`,
        },
      });
      if (error) throw error;
      const authorizationUrl = data?.authorizationUrl;
      if (typeof authorizationUrl !== "string") {
        throw new Error("Authorization URL unavailable.");
      }
      window.location.href = authorizationUrl;
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Connection failed.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      setActionError(null);
      const { error } = await supabase.functions.invoke("open-wearables", {
        body: { action: "disconnect", provider, clientId },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await connectionQuery.refetch();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Disconnect failed.");
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (provider: string) => {
      setActionError(null);
      const { error } = await supabase.functions.invoke("open-wearables", {
        body: { action: "sync", provider, clientId },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        connectionQuery.refetch(),
        metricsQuery.refetch(),
        sleepQuery.refetch(),
        scoresQuery.refetch(),
        activitiesQuery.refetch(),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Sync failed.");
    },
  });

  const activeConnections = (connectionQuery.data ?? []).filter(
    (connection) =>
      connection.status === "connected" ||
      connection.status === "sync_failed" ||
      connection.status === "pending",
  );
  const primaryConnection = activeConnections[0] ?? null;
  const lastInactiveConnection =
    (connectionQuery.data ?? []).find(
      (connection) =>
        connection.status === "revoked" || connection.status === "disconnected",
    ) ?? null;
  const latestDaily =
    [...(metricsQuery.data ?? [])].reverse().find((row) => row.provider === primaryConnection?.provider) ??
    [...(metricsQuery.data ?? [])].reverse()[0] ??
    null;
  const latestSleep = sleepQuery.data?.[0] ?? null;
  const latestScores = scoresQuery.data ?? [];
  const latestRecovery = latestScores.find((score) =>
    ["recovery", "body_battery", "stress"].includes(score.score_type),
  );
  const latestLoad = latestScores.find((score) =>
    ["strain", "load", "stress"].includes(score.score_type),
  );
  const freshnessThreshold = resolvedSettings.freshness_threshold_hours;
  const baseStateParams = {
    status: primaryConnection?.status,
    lastSyncAt: primaryConnection?.last_sync_at,
    freshnessThresholdHours: freshnessThreshold,
  };
  const stepsState = getWearableMetricState({
    ...baseStateParams,
    supported:
      getProviderCapability(primaryConnection?.provider ?? selectedProvider, "steps") !==
      "unsupported",
    value: latestDaily?.steps,
  });

  const chartData7 = (metricsQuery.data ?? [])
    .filter((metric) => metric.metric_date >= trendStart7)
    .map((metric) => ({
      date: metric.metric_date.slice(5),
      steps: metric.steps,
      active: metric.active_minutes,
    }));
  const chartData30 = (metricsQuery.data ?? []).map((metric) => ({
    date: metric.metric_date.slice(5),
    steps: metric.steps,
    active: metric.active_minutes,
  }));

  const isLoading =
    clientQuery.isLoading ||
    settingsQuery.isLoading ||
    connectionQuery.isLoading ||
    metricsQuery.isLoading ||
    sleepQuery.isLoading ||
    scoresQuery.isLoading ||
    activitiesQuery.isLoading;
  const loadError =
    clientQuery.error ??
    settingsQuery.error ??
    connectionQuery.error ??
    metricsQuery.error ??
    sleepQuery.error ??
    scoresQuery.error ??
    activitiesQuery.error;

  if (!resolvedSettings.enabled && settings) {
    return (
      <div className="portal-shell">
        <PortalPageHeader
          title="Wearables"
          subtitle="Wearable health data is currently disabled for this workspace."
        />
        <EmptyStateBlock
          title="Wearables are not enabled"
          description="Your coaching workspace has not enabled wearable data sharing yet."
          icon={<Watch className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div className="portal-shell">
      <PortalPageHeader
        title="Wearables"
        subtitle="Connect a wearable and share normalized health metrics with your coach."
        actions={
          primaryConnection ? (
            <Badge variant={primaryConnection.status === "connected" ? "success" : "warning"}>
              {primaryConnection.status.replace(/_/g, " ")}
            </Badge>
          ) : null
        }
      />

      {loadError ? (
        <Alert className="border-danger/30">
          <AlertTitle>Unable to load wearable data</AlertTitle>
          <AlertDescription>
            {loadError instanceof Error ? loadError.message : "Request failed."}
          </AlertDescription>
        </Alert>
      ) : null}

      {actionError ? (
        <Alert className="border-danger/30">
          <AlertTitle>Wearable action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {!primaryConnection && lastInactiveConnection ? (
        <StatusBanner
          variant="info"
          title={`${lastInactiveConnection.provider.toUpperCase()} disconnected`}
          description="This wearable is no longer connected. You can start a new Open Wearables connection below."
        />
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-40 lg:col-span-3" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : !primaryConnection ? (
        <SurfaceCard>
          <SurfaceCardHeader>
            <SurfaceCardTitle>No wearable connected</SurfaceCardTitle>
            <SurfaceCardDescription>
              Choose an allowed provider to start the Open Wearables connection flow.
            </SurfaceCardDescription>
          </SurfaceCardHeader>
          <SurfaceCardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                className="app-field h-10 px-3 text-sm"
                value={selectedProvider}
                onChange={(event) => setSelectedProvider(event.target.value)}
              >
                {resolvedSettings.allowed_providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider.toUpperCase()}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => connectMutation.mutate(selectedProvider)}
                disabled={!clientId || connectMutation.isPending}
              >
                <LinkIcon className="mr-2 h-4 w-4" />
                {connectMutation.isPending ? "Opening..." : "Connect provider"}
              </Button>
            </div>
            <StatusBanner
              variant="info"
              title="Consent"
              description={resolvedSettings.client_consent_copy}
            />
          </SurfaceCardContent>
        </SurfaceCard>
      ) : (
        <>
          <SurfaceCard>
            <SurfaceCardHeader className="flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <SurfaceCardTitle>Connected device</SurfaceCardTitle>
                <SurfaceCardDescription>
                  Source attribution is preserved on every imported metric.
                </SurfaceCardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <ProviderBadge provider={primaryConnection.provider} />
                <Badge variant={primaryConnection.status === "connected" ? "success" : "warning"}>
                  Last sync {formatDateTime(primaryConnection.last_sync_at)}
                </Badge>
              </div>
            </SurfaceCardHeader>
            <SurfaceCardContent className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => syncMutation.mutate(primaryConnection.provider)}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {syncMutation.isPending ? "Importing..." : "Import latest data"}
              </Button>
              {resolvedSettings.client_can_disconnect ? (
                <Button
                  variant="secondary"
                  onClick={() => disconnectMutation.mutate(primaryConnection.provider)}
                  disabled={disconnectMutation.isPending}
                >
                  <Unlink className="mr-2 h-4 w-4" />
                  Disconnect
                </Button>
              ) : null}
            </SurfaceCardContent>
          </SurfaceCard>

          <div className="grid gap-4 lg:grid-cols-4">
            <MetricTile
              label="Steps"
              value={formatNumber(latestDaily?.steps)}
              provider={latestDaily?.provider ?? primaryConnection.provider}
              state={stepsState}
            />
            <MetricTile
              label="Sleep"
              value={formatNumber(latestSleep?.duration_minutes ? latestSleep.duration_minutes / 60 : null, " hrs")}
              provider={latestSleep?.provider ?? primaryConnection.provider}
              state={getWearableMetricState({
                ...baseStateParams,
                supported: true,
                value: latestSleep?.duration_minutes,
              })}
            />
            <MetricTile
              label={latestRecovery ? getProviderScoreLabel(latestRecovery.provider, latestRecovery.score_type) : "Recovery"}
              value={formatDecimal(latestRecovery?.score_value)}
              provider={latestRecovery?.provider ?? primaryConnection.provider}
              state={getWearableMetricState({
                ...baseStateParams,
                supported: true,
                value: latestRecovery?.score_value,
              })}
            />
            <MetricTile
              label={latestLoad ? getProviderScoreLabel(latestLoad.provider, latestLoad.score_type) : "Load / strain"}
              value={formatDecimal(latestLoad?.score_value)}
              provider={latestLoad?.provider ?? primaryConnection.provider}
              state={getWearableMetricState({
                ...baseStateParams,
                supported: true,
                value: latestLoad?.score_value,
              })}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SurfaceCard>
              <SurfaceCardHeader>
                <SurfaceCardTitle className="flex items-center gap-2">
                  <Moon className="h-4 w-4 text-primary" />
                  Sleep
                </SurfaceCardTitle>
              </SurfaceCardHeader>
              <SurfaceCardContent className="space-y-3">
                <MetricTile
                  label="Score"
                  value={formatDecimal(latestSleep?.sleep_score)}
                  provider={latestSleep?.provider}
                  state={getWearableMetricState({
                    ...baseStateParams,
                    supported: true,
                    value: latestSleep?.sleep_score,
                  })}
                />
                <MetricTile
                  label="Efficiency"
                  value={formatDecimal(latestSleep?.sleep_efficiency_percent, "%")}
                  provider={latestSleep?.provider}
                  state={getWearableMetricState({
                    ...baseStateParams,
                    supported: true,
                    value: latestSleep?.sleep_efficiency_percent,
                  })}
                />
              </SurfaceCardContent>
            </SurfaceCard>

            <SurfaceCard>
              <SurfaceCardHeader>
                <SurfaceCardTitle className="flex items-center gap-2">
                  <BatteryMedium className="h-4 w-4 text-primary" />
                  Recovery / load
                </SurfaceCardTitle>
              </SurfaceCardHeader>
              <SurfaceCardContent className="space-y-3">
                {latestScores.length === 0 ? (
                  <StatusBanner
                    variant="info"
                    title="Connected but no data"
                    description="Open Wearables has not imported health scores for this window."
                  />
                ) : (
                  latestScores.slice(0, 4).map((score) => (
                    <SectionCard key={score.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {getProviderScoreLabel(score.provider, score.score_type)}
                        </p>
                        <ProviderBadge provider={score.provider} />
                      </div>
                      <p className="text-xl font-semibold">
                        {formatDecimal(score.score_value, score.score_unit ? ` ${score.score_unit}` : "")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Recorded {formatDateTime(score.recorded_at)}
                      </p>
                    </SectionCard>
                  ))
                )}
              </SurfaceCardContent>
            </SurfaceCard>

            <SurfaceCard>
              <SurfaceCardHeader>
                <SurfaceCardTitle className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-primary" />
                  Activity
                </SurfaceCardTitle>
              </SurfaceCardHeader>
              <SurfaceCardContent className="space-y-3">
                <MetricTile
                  label="Active minutes"
                  value={formatNumber(latestDaily?.active_minutes, " min")}
                  provider={latestDaily?.provider}
                  state={getWearableMetricState({
                    ...baseStateParams,
                    supported: true,
                    value: latestDaily?.active_minutes,
                  })}
                />
                <MetricTile
                  label="Resting HR"
                  value={formatDecimal(latestDaily?.resting_heart_rate_bpm, " bpm")}
                  provider={latestDaily?.provider}
                  state={getWearableMetricState({
                    ...baseStateParams,
                    supported: true,
                    value: latestDaily?.resting_heart_rate_bpm,
                  })}
                />
              </SurfaceCardContent>
            </SurfaceCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { title: "7-day trends", data: chartData7 },
              { title: "30-day trends", data: chartData30 },
            ].map((chart) => (
              <SurfaceCard key={chart.title}>
                <SurfaceCardHeader>
                  <SurfaceCardTitle>{chart.title}</SurfaceCardTitle>
                </SurfaceCardHeader>
                <SurfaceCardContent>
                  {chart.data.length === 0 ? (
                    <StatusBanner
                      variant="info"
                      title="Connected but no data"
                      description="Trend data will appear after the next Open Wearables import."
                    />
                  ) : (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chart.data}>
                          <XAxis dataKey="date" stroke="currentColor" tickLine={false} axisLine={false} />
                          <YAxis stroke="currentColor" tickLine={false} axisLine={false} width={42} />
                          <Tooltip />
                          <Line type="monotone" dataKey="steps" stroke="var(--state-success-text)" dot={false} connectNulls={false} />
                          <Line type="monotone" dataKey="active" stroke="var(--state-info-text)" dot={false} connectNulls={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </SurfaceCardContent>
              </SurfaceCard>
            ))}
          </div>

          <SurfaceCard>
            <SurfaceCardHeader>
              <SurfaceCardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Activities / workouts
              </SurfaceCardTitle>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-3">
              {(activitiesQuery.data ?? []).length === 0 ? (
                <StatusBanner
                  variant="info"
                  title="Connected but no data"
                  description="Workouts imported from Open Wearables will appear here."
                />
              ) : (
                (activitiesQuery.data ?? []).map((activity) => (
                  <SectionCard
                    key={activity.id}
                    className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div>
                      <p className="text-sm font-semibold capitalize">
                        {activity.activity_type.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(activity.start_at)} · {formatNumber(activity.duration_seconds ? activity.duration_seconds / 60 : null, " min")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <ProviderBadge provider={activity.provider} />
                      <Badge variant="muted">
                        {formatNumber(activity.distance_meters ? activity.distance_meters / 1000 : null, " km")}
                      </Badge>
                    </div>
                  </SectionCard>
                ))
              )}
            </SurfaceCardContent>
          </SurfaceCard>
        </>
      )}
    </div>
  );
}
