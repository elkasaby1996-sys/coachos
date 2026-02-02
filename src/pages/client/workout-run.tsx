import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { getSupabaseErrorMessage } from "../../lib/supabase-errors";
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
  assigned_workout_id: string | null;
  exercise_id: string | null;
  sort_order?: number | null;
  set_order?: number | null;
  set_number?: number | null;
  sets: number | null;
  reps: number | null;
  rpe: number | null;
  tempo: string | null;
  notes: string | null;
  video_url?: string | null;
  rest_seconds?: number | null;
  default_weight_value?: number | null;
  default_weight_unit?: string | null;
  weight_value?: number | null;
  weight_unit?: string | null;
  actual_weight_value?: number | null;
  actual_weight_unit?: string | null;
  is_completed?: boolean | null;
  load_notes?: string | null;
  exercise: {
    id: string;
    name: string | null;
    video_url?: string | null;
    category?: string | null;
    equipment?: string | null;
  } | null;
};

type TemplateWorkoutExerciseRow = {
  id: string;
  workout_template_id?: string | null;
  sort_order?: number | null;
  sets: number | null;
  reps: number | null;
  rpe: number | null;
  tempo: string | null;
  notes: string | null;
  video_url?: string | null;
  rest_seconds?: number | null;
  exercise: {
    id: string;
    name: string | null;
    video_url?: string | null;
    category?: string | null;
    equipment?: string | null;
  } | null;
};

type WorkoutSessionRow = {
  id: string;
  assigned_workout_id: string | null;
  started_at?: string | null;
  completed_at?: string | null;
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

const getErrorMessage = (error: unknown) => getSupabaseErrorMessage(error);

const isUuid = (value: string | undefined | null) =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );

