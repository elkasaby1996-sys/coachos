import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { Badge } from "../../components/ui/badge";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
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
  exercise:
    | { name: string | null }
    | { name: string | null }[]
    | null;
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

const toShortDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function MetricCard({
  title,
  unit,
  series,
  colorVar,
}: {
  title: string;
  unit: string;
  series: SeriesPoint[];
  colorVar: string;
}) {
  const axisColor = "oklch(0.98 0 0 / 0.92)";

  const latest = [...series].reverse().find((point) => typeof point.value === "number")?.value ?? null;
  const first = series.find((point) => typeof point.value === "number")?.value ?? null;
  const delta =
    typeof latest === "number" && typeof first === "number" ? latest - first : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant="muted">
            {typeof latest === "number" ? `${latest}${unit ? ` ${unit}` : ""}` : "--"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.35 0.02 260 / 0.35)" />
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
                  typeof value === "number" ? `${value}${unit ? ` ${unit}` : ""}` : value
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                name={title}
                stroke={colorVar}
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground">
          {delta === null
            ? "Not enough data to compute change."
            : `Change: ${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit ? ` ${unit}` : ""}`}
        </p>
      </CardContent>
    </Card>
  );
}

export function ClientProgressPage() {
  const { session } = useAuth();
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
      return data as { id: string; timezone: string | null; unit_preference: string | null } | null;
    },
  });

  const clientId = clientQuery.data?.id ?? null;
  const todayKey = useMemo(
    () => getTodayInTimezone(clientQuery.data?.timezone ?? null),
    [clientQuery.data?.timezone]
  );
  const startKey = useMemo(() => addDaysToDateString(todayKey, -55), [todayKey]);

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
        .select("reps, weight, created_at, exercise_id, exercise:exercises(name), workout_session:workout_sessions!inner(client_id)")
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

      const dateKey = (baselineEntry.submitted_at ?? baselineEntry.created_at ?? "").slice(0, 10);
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

  const weightUnit = useMemo(() => {
    const fromLogs = (habitsQuery.data ?? []).find((row) => row.weight_unit)?.weight_unit;
    if (fromLogs) return fromLogs;
    return clientQuery.data?.unit_preference?.toLowerCase() === "imperial" ? "lb" : "kg";
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
      const label = toShortDate(row.log_date);
      weight.push({ dateKey: row.log_date, label, value: row.weight_value });
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
    const byDate = new Map<string, { volume: number; weightSum: number; weightCount: number }>();
    const byExercise = new Map<
      string,
      { name: string; firstWeight: number | null; latestWeight: number | null; firstVolume: number | null; latestVolume: number | null }
    >();

    rows.forEach((row) => {
      const dateKey = row.created_at ? row.created_at.slice(0, 10) : null;
      const reps = typeof row.reps === "number" ? row.reps : null;
      const weight = typeof row.weight === "number" ? row.weight : null;
      const volume = reps !== null && weight !== null ? reps * weight : null;

      if (dateKey) {
        const curr = byDate.get(dateKey) ?? { volume: 0, weightSum: 0, weightCount: 0 };
        if (typeof volume === "number" && volume > 0) curr.volume += volume;
        if (typeof weight === "number" && weight > 0) {
          curr.weightSum += weight;
          curr.weightCount += 1;
        }
        byDate.set(dateKey, curr);
      }

      if (!row.exercise_id) return;
      const exerciseName = Array.isArray(row.exercise)
        ? row.exercise[0]?.name ?? "Exercise"
        : row.exercise?.name ?? "Exercise";
      const existing =
        byExercise.get(row.exercise_id) ?? {
          name: exerciseName,
          firstWeight: null,
          latestWeight: null,
          firstVolume: null,
          latestVolume: null,
        };
      if (existing.firstWeight === null && typeof weight === "number" && weight > 0) {
        existing.firstWeight = weight;
      }
      if (typeof weight === "number" && weight > 0) {
        existing.latestWeight = weight;
      }
      if (existing.firstVolume === null && typeof volume === "number" && volume > 0) {
        existing.firstVolume = volume;
      }
      if (typeof volume === "number" && volume > 0) {
        existing.latestVolume = volume;
      }
      byExercise.set(row.exercise_id, existing);
    });

    const loadSeries = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateKey, value]) => ({
        dateKey,
        label: toShortDate(dateKey),
        volume: Number(value.volume.toFixed(1)),
        avgWeight:
          value.weightCount > 0 ? Number((value.weightSum / value.weightCount).toFixed(1)) : null,
      }));

    const changes = [...byExercise.values()]
      .map((row) => ({
        name: row.name,
        firstWeight: row.firstWeight,
        latestWeight: row.latestWeight,
        firstVolume: row.firstVolume,
        latestVolume: row.latestVolume,
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
          Math.abs((a.weightDelta ?? 0) + (a.volumeDelta ?? 0) / 10)
      )
      .slice(0, 8);

    return { loadSeries, changes };
  }, [setLogsQuery.data]);

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <section className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
          <p className="text-sm text-muted-foreground">
            Weight, sleep, steps, and exercise load trends.
          </p>
        </div>
        <Badge variant="muted">Last 8 weeks</Badge>
      </section>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-[220px] w-full" /></CardContent></Card>
          <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-[220px] w-full" /></CardContent></Card>
          <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-[220px] w-full" /></CardContent></Card>
          <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-[220px] w-full" /></CardContent></Card>
          <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-[220px] w-full" /></CardContent></Card>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <MetricCard
            title="Body weight"
            unit={weightUnit}
            series={habitSeries.weight}
            colorVar="oklch(var(--chart-1))"
          />
          <MetricCard
            title="Sleep hours"
            unit="hrs"
            series={habitSeries.sleep}
            colorVar="oklch(var(--chart-2))"
          />
          <MetricCard
            title="Steps"
            unit=""
            series={habitSeries.steps}
            colorVar="oklch(var(--chart-4))"
          />
          <Card>
            <CardHeader>
              <CardTitle>Exercise volume</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={exerciseTrends.loadSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.35 0.02 260 / 0.35)" />
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
                      name="Volume"
                      stroke="oklch(var(--chart-3))"
                      strokeWidth={2.3}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Exercise changes</CardTitle>
            </CardHeader>
            <CardContent>
              {exerciseTrends.changes.length > 0 ? (
                <div className="space-y-2">
                  {exerciseTrends.changes.map((item) => {
                    const trendBase = item.volumeDelta ?? item.weightDelta ?? 0;
                    const TrendIcon =
                      trendBase > 0 ? ArrowUpRight : trendBase < 0 ? ArrowDownRight : Minus;

                    return (
                      <div
                        key={item.name}
                        className="flex items-start justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <div className="space-y-1">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Weight:{" "}
                            {item.weightDelta !== null
                              ? `${item.weightDelta > 0 ? "+" : ""}${item.weightDelta.toFixed(1)} (${item.weightPct !== null ? `${item.weightPct > 0 ? "+" : ""}${item.weightPct.toFixed(1)}%` : "--"})`
                              : "--"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Volume:{" "}
                            {item.volumeDelta !== null
                              ? `${item.volumeDelta > 0 ? "+" : ""}${item.volumeDelta.toFixed(0)} (${item.volumePct !== null ? `${item.volumePct > 0 ? "+" : ""}${item.volumePct.toFixed(1)}%` : "--"})`
                              : "--"}
                          </p>
                        </div>
                        <TrendIcon
                          className={
                            trendBase > 0
                              ? "mt-0.5 h-4 w-4 text-emerald-500"
                              : trendBase < 0
                                ? "mt-0.5 h-4 w-4 text-rose-500"
                                : "mt-0.5 h-4 w-4 text-muted-foreground"
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No exercise change data yet. Log a few sessions to see trends.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
