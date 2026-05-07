import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { useVisibilityGate } from "../../hooks/use-visibility-gate";
import { useWindowedRows } from "../../hooks/use-windowed-rows";
import { supabase } from "../../lib/supabase";
import { useSessionAuth } from "../../lib/auth";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";

type HabitPoint = {
  log_date: string;
  weight_value: number | null;
  weight_unit: string | null;
  sleep_hours: number | null;
  steps: number | null;
};

type SetLogPoint = {
  reps: number | null;
  weight: number | null;
  created_at: string | null;
  exercise_id: string | null;
  exercise: { name: string | null } | { name: string | null }[] | null;
};

type BaselineWeightPoint = {
  log_date: string;
  weight_kg: number | null;
};

type SeriesPoint = {
  dateKey: string;
  label: string;
  value: number | null;
};

type LoadSeriesPoint = {
  dateKey: string;
  label: string;
  volume: number | null;
  avgWeight: number | null;
};

const toShortDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function filterSeriesByCutoff<T extends { dateKey: string }>(
  rows: T[],
  cutoff: string,
) {
  return rows.filter((row) => row.dateKey >= cutoff);
}

function getDelta(series: SeriesPoint[]) {
  const numeric = series.filter(
    (point): point is SeriesPoint & { value: number } =>
      typeof point.value === "number",
  );
  if (numeric.length < 2) return null;
  const first = numeric[0]!.value;
  const last = numeric[numeric.length - 1]!.value;
  return last - first;
}

function getSeriesPointCount(series: SeriesPoint[]) {
  return series.filter((point) => typeof point.value === "number").length;
}

function getLoadPointCount(series: LoadSeriesPoint[]) {
  return series.filter((point) => typeof point.volume === "number").length;
}

function ChartSurface({
  title,
  description,
  latestLabel,
  children,
}: {
  title: string;
  description: string;
  latestLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <SurfaceCard>
      <SurfaceCardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <SurfaceCardTitle>{title}</SurfaceCardTitle>
            <SurfaceCardDescription>{description}</SurfaceCardDescription>
          </div>
          {latestLabel ? <Badge variant="muted">{latestLabel}</Badge> : null}
        </div>
      </SurfaceCardHeader>
      <SurfaceCardContent>{children}</SurfaceCardContent>
    </SurfaceCard>
  );
}

function DeferredChartFrame({
  title,
}: {
  title: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-32 w-full rounded-[var(--radius-lg)] sm:h-40" />
    </div>
  );
}

function ProgressLoadingState() {
  return (
    <div className="portal-shell">
      <section className="flex flex-col gap-5 border-b border-border/50 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-5 w-full max-w-2xl rounded-lg" />
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </section>

      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <SurfaceCard key={`chart-${index}`}>
              <SurfaceCardHeader className="pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-36 rounded-lg" />
                    <Skeleton className="h-4 w-72 rounded-lg" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-full" />
                </div>
              </SurfaceCardHeader>
              <SurfaceCardContent>
                <Skeleton className="h-[16rem] w-full rounded-[var(--radius-lg)] sm:h-[19rem]" />
              </SurfaceCardContent>
            </SurfaceCard>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <SurfaceCard>
            <SurfaceCardHeader className="pb-4">
              <Skeleton className="h-6 w-44 rounded-lg" />
              <Skeleton className="h-4 w-80 rounded-lg" />
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <SectionCard key={`support-${index}`} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-5 w-28 rounded-lg" />
                    <Skeleton className="h-7 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-32 w-full rounded-[var(--radius-lg)] sm:h-40" />
                </SectionCard>
              ))}
            </SurfaceCardContent>
          </SurfaceCard>

          <SurfaceCard>
            <SurfaceCardHeader className="pb-4">
              <Skeleton className="h-6 w-40 rounded-lg" />
              <Skeleton className="h-4 w-72 rounded-lg" />
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <SectionCard
                  key={`change-${index}`}
                  className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32 rounded-lg" />
                    <Skeleton className="h-4 w-full rounded-lg" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[18rem]">
                    <Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" />
                    <Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" />
                  </div>
                </SectionCard>
              ))}
            </SurfaceCardContent>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <SurfaceCardHeader className="pb-4">
            <Skeleton className="h-6 w-40 rounded-lg" />
            <Skeleton className="h-4 w-72 rounded-lg" />
          </SurfaceCardHeader>
          <SurfaceCardContent>
            <SectionCard className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
              <div className="space-y-3">
                <Skeleton className="h-5 w-full rounded-lg" />
                <Skeleton className="h-5 w-[92%] rounded-lg" />
                <Skeleton className="h-4 w-[75%] rounded-lg" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton
                    key={`summary-${index}`}
                    className="h-16 w-full rounded-[var(--radius-lg)]"
                  />
                ))}
              </div>
            </SectionCard>
          </SurfaceCardContent>
        </SurfaceCard>
      </div>
    </div>
  );
}

