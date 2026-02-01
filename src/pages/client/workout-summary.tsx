import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
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
      return data;
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
          "id, workout_session_id, exercise_id, set_number, reps, weight, rpe, created_at, exercise:exercises(id, name)"
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

  const errors = [
    clientQuery.error,
    assignedWorkoutQuery.error,
    workoutSessionQuery.error,
    setLogsQuery.error,
    totalSetsQuery.error,
  ].filter(Boolean);

  const totalSets = totalSetsQuery.data ?? 0;

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Workout summary</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {assignedWorkoutQuery.data?.workout_template?.name ?? "Workout summary"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {assignedWorkoutQuery.data?.workout_template?.description ??
              "Summary details below."}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/app/home")}>Back to home</Button>
      </section>

      {errors.length > 0 ? (
        <div className="space-y-2">
          {errors.map((error, index) => (
            <Alert key={`${index}-${getErrorMessage(error)}`} className="border-danger/30">
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
            <Button variant="secondary" onClick={() => navigate("/app/home")}>Return home</Button>
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
        <Card>
          <CardHeader>
            <CardTitle>Session recap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Total sets logged</p>
              <p className="text-lg font-semibold">{totalSets}</p>
            </div>
            {Object.keys(grouped).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(grouped).map(([exerciseId, items]) => {
                  const exerciseInfo = Array.isArray(items[0]?.exercise)
                    ? items[0]?.exercise[0]
                    : items[0]?.exercise ?? null;
                  const exerciseName = exerciseInfo?.name ?? "Exercise";
                  const recentItems = items.slice(0, 5);
                  return (
                    <div key={exerciseId} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-semibold">{exerciseName}</p>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {recentItems.map((item, index) => (
                          <div key={item.id}>
                            Set {item.set_number ?? index + 1}: {item.reps ?? "-"} reps @{" "}
                            {item.weight ?? "-"}
                            {typeof item.rpe === "number" ? ` · RPE ${item.rpe}` : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                No sets logged yet. Log a few sets to see your recap.
              </div>
            )}
            <Button
              onClick={() =>
                navigate(
                  `/app/messages?draft=${encodeURIComponent(
                    "Here are my notes from today's workout."
                  )}`
                )
              }
            >
              Message coach about this workout
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