export function ClientWorkoutRunPage() {
  const navigate = useNavigate();
  const { assignedWorkoutId } = useParams();
  const workoutId = isUuid(assignedWorkoutId) ? assignedWorkoutId : null;
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [saveIndex, setSaveIndex] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    queryKey: ["assigned-workout", workoutId, clientId],
    enabled: !!workoutId && !!clientId,
    queryFn: async () => {
      if (!workoutId || !clientId) return null;
      const { data: assignedWorkout, error: assignedError } = await supabase
        .from("assigned_workouts")
        .select(
          "id, status, workout_template:workout_templates(id, name, workout_type_tag, description)"
        )
        .eq("client_id", clientId)
        .eq("id", workoutId)
        .maybeSingle();
      if (assignedError) throw assignedError;
      return assignedWorkout ?? null;
    },
  });

  const workoutSessionQuery = useQuery({
    queryKey: ["workout-session", workoutId],
    enabled: !!workoutId && !!assignedWorkoutQuery.data,
    queryFn: async () => {
      if (!workoutId) return null;
      const selectSession = async (orderColumn: "created_at" | "started_at") =>
        supabase
          .from("workout_sessions")
          .select("id, assigned_workout_id, started_at, completed_at, created_at")
          .eq("assigned_workout_id", workoutId)
          .order(orderColumn, { ascending: false })
          .limit(1)
          .maybeSingle();

      const { data: existing, error: existingError } = await selectSession("created_at");
      if (existingError?.code === "42703") {
        const fallback = await selectSession("started_at");
        if (fallback.error) throw fallback.error;
        return (fallback.data ?? null) as WorkoutSessionRow | null;
      }
      if (existingError) throw existingError;
      return (existing ?? null) as WorkoutSessionRow | null;
    },
  });

  const workoutSession = workoutSessionQuery.data ?? null;

  const assignedExercisesQuery = useQuery({
    queryKey: ["assigned-workout-exercises", workoutId],
    enabled: !!workoutId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workout_exercises")
        .select(
          "id, assigned_workout_id, sort_order, sets, reps, rpe, tempo, notes, rest_seconds, video_url, default_weight_unit, default_weight_value, weight_unit, weight_value, actual_weight_value, actual_weight_unit, is_completed, exercise:exercises(id, name, category, equipment, video_url)"
        )
        .eq("assigned_workout_id", workoutId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssignedWorkoutExerciseRow[];
    },
  });

  const templateExercisesQuery = useQuery({
    queryKey: ["workout-template-exercises", assignedWorkoutQuery.data?.workout_template?.id],
    enabled: !!assignedWorkoutQuery.data?.workout_template?.id,
    queryFn: async () => {
      const templateId = assignedWorkoutQuery.data?.workout_template?.id ?? null;
      if (!templateId) return [];
      const baseQuery = () =>
        supabase
          .from("workout_template_exercises")
          .select(
            "id, workout_template_id, sort_order, sets, reps, rpe, tempo, notes, rest_seconds, video_url, exercise:exercises(id, name, category, equipment, video_url)"
          )
          .eq("workout_template_id", templateId);
      const ordered = await baseQuery().order("sort_order", { ascending: true });
      if (!ordered.error) return (ordered.data ?? []) as TemplateWorkoutExerciseRow[];
      if (ordered.error.code === "42703") {
        const fallback = await baseQuery();
        if (fallback.error) throw fallback.error;
        return (fallback.data ?? []) as TemplateWorkoutExerciseRow[];
      }
      throw ordered.error;
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
    const sourceRows =
      assignedExercisesQuery.data && assignedExercisesQuery.data.length > 0
        ? assignedExercisesQuery.data
        : templateExercisesQuery.data ?? [];
    const next = sourceRows.map((row) => {
      const name = row.exercise?.name ?? "Exercise (missing details)";
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
      return {
        id: row.id,
        exerciseId: row.exercise?.id ?? "",
        name,
        sets,
      };
    });
    setExercises(next);
  }, [assignedExercisesQuery.data, setLogsQuery.data, templateExercisesQuery.data]);

  const errors = [
    clientQuery.error,
    assignedWorkoutQuery.error,
    workoutSessionQuery.error,
    assignedExercisesQuery.error,
    templateExercisesQuery.error,
    setLogsQuery.error,
  ].filter(Boolean);

  const handleSetChange = (
    exerciseIndex: number,
    setIndex: number,
    field: keyof SetState,
    value: string | boolean
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

  const handleStartWorkout = async () => {
    if (!workoutId || !clientId) return;
    setSaveError(null);
    const { error: createError } = await supabase.from("workout_sessions").upsert(
      {
        assigned_workout_id: workoutId,
        client_id: clientId,
        started_at: new Date().toISOString(),
      },
      { onConflict: "assigned_workout_id", ignoreDuplicates: true }
    );
    if (createError) {
      setSaveError(getErrorMessage(createError));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["workout-session", workoutId] });
  };

  const handleSaveExercise = async (exerciseIndex: number) => {
    if (!workoutSession?.id) return;
    const exercise = exercises[exerciseIndex];
    setSaveIndex(exerciseIndex);
    setSaveError(null);

    try {
      for (let idx = 0; idx < exercise.sets.length; idx += 1) {
        const setItem = exercise.sets[idx];
        const reps = setItem.reps.trim();
        const weight = setItem.weight.trim();
        const rpe = setItem.rpe.trim();
        const hasValues = Boolean(reps || weight || rpe || setItem.is_completed);

        const repsValue = reps ? Number(reps) : null;
        const weightValue = weight ? Number(weight) : null;
        const rpeValue = rpe ? Number(rpe) : null;
        const isCompleted = Boolean(setItem.is_completed);

        if (hasValues) {
          const { error } = await supabase.from("workout_set_logs").upsert(
            {
              workout_session_id: workoutSession.id,
              exercise_id: exercise.exerciseId,
              set_number: idx + 1,
              reps: repsValue,
              weight: weightValue,
              rpe: rpeValue,
              is_completed: isCompleted,
            },
            { onConflict: "workout_session_id,exercise_id,set_number" }
          );
          if (error) throw error;
        }
      }
      await queryClient.invalidateQueries({
        queryKey: ["workout-set-logs", workoutSession.id],
      });
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setSaveIndex(null);
    }
  };

  const handleFinishWorkout = async () => {
    if (!workoutId || !workoutSession?.id) return;
    const completedAt = new Date().toISOString();
    const { error: sessionError } = await supabase
      .from("workout_sessions")
      .update({ completed_at: completedAt })
      .eq("id", workoutSession.id);
    if (sessionError) {
      setSaveError(getErrorMessage(sessionError));
      return;
    }
    const { error: assignedError } = await supabase
      .from("assigned_workouts")
      .update({ status: "completed", completed_at: completedAt })
      .eq("id", workoutId);
    if (assignedError) {
      setSaveError(getErrorMessage(assignedError));
      return;
    }
    navigate(`/app/workout-summary/${workoutId}`);
  };

  const handleSkipWorkout = async () => {
    if (workoutId) {
      await supabase
        .from("assigned_workouts")
        .update({ status: "skipped" })
        .eq("id", workoutId);
    }
    navigate("/app/home");
  };

  const workoutTitle =
    assignedWorkoutQuery.data?.workout_template?.name ?? "Workout";

  if (!workoutId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid workout link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Workout id: {assignedWorkoutId ?? "missing"}</p>
          <Button variant="secondary" onClick={() => navigate("/app/home")}>
            Return home
          </Button>
        </CardContent>
      </Card>
    );
  }

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
      {saveError ? (
        <Alert className="border-danger/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
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
      ) : (
        <div className="space-y-4">
          {workoutSession ? (
            <div className="text-sm text-muted-foreground">
              Total sets logged: {setLogsQuery.data?.length ?? 0}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Session</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Ready to start this workout?</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleStartWorkout}>Start workout</Button>
                  <Button variant="secondary" onClick={() => navigate("/app/home")}>
                    Return home
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {assignedExercisesQuery.isLoading || templateExercisesQuery.isLoading ? null : exercises.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Workout</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                This workout has no exercises yet. Message your coach.
              </CardContent>
            </Card>
          ) : null}
          {exercises.map((exercise, exerciseIndex) => (
            <Card key={exercise.name}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{exercise.name}</CardTitle>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!workoutSession || saveIndex === exerciseIndex}
                  onClick={() => handleSaveExercise(exerciseIndex)}
                >
                  {saveIndex === exerciseIndex ? "Saving..." : "Save sets"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {exercise.sets.map((setItem, setIndex) => (
                  <div
                    key={`${exercise.name}-${setIndex}`}
                    className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-[120px_1fr_1fr_1fr_auto]"
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
                      disabled={!workoutSession}
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
                      disabled={!workoutSession}
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
                      disabled={!workoutSession}
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={setItem.is_completed}
                        onChange={(event) =>
                          handleSetChange(
                            exerciseIndex,
                            setIndex,
                            "is_completed",
                            event.target.checked
                          )
                        }
                        disabled={!workoutSession}
                      />
                      Done
                    </label>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          {workoutSession ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleFinishWorkout}>Finish workout</Button>
              <Button variant="secondary" onClick={handleSkipWorkout}>
                Skip workout
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
