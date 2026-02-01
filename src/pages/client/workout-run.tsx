import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

type SetState = {
  id?: string;
  reps: string;
  weight: string;
  rpe: string;
  is_completed: boolean;
};

type ExerciseState = {
  id: string;
  exerciseId: string;
  name: string;
  sets: SetState[];
};

type AssignedWorkoutExerciseRow = {
  id: string;
  sets: number | null;
  reps: string | null;
  exercise: {
    id: string;
    name: string | null;
  } | null;
};

type WorkoutSessionRow = {
  id: string;
  assigned_workout_id: string | null;
  client_id: string | null;
};

type WorkoutSetLogRow = {
  id: string;
  workout_session_id: string | null;
  exercise_id: string | null;
  set_number: number | null;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  is_completed: boolean | null;
  created_at: string | null;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

export function ClientWorkoutRunPage() {
  const navigate = useNavigate();
  const { assignedWorkoutId } = useParams();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [saveIndex, setSaveIndex] = useState<number | null>(null);

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
      if (!assignedWorkoutId || !clientId) return null;
      const { data: assignedWorkout, error: assignedError } = await supabase
        .from("assigned_workouts")
        .select(
          "id, status, workout_template:workout_templates(id, name, workout_type_tag, description)"
        )
        .eq("client_id", clientId)
        .eq("id", assignedWorkoutId)
        .maybeSingle();
      if (assignedError) throw assignedError;
      return assignedWorkout ?? null;
    },
  });

  const workoutSessionQuery = useQuery({
    queryKey: ["workout-session", assignedWorkoutId, clientId],
    enabled: !!assignedWorkoutId && !!clientId,
    queryFn: async () => {
      if (!assignedWorkoutId || !clientId) return null;
      const { data: existing, error: existingError } = await supabase
        .from("workout_sessions")
        .select("id, assigned_workout_id, client_id")
        .eq("assigned_workout_id", assignedWorkoutId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return existing as WorkoutSessionRow;

      const { data: created, error: createError } = await supabase
        .from("workout_sessions")
        .insert({
          assigned_workout_id: assignedWorkoutId,
          client_id: clientId,
        })
        .select("id, assigned_workout_id, client_id")
        .maybeSingle();
      if (createError) throw createError;
      return (created ?? null) as WorkoutSessionRow | null;
    },
  });

  const workoutSession = workoutSessionQuery.data ?? null;

  const assignedExercisesQuery = useQuery({
    queryKey: ["assigned-workout-exercises", assignedWorkoutId],
    enabled: !!assignedWorkoutId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workout_exercises")
        .select("id, sets, reps, exercise:exercises(id, name)")
        .eq("assigned_workout_id", assignedWorkoutId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssignedWorkoutExerciseRow[];
    },
  });

  const setLogsQuery = useQuery({
    queryKey: ["workout-set-logs", workoutSession?.id],
    enabled: !!workoutSession?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select(
          "id, workout_session_id, exercise_id, set_number, reps, weight, rpe, is_completed, created_at"
        )
        .eq("workout_session_id", workoutSession?.id ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkoutSetLogRow[];
    },
  });

  const [exercises, setExercises] = useState<ExerciseState[]>([]);

  useEffect(() => {
    if (!workoutSession) return;
    const items = setLogsQuery.data ?? [];
    const latestByKey = new Map<string, WorkoutSetLogRow>();
    items.forEach((item) => {
      if (!item.exercise_id || typeof item.set_number !== "number") return;
      const key = `${item.exercise_id}-${item.set_number}`;
      if (!latestByKey.has(key)) {
        latestByKey.set(key, item);
        return;
      }
      const existing = latestByKey.get(key);
      const existingTime = existing?.created_at
        ? new Date(existing.created_at).getTime()
        : 0;
      const nextTime = item.created_at ? new Date(item.created_at).getTime() : 0;
      if (nextTime > existingTime) {
        latestByKey.set(key, item);
      }
    });
    const next = (assignedExercisesQuery.data ?? []).map((row) => {
      const name = row.exercise?.name ?? "Exercise";
      const count = row.sets && row.sets > 0 ? row.sets : 3;
      const sets = Array.from({ length: count }).map((_, index) => {
        const setNumber = index + 1;
        const key = `${row.exercise?.id ?? ""}-${setNumber}`;
        const item = latestByKey.get(key);
        return {
          id: item?.id,
          reps: typeof item?.reps === "number" ? String(item.reps) : "",
          weight: typeof item?.weight === "number" ? String(item.weight) : "",
          rpe: typeof item?.rpe === "number" ? String(item.rpe) : "",
          is_completed: item?.is_completed === true,
        };
      });
      return { id: row.id, exerciseId: row.exercise?.id ?? "", name, sets };
    });
    setExercises(next);
  }, [assignedExercisesQuery.data, setLogsQuery.data, workoutSession]);

  const errors = [
    clientQuery.error,
    assignedWorkoutQuery.error,
    workoutSessionQuery.error,
    assignedExercisesQuery.error,
    setLogsQuery.error,
  ].filter(Boolean);

  const handleSetChange = (
    exerciseIndex: number,
    setIndex: number,
    field: keyof SetState,
    value: string
  ) => {
    setExercises((prev) =>
      prev.map((exercise, exIdx) => {
        if (exIdx !== exerciseIndex) return exercise;
        return {
          ...exercise,
          sets: exercise.sets.map((setItem, setIdx) =>
            setIdx === setIndex ? { ...setItem, [field]: value } : setItem
          ),
        };
      })
    );
  };

  const handleSaveExercise = async (exerciseIndex: number) => {
    if (!workoutSession?.id) return;
    const exercise = exercises[exerciseIndex];
    setSaveIndex(exerciseIndex);

    try {
      for (let idx = 0; idx < exercise.sets.length; idx += 1) {
        const setItem = exercise.sets[idx];
        const reps = setItem.reps.trim();
        const weight = setItem.weight.trim();
        const rpe = setItem.rpe.trim();
        const hasValues = Boolean(reps || weight || rpe);

        const repsValue = reps ? Number(reps) : null;
        const weightValue = weight ? Number(weight) : null;
        const rpeValue = rpe ? Number(rpe) : null;
        const isCompleted = Boolean(repsValue || weightValue || rpeValue);

        const { data: existing, error: existingError } = await supabase
          .from("workout_set_logs")
          .select("id")
          .eq("workout_session_id", workoutSession.id)
          .eq("exercise_id", exercise.exerciseId)
          .eq("set_number", idx + 1)
          .maybeSingle();
        if (existingError) throw existingError;

        if (existing?.id) {
          const { error } = await supabase
            .from("workout_set_logs")
            .update({
              reps: repsValue,
              weight: weightValue,
              rpe: rpeValue,
              is_completed: isCompleted,
            })
            .eq("id", existing.id);
          if (error) throw error;
        } else if (hasValues) {
          const { error } = await supabase.from("workout_set_logs").insert({
            workout_session_id: workoutSession.id,
            exercise_id: exercise.exerciseId,
            set_number: idx + 1,
            reps: repsValue,
            weight: weightValue,
            rpe: rpeValue,
            is_completed: isCompleted,
          });
          if (error) throw error;
        }
      }
      await queryClient.invalidateQueries({
        queryKey: ["workout-set-logs", workoutSession.id],
      });
    } catch (error) {
      console.error("Failed to save sets", error);
    } finally {
      setSaveIndex(null);
    }
  };

  const handleFinishWorkout = async () => {
    if (!assignedWorkoutId) return;
    await supabase
      .from("assigned_workouts")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", assignedWorkoutId);
    navigate(`/app/workout-summary/${assignedWorkoutId}`);
  };

  const handleSkipWorkout = async () => {
    if (assignedWorkoutId) {
      await supabase
        .from("assigned_workouts")
        .update({ status: "skipped" })
        .eq("id", assignedWorkoutId);
    }
    navigate("/app/home");
  };

  const workoutTitle =
    assignedWorkoutQuery.data?.workout_template?.name ?? "Workout";

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Workout run</p>
          <h1 className="text-2xl font-semibold tracking-tight">{workoutTitle}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="muted">In progress</Badge>
            <span>Log your sets as you go.</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate("/app/home")}>
            Back to home
          </Button>
        </div>
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

      {assignedWorkoutQuery.isLoading || workoutSessionQuery.isLoading || setLogsQuery.isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : workoutSession ? (
        <div className="space-y-4">
          {exercises.map((exercise, exerciseIndex) => (
            <Card key={exercise.name}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{exercise.name}</CardTitle>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saveIndex === exerciseIndex}
                  onClick={() => handleSaveExercise(exerciseIndex)}
                >
                  {saveIndex === exerciseIndex ? "Saving..." : "Save sets"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {exercise.sets.map((setItem, setIndex) => (
                  <div
                    key={`${exercise.name}-${setIndex}`}
                    className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-[120px_1fr_1fr_2fr]"
                  >
                    <div className="text-xs font-semibold text-muted-foreground">
                      Set {setIndex + 1}
                    </div>
                    <input
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      type="number"
                      inputMode="numeric"
                      placeholder="Reps"
                      value={setItem.reps}
                      onChange={(event) =>
                        handleSetChange(exerciseIndex, setIndex, "reps", event.target.value)
                      }
                    />
                    <input
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      type="number"
                      inputMode="decimal"
                      placeholder="Weight"
                      value={setItem.weight}
                      onChange={(event) =>
                        handleSetChange(exerciseIndex, setIndex, "weight", event.target.value)
                      }
                    />
                    <input
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      type="number"
                      inputMode="decimal"
                      placeholder="RPE"
                      value={setItem.rpe}
                      onChange={(event) =>
                        handleSetChange(exerciseIndex, setIndex, "rpe", event.target.value)
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleFinishWorkout}>Finish workout</Button>
            <Button variant="secondary" onClick={handleSkipWorkout}>
              Skip workout
            </Button>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>No workout session found yet.</p>
            <Button variant="secondary" onClick={() => navigate("/app/home")}>
              Return home
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
