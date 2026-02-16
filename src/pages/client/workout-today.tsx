import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

export function ClientWorkoutTodayPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const todayKey = useMemo(() => formatDateKey(new Date()), []);

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

  const workoutQuery = useQuery({
    queryKey: ["assigned-workout-today", clientId, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select("id, workout_name, status, scheduled_date, completed_at")
        .eq("client_id", clientId)
        .eq("scheduled_date", todayKey)
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: "completed" | "skipped") => {
      if (!workoutQuery.data?.id)
        throw new Error("No workout found for today.");
      const payload =
        status === "completed"
          ? { status, completed_at: new Date().toISOString() }
          : { status, completed_at: null };
      const { error } = await supabase
        .from("assigned_workouts")
        .update(payload)
        .eq("id", workoutQuery.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assigned-workout-today"] });
      queryClient.invalidateQueries({ queryKey: ["assigned-workouts-week"] });
    },
  });

  const errors = [
    clientQuery.error,
    workoutQuery.error,
    updateStatus.error,
  ].filter(Boolean);

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Today&apos;s workout
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Workout for {todayKey}
          </h1>
        </div>
        <Button variant="secondary" onClick={() => navigate("/app/home")}>
          Back to home
        </Button>
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

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {workoutQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : workoutQuery.data ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Assigned</p>
                  <p className="text-lg font-semibold">
                    {workoutQuery.data.workout_name}
                  </p>
                </div>
                <Badge
                  variant={
                    workoutQuery.data.status === "completed"
                      ? "success"
                      : workoutQuery.data.status === "skipped"
                        ? "danger"
                        : "muted"
                  }
                >
                  {workoutQuery.data.status}
                </Badge>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(`/app/workout-run/${workoutQuery.data?.id}`)
                }
              >
                Open workout
              </Button>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  disabled={
                    updateStatus.isPending ||
                    workoutQuery.data.status === "completed"
                  }
                  onClick={() => updateStatus.mutate("completed")}
                >
                  {workoutQuery.data.status === "completed"
                    ? "Completed"
                    : "Complete workout"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={
                    updateStatus.isPending ||
                    workoutQuery.data.status === "skipped"
                  }
                  onClick={() => updateStatus.mutate("skipped")}
                >
                  {workoutQuery.data.status === "skipped"
                    ? "Skipped"
                    : "Skip workout"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold">No workout assigned yet</p>
              <p className="text-sm text-muted-foreground">
                Your coach has not scheduled a session for today. Check back
                later or message your coach from the home screen.
              </p>
              <Button variant="secondary" onClick={() => navigate("/app/home")}>
                Return to home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