export function ClientProgressPage() {
  const { session } = useSessionAuth();
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<"4w" | "8w">("8w");
  const axisColor = "oklch(0.98 0 0 / 0.92)";

  const clientQuery = useQuery({
    queryKey: ["client-progress-profile", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, timezone, unit_preference")
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        timezone: string | null;
        unit_preference: string | null;
      } | null;
    },
  });

  const clientId = clientQuery.data?.id ?? null;
  const todayKey = useMemo(
    () => getTodayInTimezone(clientQuery.data?.timezone ?? null),
    [clientQuery.data?.timezone],
  );
  const startKey = useMemo(
    () => addDaysToDateString(todayKey, -55),
    [todayKey],
  );
  const cutoffKey = useMemo(
    () => addDaysToDateString(todayKey, timeframe === "4w" ? -27 : -55),
    [timeframe, todayKey],
  );

  const habitsQuery = useQuery({
    queryKey: ["client-progress-habits", clientId, startKey, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select("log_date, weight_value, weight_unit, sleep_hours, steps")
        .eq("client_id", clientId ?? "")
        .gte("log_date", startKey)
        .lte("log_date", todayKey)
        .order("log_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HabitPoint[];
    },
  });

  const setLogsQuery = useQuery({
    queryKey: ["client-progress-set-logs", clientId, startKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select(
          "reps, weight, created_at, exercise_id, exercise:exercises(name), workout_session:workout_sessions!inner(client_id)",
        )
        .eq("workout_session.client_id", clientId ?? "")
        .gte("created_at", `${startKey}T00:00:00.000Z`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SetLogPoint[];
    },
  });

  const baselineWeightQuery = useQuery({
    queryKey: ["client-progress-baseline-weight", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: baselineEntry, error: baselineEntryError } = await supabase
        .from("baseline_entries")
        .select("id, submitted_at, created_at")
        .eq("client_id", clientId ?? "")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (baselineEntryError) throw baselineEntryError;
      if (!baselineEntry?.id) return null;

      const { data: metrics, error: metricsError } = await supabase
        .from("baseline_metrics")
        .select("weight_kg")
        .eq("baseline_id", baselineEntry.id)
        .maybeSingle();
      if (metricsError) throw metricsError;

      const dateKey = (
        baselineEntry.submitted_at ??
        baselineEntry.created_at ??
        ""
      ).slice(0, 10);
      if (!dateKey) return null;

      return {
        log_date: dateKey,
        weight_kg: metrics?.weight_kg ?? null,
      } satisfies BaselineWeightPoint;
    },
  });

  const loading =
    clientQuery.isLoading ||
    habitsQuery.isLoading ||
    setLogsQuery.isLoading ||
    baselineWeightQuery.isLoading;
  const error =
    clientQuery.error ||
    habitsQuery.error ||
    setLogsQuery.error ||
    baselineWeightQuery.error;

  const weightUnit = useMemo(() => {
    const fromLogs = (habitsQuery.data ?? []).find(
      (row) => row.weight_unit,
    )?.weight_unit;
    if (fromLogs) return fromLogs;
    return clientQuery.data?.unit_preference?.toLowerCase() === "imperial"
      ? "lb"
      : "kg";
  }, [habitsQuery.data, clientQuery.data?.unit_preference]);

  const habitSeries = useMemo(() => {
    const rows = habitsQuery.data ?? [];
    const weight: SeriesPoint[] = [];
    const sleep: SeriesPoint[] = [];
    const steps: SeriesPoint[] = [];

    const baselineDate = baselineWeightQuery.data?.log_date ?? null;
    const baselineWeightKg = baselineWeightQuery.data?.weight_kg ?? null;
    const baselineWeight =
      typeof baselineWeightKg === "number"
        ? weightUnit === "lb"
          ? baselineWeightKg * 2.2046226218
          : baselineWeightKg
        : null;

    if (baselineDate) {
      weight.push({
        dateKey: baselineDate,
        label: toShortDate(baselineDate),
        value:
          typeof baselineWeight === "number"
            ? Number(baselineWeight.toFixed(1))
            : null,
      });
    }

    const habitRowsForWeight = baselineDate
      ? rows.filter((row) => row.log_date > baselineDate)
      : rows;

    habitRowsForWeight.forEach((row) => {
      weight.push({
        dateKey: row.log_date,
        label: toShortDate(row.log_date),
        value: row.weight_value,
      });
    });

    rows.forEach((row) => {
      const label = toShortDate(row.log_date);
      sleep.push({ dateKey: row.log_date, label, value: row.sleep_hours });
      steps.push({ dateKey: row.log_date, label, value: row.steps });
    });

    return { weight, sleep, steps };
  }, [baselineWeightQuery.data, habitsQuery.data, weightUnit]);

  const exerciseTrends = useMemo(() => {
    const rows = setLogsQuery.data ?? [];
    const byDate = new Map<
      string,
      { volume: number; weightSum: number; weightCount: number }
    >();
    const byExercise = new Map<
      string,
      {
        name: string;
        firstWeight: number | null;
        latestWeight: number | null;
        firstVolume: number | null;
        latestVolume: number | null;
      }
    >();

    rows.forEach((row) => {
      const dateKey = row.created_at ? row.created_at.slice(0, 10) : null;
      const reps = typeof row.reps === "number" ? row.reps : null;
      const weight = typeof row.weight === "number" ? row.weight : null;
      const volume = reps !== null && weight !== null ? reps * weight : null;

      if (dateKey) {
        const current = byDate.get(dateKey) ?? {
          volume: 0,
          weightSum: 0,
          weightCount: 0,
        };
        if (typeof volume === "number" && volume > 0) current.volume += volume;
        if (typeof weight === "number" && weight > 0) {
          current.weightSum += weight;
          current.weightCount += 1;
        }
        byDate.set(dateKey, current);
      }

      if (!row.exercise_id) return;
      const exerciseName = Array.isArray(row.exercise)
        ? (row.exercise[0]?.name ?? "Exercise")
        : (row.exercise?.name ?? "Exercise");
      const existing = byExercise.get(row.exercise_id) ?? {
        name: exerciseName,
        firstWeight: null,
        latestWeight: null,
        firstVolume: null,
        latestVolume: null,
      };

      if (
        existing.firstWeight === null &&
        typeof weight === "number" &&
        weight > 0
      ) {
        existing.firstWeight = weight;
      }
      if (typeof weight === "number" && weight > 0) {
        existing.latestWeight = weight;
      }
      if (
        existing.firstVolume === null &&
        typeof volume === "number" &&
        volume > 0
      ) {
        existing.firstVolume = volume;
      }
      if (typeof volume === "number" && volume > 0) {
        existing.latestVolume = volume;
      }

      byExercise.set(row.exercise_id, existing);
    });

    const loadSeries: LoadSeriesPoint[] = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateKey, value]) => ({
        dateKey,
        label: toShortDate(dateKey),
        volume: Number(value.volume.toFixed(1)),
        avgWeight:
          value.weightCount > 0
            ? Number((value.weightSum / value.weightCount).toFixed(1))
            : null,
      }));

    const changes = [...byExercise.values()]
      .map((row) => ({
        name: row.name,
        weightDelta:
          row.firstWeight !== null && row.latestWeight !== null
            ? row.latestWeight - row.firstWeight
            : null,
        volumeDelta:
          row.firstVolume !== null && row.latestVolume !== null
            ? row.latestVolume - row.firstVolume
            : null,
        weightPct:
          row.firstWeight !== null &&
          row.latestWeight !== null &&
          row.firstWeight !== 0
            ? ((row.latestWeight - row.firstWeight) / row.firstWeight) * 100
            : null,
        volumePct:
          row.firstVolume !== null &&
          row.latestVolume !== null &&
          row.firstVolume !== 0
            ? ((row.latestVolume - row.firstVolume) / row.firstVolume) * 100
            : null,
      }))
      .filter((row) => row.weightDelta !== null || row.volumeDelta !== null)
      .sort(
        (a, b) =>
          Math.abs((b.weightDelta ?? 0) + (b.volumeDelta ?? 0) / 10) -
          Math.abs((a.weightDelta ?? 0) + (a.volumeDelta ?? 0) / 10),
      )
      .slice(0, 6);

    return { loadSeries, changes };
  }, [setLogsQuery.data]);

  const filteredWeightSeries = useMemo(
    () => filterSeriesByCutoff(habitSeries.weight, cutoffKey),
    [cutoffKey, habitSeries.weight],
  );
  const filteredSleepSeries = useMemo(
    () => filterSeriesByCutoff(habitSeries.sleep, cutoffKey),
    [cutoffKey, habitSeries.sleep],
  );
  const filteredStepsSeries = useMemo(
    () => filterSeriesByCutoff(habitSeries.steps, cutoffKey),
    [cutoffKey, habitSeries.steps],
  );
  const filteredLoadSeries = useMemo(
    () => filterSeriesByCutoff(exerciseTrends.loadSeries, cutoffKey),
    [cutoffKey, exerciseTrends.loadSeries],
  );
  const weightPointCount = getSeriesPointCount(filteredWeightSeries);
  const sleepPointCount = getSeriesPointCount(filteredSleepSeries);
  const stepsPointCount = getSeriesPointCount(filteredStepsSeries);
  const loadPointCount = getLoadPointCount(filteredLoadSeries);
  const hasBaseline = Boolean(baselineWeightQuery.data?.log_date);

  const hasAnyData =
    weightPointCount > 0 ||
    sleepPointCount > 0 ||
    stepsPointCount > 0 ||
    loadPointCount > 0;

  const insightText = useMemo(() => {
    const weightDelta = getDelta(filteredWeightSeries);
    const sleepDelta = getDelta(filteredSleepSeries);
    const stepsDelta = getDelta(filteredStepsSeries);
    const latestLoad =
      filteredLoadSeries.length > 0
        ? filteredLoadSeries[filteredLoadSeries.length - 1]?.volume
        : null;

    const parts: string[] = [];
    if (weightDelta !== null) {
      parts.push(
        `Body weight moved ${weightDelta > 0 ? "up" : weightDelta < 0 ? "down" : "sideways"} ${Math.abs(weightDelta).toFixed(1)} ${weightUnit}.`,
      );
    }
    if (sleepDelta !== null) {
      parts.push(
        `Sleep shifted ${sleepDelta > 0 ? "up" : sleepDelta < 0 ? "down" : "sideways"} ${Math.abs(sleepDelta).toFixed(1)} hrs.`,
      );
    }
    if (stepsDelta !== null) {
      parts.push(
        `Steps changed by ${stepsDelta > 0 ? "+" : ""}${Math.round(stepsDelta)}.`,
      );
    }
    if (typeof latestLoad === "number" && latestLoad > 0) {
      parts.push(`Latest logged training volume is ${latestLoad.toFixed(0)}.`);
    }
    return parts.join(" ");
  }, [
    filteredLoadSeries,
    filteredSleepSeries,
    filteredStepsSeries,
    filteredWeightSeries,
    weightUnit,
  ]);
  const exerciseChangesWindow = useWindowedRows({
    rows: exerciseTrends.changes,
    initialCount: 4,
    step: 4,
    resetKey: `${timeframe}:${exerciseTrends.changes.length}`,
  });
  const recoveryVisibility = useVisibilityGate<HTMLDivElement>();

  if (loading) {
    return <ProgressLoadingState />;
  }

  return (
    <div className="portal-shell">
      <PortalPageHeader
        title="Progress"
        subtitle="Track body trends, recovery, activity, and training load in one place."
        stateText={timeframe === "4w" ? "Last 4 weeks" : "Last 8 weeks"}
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              variant={timeframe === "4w" ? "default" : "secondary"}
              size="sm"
              onClick={() => setTimeframe("4w")}
            >
              Last 4 weeks
            </Button>
            <Button
              variant={timeframe === "8w" ? "default" : "secondary"}
              size="sm"
              onClick={() => setTimeframe("8w")}
            >
              Last 8 weeks
            </Button>
          </div>
        }
      />

      {error ? (
        <EmptyStateBlock
          title="Progress could not be loaded"
          description={
            error instanceof Error
              ? error.message
              : "We couldn't load your progress trends right now."
          }
        />
      ) : !hasAnyData ? (
        <EmptyStateBlock
          title="No progress data yet"
          description="Log habits, complete workouts, and submit your baseline to start seeing meaningful trends here."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => navigate("/app/habits")}
              >
                Log habits
              </Button>
              {!hasBaseline ? (
                <Button
                  variant="secondary"
                  onClick={() => navigate("/app/baseline")}
                >
                  Complete baseline
                </Button>
              ) : null}
              <Button onClick={() => navigate("/app/workouts")}>
                Start workout
              </Button>
            </>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <ChartSurface
              title="Body weight"
              description="Changes since your submitted baseline and recent habit logs."
              latestLabel={
                filteredWeightSeries.length > 0
                  ? `${filteredWeightSeries[filteredWeightSeries.length - 1]?.value ?? "--"} ${weightUnit}`
                  : undefined
              }
            >
              {weightPointCount >= 2 ? (
                <div className="h-[16rem] w-full sm:h-[19rem]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredWeightSeries}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="oklch(0.35 0.02 260 / 0.35)"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: axisColor }}
                        axisLine={{ stroke: axisColor }}
                        tickLine={{ stroke: axisColor }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: axisColor }}
                        axisLine={{ stroke: axisColor }}
                        tickLine={{ stroke: axisColor }}
                      />
                      <Tooltip
                        formatter={(value: number | string) =>
                          `${value} ${weightUnit}`
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="oklch(var(--chart-1))"
                        strokeWidth={2.6}
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyStateBlock
                  title="Not enough body-weight entries yet"
                  description="Keep logging weight over the next few check-ins to unlock a clearer chart."
                  className="min-h-[19rem]"
                  actions={
                    hasBaseline ? (
                      <Button
                        variant="secondary"
                        onClick={() => navigate("/app/habits")}
                      >
                        Log habits
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => navigate("/app/baseline")}
                      >
                        Complete baseline
                      </Button>
                    )
                  }
                />
              )}
            </ChartSurface>

            <ChartSurface
              title="Training volume"
              description="Logged output across your recent sessions."
              latestLabel={
                filteredLoadSeries.length > 0
                  ? `${filteredLoadSeries[filteredLoadSeries.length - 1]?.volume?.toFixed(0) ?? "--"} volume`
                  : undefined
              }
            >
              {loadPointCount >= 2 ? (
                <div className="h-[16rem] w-full sm:h-[19rem]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredLoadSeries}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="oklch(0.35 0.02 260 / 0.35)"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: axisColor }}
                        axisLine={{ stroke: axisColor }}
                        tickLine={{ stroke: axisColor }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: axisColor }}
                        axisLine={{ stroke: axisColor }}
                        tickLine={{ stroke: axisColor }}
                      />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="volume"
                        stroke="oklch(var(--chart-3))"
                        strokeWidth={2.6}
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyStateBlock
                  title="Not enough training-load data yet"
                  description="Log a couple of sessions with working sets and this chart will start to show useful changes."
                  className="min-h-[19rem]"
                  actions={
                    <Button onClick={() => navigate("/app/workouts")}>
                      Start workout
                    </Button>
                  }
                />
              )}
            </ChartSurface>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
            <div ref={recoveryVisibility.ref}>
              <SurfaceCard>
                <SurfaceCardHeader className="pb-4">
                  <SurfaceCardTitle>Recovery and activity</SurfaceCardTitle>
                  <SurfaceCardDescription>
                    Supporting signals that influence readiness and consistency.
                  </SurfaceCardDescription>
                </SurfaceCardHeader>
                <SurfaceCardContent className="space-y-4">
                  {recoveryVisibility.isVisible ? (
                    <>
                      <SectionCard className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">
                            Sleep hours
                          </p>
                          <Badge variant="muted">
                            {filteredSleepSeries.length > 0
                              ? `${filteredSleepSeries[filteredSleepSeries.length - 1]?.value ?? "--"} hrs`
                              : "--"}
                          </Badge>
                        </div>
                        {sleepPointCount >= 2 ? (
                          <div className="h-32 w-full sm:h-40">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={filteredSleepSeries}>
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="oklch(0.35 0.02 260 / 0.35)"
                                />
                                <XAxis dataKey="label" hide />
                                <YAxis hide />
                                <Tooltip
                                  formatter={(value: number | string) =>
                                    `${value} hrs`
                                  }
                                />
                                <Line
                                  type="monotone"
                                  dataKey="value"
                                  stroke="oklch(var(--chart-2))"
                                  strokeWidth={2.3}
                                  dot={false}
                                  connectNulls
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <EmptyStateBlock
                            title="Sleep trend pending"
                            description="Log sleep across a few days to make this recovery signal useful."
                            className="min-h-[12rem]"
                          />
                        )}
                      </SectionCard>

                      <SectionCard className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">
                            Steps
                          </p>
                          <Badge variant="muted">
                            {filteredStepsSeries.length > 0
                              ? `${filteredStepsSeries[filteredStepsSeries.length - 1]?.value ?? "--"}`
                              : "--"}
                          </Badge>
                        </div>
                        {stepsPointCount >= 2 ? (
                          <div className="h-32 w-full sm:h-40">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={filteredStepsSeries}>
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="oklch(0.35 0.02 260 / 0.35)"
                                />
                                <XAxis dataKey="label" hide />
                                <YAxis hide />
                                <Tooltip />
                                <Line
                                  type="monotone"
                                  dataKey="value"
                                  stroke="oklch(var(--chart-4))"
                                  strokeWidth={2.3}
                                  dot={false}
                                  connectNulls
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <EmptyStateBlock
                            title="Step trend pending"
                            description="A few logged activity days will make this section more informative."
                            className="min-h-[12rem]"
                          />
                        )}
                      </SectionCard>
                    </>
                  ) : (
                    <>
                      <SectionCard>
                        <DeferredChartFrame title="Sleep hours" />
                      </SectionCard>
                      <SectionCard>
                        <DeferredChartFrame title="Steps" />
                      </SectionCard>
                    </>
                  )}
                </SurfaceCardContent>
              </SurfaceCard>
            </div>

            <SurfaceCard>
              <SurfaceCardHeader className="pb-4">
                <SurfaceCardTitle>Exercise changes</SurfaceCardTitle>
                <SurfaceCardDescription>
                  The strongest positive or negative movement across tracked
                  exercises.
                </SurfaceCardDescription>
              </SurfaceCardHeader>
              <SurfaceCardContent>
                {exerciseTrends.changes.length > 0 ? (
                  <div className="space-y-3">
                    {exerciseChangesWindow.visibleRows.map((item) => {
                      const trendBase =
                        item.volumeDelta ?? item.weightDelta ?? 0;
                      const TrendIcon =
                        trendBase > 0
                          ? ArrowUpRight
                          : trendBase < 0
                            ? ArrowDownRight
                            : Minus;

                      return (
                        <SectionCard
                          key={item.name}
                          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <div className="space-y-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-foreground">
                                {item.name}
                              </p>
                              <TrendIcon
                                className={
                                  trendBase > 0
                                    ? "h-4 w-4 text-emerald-500"
                                    : trendBase < 0
                                      ? "h-4 w-4 text-rose-500"
                                      : "h-4 w-4 text-muted-foreground"
                                }
                              />
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">
                              Compare your earliest and latest logged sets for a
                              quick performance read.
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[18rem]">
                            <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/35 px-3 py-3">
                              <p className="field-label">Weight</p>
                              <p className="mt-1 text-sm text-foreground">
                                {item.weightDelta !== null
                                  ? `${item.weightDelta > 0 ? "+" : ""}${item.weightDelta.toFixed(1)} (${item.weightPct !== null ? `${item.weightPct > 0 ? "+" : ""}${item.weightPct.toFixed(1)}%` : "--"})`
                                  : "--"}
                              </p>
                            </div>
                            <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/35 px-3 py-3">
                              <p className="field-label">Volume</p>
                              <p className="mt-1 text-sm text-foreground">
                                {item.volumeDelta !== null
                                  ? `${item.volumeDelta > 0 ? "+" : ""}${item.volumeDelta.toFixed(0)} (${item.volumePct !== null ? `${item.volumePct > 0 ? "+" : ""}${item.volumePct.toFixed(1)}%` : "--"})`
                                  : "--"}
                              </p>
                            </div>
                          </div>
                        </SectionCard>
                      );
                    })}
                    {exerciseChangesWindow.hasHiddenRows ? (
                      <div className="flex justify-center pt-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={exerciseChangesWindow.showMore}
                        >
                          Show {Math.min(exerciseChangesWindow.hiddenCount, 4)} more
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyStateBlock
                    title="No exercise trend data yet"
                    description="Log a few sessions with working sets to unlock performance-change summaries."
                    actions={
                      <Button
                        variant="secondary"
                        onClick={() => navigate("/app/workouts")}
                      >
                        Start workout
                      </Button>
                    }
                  />
                )}
              </SurfaceCardContent>
            </SurfaceCard>
          </div>

          <SurfaceCard>
            <SurfaceCardHeader className="pb-4">
              <SurfaceCardTitle>Progress summary</SurfaceCardTitle>
              <SurfaceCardDescription>
                A quick read on what the recent data is saying.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent>
              <SectionCard className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                <div className="space-y-3">
                  <p className="text-base leading-7 text-foreground">
                    {insightText ||
                      "Keep logging consistently to unlock clearer trend signals and stronger coach-facing insights."}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    This summary updates from your baseline, habit logs, and
                    completed workout set logs.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/35 px-3 py-3">
                    <p className="field-label">Weight trend</p>
                    <p className="mt-1 text-sm text-foreground">
                      {getDelta(filteredWeightSeries) !== null
                        ? `${getDelta(filteredWeightSeries)! > 0 ? "+" : ""}${getDelta(filteredWeightSeries)!.toFixed(1)} ${weightUnit}`
                        : "Not enough data"}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/35 px-3 py-3">
                    <p className="field-label">Sleep trend</p>
                    <p className="mt-1 text-sm text-foreground">
                      {getDelta(filteredSleepSeries) !== null
                        ? `${getDelta(filteredSleepSeries)! > 0 ? "+" : ""}${getDelta(filteredSleepSeries)!.toFixed(1)} hrs`
                        : "Not enough data"}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/35 px-3 py-3">
                    <p className="field-label">Step trend</p>
                    <p className="mt-1 text-sm text-foreground">
                      {getDelta(filteredStepsSeries) !== null
                        ? `${Math.round(getDelta(filteredStepsSeries)!)}`
                        : "Not enough data"}
                    </p>
                  </div>
                </div>
              </SectionCard>
            </SurfaceCardContent>
          </SurfaceCard>
        </div>
      )}
    </div>
  );
}
