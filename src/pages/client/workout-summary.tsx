import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Dumbbell, Gauge, Scale, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

type WorkoutSessionRow = {
  id: string;
  assigned_workout_id: string | null;
  client_id: string | null;
  created_at: string | null;
};

type WorkoutTemplateInfo = {
  id: string;
  name: string | null;
  description: string | null;
};

type AssignedWorkoutRow = {
  id: string;
  workout_template: WorkoutTemplateInfo | WorkoutTemplateInfo[] | null;
};

type WorkoutSetLogRow = {
  id: string;
  workout_session_id: string | null;
  exercise_id: string | null;
  set_number: number | null;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  created_at: string | null;
  exercise:
    | {
        id: string;
        name: string | null;
      }
    | { id: string; name: string | null }[]
    | null;
};

const titleMarker =
  "h-3 w-3 rounded-full border-2 border-primary/85 bg-transparent shadow-[0_0_12px_rgba(56,189,248,0.45)]";

const cardChrome =
  "border border-border/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_14px_30px_-18px_rgba(0,0,0,0.85)]";

const formatDateTime = (value: string | null) => {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatChangeNumber = (value: number | null, suffix = "") => {
  if (value === null || Number.isNaN(value)) return "--";
  const withSign = `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
  return `${withSign}${suffix}`;
};

const parseWorkoutTemplate = (value: AssignedWorkoutRow["workout_template"]) =>
  Array.isArray(value) ? (value[0] ?? null) : value;

export function ClientWorkoutSummaryPage() {
  const navigate = useNavigate();
  const { assignedWorkoutId } = useParams();
  const { session } = useAuth();

  const clientQuery = useQuery({
    queryKey: ["client", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const clientId = clientQuery.data?.id ?? null;

  const assignedWorkoutQuery = useQuery({
    queryKey: ["assigned-workout", assignedWorkoutId, clientId],
    enabled: !!assignedWorkoutId && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select("id, workout_template:workout_templates(id, name, description)")
        .eq("client_id", clientId ?? "")
        .eq("id", assignedWorkoutId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AssignedWorkoutRow | null;
    },
  });

  const workoutSessionQuery = useQuery({
    queryKey: ["workout-session-summary", assignedWorkoutId, clientId],
    enabled: !!assignedWorkoutId && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id, assigned_workout_id, client_id, created_at")
        .eq("assigned_workout_id", assignedWorkoutId ?? "")
        .eq("client_id", clientId ?? "")
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WorkoutSessionRow | null;
    },
  });

  const workoutSession = workoutSessionQuery.data ?? null;

  const setLogsQuery = useQuery({
    queryKey: ["workout-set-logs-summary", workoutSession?.id],
    enabled: !!workoutSession?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select(
          "id, workout_session_id, exercise_id, set_number, reps, weight, rpe, created_at, exercise:exercises(id, name)",
        )
        .eq("workout_session_id", workoutSession?.id ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkoutSetLogRow[];
    },
  });

  const totalSetsQuery = useQuery({
    queryKey: ["workout-set-logs-count", workoutSession?.id],
    enabled: !!workoutSession?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("workout_set_logs")
        .select("id", { count: "exact", head: true })
        .eq("workout_session_id", workoutSession?.id ?? "");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const grouped = useMemo(() => {
    const items = setLogsQuery.data ?? [];
    return items.reduce<Record<string, WorkoutSetLogRow[]>>((acc, item) => {
      const key = item.exercise_id ?? "unknown";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [setLogsQuery.data]);

  const sessionStats = useMemo(() => {
    const rows = setLogsQuery.data ?? [];
    const exerciseIds = new Set<string>();
    let totalVolume = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    rows.forEach((row) => {
      if (row.exercise_id) exerciseIds.add(row.exercise_id);
      const reps = typeof row.reps === "number" ? row.reps : null;
      const weight = typeof row.weight === "number" ? row.weight : null;
      if (reps !== null && weight !== null) totalVolume += reps * weight;
      if (typeof row.rpe === "number") {
        rpeSum += row.rpe;
        rpeCount += 1;
      }
    });

    return {
      exerciseCount: exerciseIds.size,
      totalVolume: Number(totalVolume.toFixed(1)),
      avgRpe: rpeCount > 0 ? Number((rpeSum / rpeCount).toFixed(1)) : null,
    };
  }, [setLogsQuery.data]);

  const errors = [
    clientQuery.error,
    assignedWorkoutQuery.error,
    workoutSessionQuery.error,
    setLogsQuery.error,
    totalSetsQuery.error,
  ].filter(Boolean);

  const totalSets = totalSetsQuery.data ?? 0;
  const workoutTemplate = parseWorkoutTemplate(
    assignedWorkoutQuery.data?.workout_template ?? null,
  );

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Workout summary
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workoutTemplate?.name ?? "Workout summary"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {workoutTemplate?.description ?? "Summary details below."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate("/app/home")}>
            Back to home
          </Button>
        </div>
      </section>

      {errors.length > 0 ? (
        <div className="space-y-2">
          {errors.map((error, index) => (
            <Alert
              key={`${index}-${getErrorMessage(error)}`}
              className="border-danger/30"
            >
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{getErrorMessage(error)}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      {assignedWorkoutQuery.isLoading || workoutSessionQuery.isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : !workoutSession ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>No session started yet.</p>
            <Button variant="secondary" onClick={() => navigate("/app/home")}>
              Return home
            </Button>
          </CardContent>
        </Card>
      ) : setLogsQuery.isLoading || totalSetsQuery.isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Session recap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className={`${cardChrome} bg-card/70`}>
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Sets logged
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <p className="text-xl font-semibold">{totalSets}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Exercises
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-primary" />
                  <p className="text-xl font-semibold">
                    {sessionStats.exerciseCount}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Total volume
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Scale className="h-4 w-4 text-primary" />
                  <p className="text-xl font-semibold">
                    {sessionStats.totalVolume.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Average RPE
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  <p className="text-xl font-semibold">
                    {sessionStats.avgRpe ?? "--"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`${cardChrome} bg-card/80`}>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={titleMarker} />
                  <CardTitle>Session recap</CardTitle>
                </div>
                <Badge variant="muted">
                  {formatDateTime(workoutSession.created_at)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Review your logged sets by exercise.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {Object.keys(grouped).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(grouped).map(([exerciseId, items]) => {
                    const exerciseInfo = Array.isArray(items[0]?.exercise)
                      ? items[0]?.exercise[0]
                      : (items[0]?.exercise ?? null);
                    const exerciseName = exerciseInfo?.name ?? "Exercise";
                    const orderedItems = [...items].sort(
                      (a, b) => (a.set_number ?? 0) - (b.set_number ?? 0),
                    );

                    const exerciseVolume = orderedItems.reduce((sum, item) => {
                      if (
                        typeof item.reps === "number" &&
                        typeof item.weight === "number"
                      ) {
                        return sum + item.reps * item.weight;
                      }
                      return sum;
                    }, 0);

                    const firstWeight =
                      typeof orderedItems[0]?.weight === "number"
                        ? orderedItems[0].weight
                        : null;
                    const lastWeight =
                      typeof orderedItems[orderedItems.length - 1]?.weight ===
                      "number"
                        ? orderedItems[orderedItems.length - 1].weight
                        : null;
                    const loadDelta =
                      firstWeight !== null && lastWeight !== null
                        ? lastWeight - firstWeight
                        : null;

                    return (
                      <div
                        key={exerciseId}
                        className="rounded-xl border border-border/70 bg-background/65 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">
                              {exerciseName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {orderedItems.length} set
                              {orderedItems.length === 1 ? "" : "s"} logged
                            </p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>Volume {exerciseVolume.toFixed(0)}</p>
                            <p>Load change {formatChangeNumber(loadDelta)}</p>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1.5">
                          {orderedItems.map((item, index) => (
                            <div
                              key={item.id}
                              className="grid grid-cols-[auto,1fr,auto] items-center gap-3 rounded-lg border border-border/60 bg-muted/15 px-2.5 py-2"
                            >
                              <span className="text-xs font-medium text-muted-foreground">
                                #{item.set_number ?? index + 1}
                              </span>
                              <p className="text-xs text-foreground/90">
                                {item.reps ?? "-"} reps @ {item.weight ?? "-"}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {typeof item.rpe === "number"
                                  ? `RPE ${item.rpe}`
                                  : "--"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  No sets logged yet. Log a few sets to see your recap.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`${cardChrome} bg-card/70`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>
                  Share feedback with your coach while this session is still
                  fresh.
                </span>
              </div>
              <Button
                onClick={() =>
                  navigate(
                    `/app/messages?draft=${encodeURIComponent(
                      "Here are my notes from today's workout.",
                    )}`,
                  )
                }
              >
                Message coach about this workout
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
