import { useEffect, useMemo, useState } from "react";
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
  weight_kg: string;
  notes: string;
};

type ExerciseState = {
  name: string;
  sets: SetState[];
};

const placeholderExercises = [
  "Back Squat",
  "Bench Press",
  "Bent-over Row",
  "Walking Lunges",
  "Plank",
];

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

  const workoutLogQuery = useQuery({
    queryKey: ["workout-log", assignedWorkoutId, clientId],
    enabled: !!assignedWorkoutId && !!clientId,
    queryFn: async () => {
      if (!assignedWorkoutId || !clientId) return null;

      const { data: logById, error: logByIdError } = await supabase
        .from("workout_logs")
        .select(
          "id, title, status, started_at, finished_at, assigned_workout_id, workout_template_id"
        )
        .eq("id", assignedWorkoutId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (logByIdError) throw logByIdError;
      if (logById) return { log: logById };

      const { data: logByAssigned, error: logByAssignedError } = await supabase
        .from("workout_logs")
        .select(
          "id, title, status, started_at, finished_at, assigned_workout_id, workout_template_id"
        )
        .eq("assigned_workout_id", assignedWorkoutId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (logByAssignedError) throw logByAssignedError;
      if (logByAssigned) return { log: logByAssigned };

      const { data: assignedWorkout, error: assignedError } = await supabase
        .from("assigned_workouts")
        .select(
          "id, status, workout_template:workout_templates(id, name, workout_type_tag, description)"
        )
        .eq("client_id", clientId)
        .eq("id", assignedWorkoutId)
        .maybeSingle();
      if (assignedError) throw assignedError;
      if (!assignedWorkout) return null;

      const title = assignedWorkout.workout_template?.name ?? "Workout";
      const { data: createdLog, error: createError } = await supabase
        .from("workout_logs")
        .insert({
          client_id: clientId,
          assigned_workout_id: assignedWorkout.id,
          workout_template_id: assignedWorkout.workout_template?.id ?? null,
          title,
          status: "in_progress",
        })
        .select(
          "id, title, status, started_at, finished_at, assigned_workout_id, workout_template_id"
        )
        .maybeSingle();
      if (createError) throw createError;
      if (!createdLog) return null;
      return { log: createdLog };
    },
  });

  const workoutLog = workoutLogQuery.data?.log ?? null;

  const logItemsQuery = useQuery({
    queryKey: ["workout-log-items", workoutLog?.id],
    enabled: !!workoutLog?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_log_items")
        .select("id, exercise_name, set_index, reps, weight_kg, notes")
        .eq("workout_log_id", workoutLog?.id ?? "")
        .order("exercise_name", { ascending: true })
        .order("set_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [exercises, setExercises] = useState<ExerciseState[]>([]);

  useEffect(() => {
    if (!workoutLog) return;
    const items = logItemsQuery.data ?? [];
    const next = placeholderExercises.map((name) => {
      const sets = Array.from({ length: 3 }).map((_, index) => {
        const item = items.find(
          (entry) => entry.exercise_name === name && entry.set_index === index + 1
        );
        return {
          id: item?.id,
          reps: item?.reps ? String(item.reps) : "",
          weight_kg: item?.weight_kg ? String(item.weight_kg) : "",
          notes: item?.notes ?? "",
        };
      });
      return { name, sets };
    });
    setExercises(next);
  }, [logItemsQuery.data, workoutLog]);

  const errors = [clientQuery.error, workoutLogQuery.error, logItemsQuery.error].filter(Boolean);

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
    if (!workoutLog?.id) return;
    const exercise = exercises[exerciseIndex];
    setSaveIndex(exerciseIndex);

    try {
      for (let idx = 0; idx < exercise.sets.length; idx += 1) {
        const setItem = exercise.sets[idx];
        const reps = setItem.reps.trim();
        const weight = setItem.weight_kg.trim();
        const notes = setItem.notes.trim();
        const hasValues = Boolean(reps || weight || notes);

        const repsValue = reps ? Number(reps) : null;
        const weightValue = weight ? Number(weight) : null;

        if (setItem.id) {
          const { error } = await supabase
            .from("workout_log_items")
            .update({
              reps: repsValue,
              weight_kg: weightValue,
              notes: notes || null,
            })
            .eq("id", setItem.id);
          if (error) throw error;
        } else if (hasValues) {
          const { error } = await supabase.from("workout_log_items").insert({
            workout_log_id: workoutLog.id,
            exercise_name: exercise.name,
            set_index: idx + 1,
            reps: repsValue,
            weight_kg: weightValue,
            notes: notes || null,
          });
          if (error) throw error;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["workout-log-items", workoutLog.id] });
    } catch (error) {
      console.error("Failed to save sets", error);
    } finally {
      setSaveIndex(null);
    }
  };

  const handleFinishWorkout = async () => {
    if (!workoutLog?.id) return;
    const { error } = await supabase
      .from("workout_logs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", workoutLog.id);
    if (error) return;

    if (workoutLog.assigned_workout_id) {
      await supabase
        .from("assigned_workouts")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", workoutLog.assigned_workout_id);
    }

    navigate(`/app/workout-summary/${workoutLog.assigned_workout_id ?? workoutLog.id}`);
  };

  const handleSkipWorkout = async () => {
    if (workoutLog?.assigned_workout_id) {
      await supabase
        .from("assigned_workouts")
        .update({ status: "skipped" })
        .eq("id", workoutLog.assigned_workout_id);
    }
    navigate("/app/home");
  };

  const workoutTitle = workoutLog?.title ?? "Workout";

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

      {workoutLogQuery.isLoading || logItemsQuery.isLoading ? (
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
      ) : workoutLog ? (
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
                      placeholder="Weight (kg)"
                      value={setItem.weight_kg}
                      onChange={(event) =>
                        handleSetChange(exerciseIndex, setIndex, "weight_kg", event.target.value)
                      }
                    />
                    <input
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      type="text"
                      placeholder="Notes"
                      value={setItem.notes}
                      onChange={(event) =>
                        handleSetChange(exerciseIndex, setIndex, "notes", event.target.value)
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
            <p>No workout log found yet.</p>
            <Button variant="secondary" onClick={() => navigate("/app/home")}>
              Return home
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
