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

  const workoutLogQuery = useQuery({
    queryKey: ["workout-summary", assignedWorkoutId, clientId],
    enabled: !!assignedWorkoutId && !!clientId,
    queryFn: async () => {
      if (!assignedWorkoutId || !clientId) return null;
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id, title, started_at, finished_at, assigned_workout_id")
        .eq("client_id", clientId)
        .or(`id.eq.${assignedWorkoutId},assigned_workout_id.eq.${assignedWorkoutId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const logId = workoutLogQuery.data?.id ?? null;

  const logItemsQuery = useQuery({
    queryKey: ["workout-log-items-summary", logId],
    enabled: !!logId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_log_items")
        .select("id, exercise_name, set_index, reps, weight_kg, notes")
        .eq("workout_log_id", logId ?? "")
        .order("exercise_name", { ascending: true })
        .order("set_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const items = logItemsQuery.data ?? [];
    return items.reduce<Record<string, typeof items>>((acc, item) => {
      if (!acc[item.exercise_name]) acc[item.exercise_name] = [];
      acc[item.exercise_name].push(item);
      return acc;
    }, {});
  }, [logItemsQuery.data]);

  const totalSets = (logItemsQuery.data ?? []).length;

  const errors = [clientQuery.error, workoutLogQuery.error, logItemsQuery.error].filter(Boolean);

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Workout summary</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workoutLogQuery.data?.title ?? "Workout summary"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {workoutLogQuery.data?.finished_at
              ? new Date(workoutLogQuery.data.finished_at).toLocaleString("en-US")
              : "Summary details below."}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/app/home")}>
          Back to home
        </Button>
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

      {workoutLogQuery.isLoading || logItemsQuery.isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : workoutLogQuery.data ? (
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
                {Object.entries(grouped).map(([exercise, items]) => (
                  <div key={exercise} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold">{exercise}</p>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {items.map((item) => (
                        <div key={item.id}>
                          Set {item.set_index}: {item.reps ?? "—"} reps @{" "}
                          {item.weight_kg ?? "—"} kg
                          {item.notes ? ` · ${item.notes}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                No sets logged yet. Add notes next time to track progress.
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>No workout summary found yet.</p>
            <Button variant="secondary" onClick={() => navigate("/app/home")}>
              Return home
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
