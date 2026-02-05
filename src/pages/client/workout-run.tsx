import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { getSupabaseErrorMessage } from "../../lib/supabase-errors";
import { useAuth } from "../../lib/auth";
import { Check, Film, ListChecks } from "lucide-react";

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
  notes: string | null;
  videoUrl: string | null;
  previousLabel: string | null;
  weightUnit: string | null;
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

type ExerciseRow = {
  id: string;
  name: string | null;
  video_url?: string | null;
  category?: string | null;
  equipment?: string | null;
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
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishNotes, setFinishNotes] = useState("");
  const [finishStatus, setFinishStatus] = useState<"idle" | "saving" | "error">("idle");
  const [finishError, setFinishError] = useState<string | null>(null);

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
          "id, assigned_workout_id, exercise_id, sort_order, sets, reps, rpe, tempo, notes, rest_seconds, video_url, default_weight_unit, default_weight_value, weight_unit, weight_value, actual_weight_value, actual_weight_unit, is_completed"
        )
        .eq("assigned_workout_id", workoutId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssignedWorkoutExerciseRow[];
    },
  });

  const assignedExerciseIds = useMemo(
    () =>
      Array.from(
        new Set(
          (assignedExercisesQuery.data ?? [])
            .map((row) => row.exercise_id)
            .filter((id): id is string => Boolean(id))
        )
      ),
    [assignedExercisesQuery.data]
  );

  const exercisesQuery = useQuery({
    queryKey: ["exercise-details", assignedExerciseIds],
    enabled: assignedExerciseIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, name, category, equipment, video_url")
        .in("id", assignedExerciseIds);
      if (error) throw error;
      return (data ?? []) as ExerciseRow[];
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

  const exerciseById = useMemo(() => {
    const map = new Map<string, ExerciseRow>();
    (exercisesQuery.data ?? []).forEach((exercise) => {
      if (exercise.id) map.set(exercise.id, exercise);
    });
    return map;
  }, [exercisesQuery.data]);

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
      const exercise = "exercise" in row ? row.exercise : exerciseById.get(row.exercise_id ?? "");
      const name = exercise?.name ?? "Exercise (missing details)";
      const count = row.sets && row.sets > 0 ? row.sets : 3;
      const sets = Array.from({ length: count }).map((_, index) => {
        const setNumber = index + 1;
        const key = `${exercise?.id ?? ""}-${setNumber}`;
        const item = latestByKey.get(key);
        return {
          id: item?.id,
          reps: typeof item?.reps === "number" ? String(item.reps) : "",
          weight: typeof item?.weight === "number" ? String(item.weight) : "",
          rpe: typeof item?.rpe === "number" ? String(item.rpe) : "",
          is_completed: item?.is_completed === true,
        };
      });
      const unit =
        row.actual_weight_unit ??
        row.weight_unit ??
        row.default_weight_unit ??
        null;
      const prevWeight =
        row.actual_weight_value ??
        row.weight_value ??
        row.default_weight_value ??
        null;
      const prevReps = row.reps ?? null;
      const previousLabel =
        typeof prevWeight === "number" && typeof prevReps === "number"
          ? `${prevWeight}${unit ? ` ${unit}` : ""} x ${prevReps}`
          : null;
      return {
        id: row.id,
        exerciseId: exercise?.id ?? "",
        name,
        notes: row.notes ?? null,
        videoUrl: row.video_url ?? exercise?.video_url ?? null,
        previousLabel,
        weightUnit: unit,
        sets,
      };
    });
    setExercises(next);
  }, [
    assignedExercisesQuery.data,
    setLogsQuery.data,
    templateExercisesQuery.data,
    exerciseById,
  ]);

  useEffect(() => {
    if (exercises.length === 0) return;
    if (activeExerciseIndex >= exercises.length) {
      setActiveExerciseIndex(0);
    }
  }, [activeExerciseIndex, exercises.length]);

  const errors = [
    clientQuery.error,
    assignedWorkoutQuery.error,
    workoutSessionQuery.error,
    assignedExercisesQuery.error,
    exercisesQuery.error,
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

  const handleConfirmFinish = async () => {
    if (!workoutId || !workoutSession?.id) return;
    setFinishStatus("saving");
    setFinishError(null);
    const completedAt = new Date().toISOString();
    try {
      const { error: sessionError } = await supabase
        .from("workout_sessions")
        .update({ completed_at: completedAt, client_notes: finishNotes.trim() || null })
        .eq("id", workoutSession.id);
      if (sessionError) throw sessionError;

      const { error: assignedError } = await supabase
        .from("assigned_workouts")
        .update({ status: "completed", completed_at: completedAt })
        .eq("id", workoutId);
      if (assignedError) throw assignedError;

      setFinishStatus("idle");
      setFinishOpen(false);
      navigate("/app/home", { state: { toast: "Workout logged" } });
    } catch (error) {
      setFinishStatus("error");
      setFinishError(getErrorMessage(error));
    }
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
  const sessionNotes =
    assignedWorkoutQuery.data?.workout_template?.description ?? null;
  const activeExercise = exercises[activeExerciseIndex] ?? null;
  const totalSets = useMemo(
    () => exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    [exercises]
  );
  const completedSets = useMemo(
    () =>
      exercises.reduce(
        (sum, exercise) => sum + exercise.sets.filter((setItem) => setItem.is_completed).length,
        0
      ),
    [exercises]
  );
  const progressPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
  const completedExercises = useMemo(
    () =>
      exercises.filter(
        (exercise) =>
          exercise.sets.length > 0 &&
          exercise.sets.every((setItem) => setItem.is_completed)
      ).length,
    [exercises]
  );
  const totalVolume = useMemo(
    () =>
      exercises.reduce((sum, exercise) => {
        return (
          sum +
          exercise.sets.reduce((setSum, setItem) => {
            const weight = Number(setItem.weight);
            const reps = Number(setItem.reps);
            if (!Number.isFinite(weight) || !Number.isFinite(reps)) return setSum;
            if (weight <= 0 || reps <= 0) return setSum;
            return setSum + weight * reps;
          }, 0)
        );
      }, 0),
    [exercises]
  );

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
        <div className="space-y-6">
          {workoutSession ? (
            <div className="text-sm text-muted-foreground">
              Total sets logged: {setLogsQuery.data?.length ?? 0}
            </div>
          ) : (
            <Card className="rounded-xl border-border/70 bg-card/80">
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
            <Card className="rounded-xl border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle>Workout</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                This workout has no exercises yet. Message your coach.
              </CardContent>
            </Card>
          ) : null}

          {exercises.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-12">
              <div className="md:col-span-3">
                <ExerciseNav
                  exercises={exercises}
                  activeExerciseIndex={activeExerciseIndex}
                  onSelect={setActiveExerciseIndex}
                />
              </div>
              <div className="md:col-span-6 space-y-4">
                <div className="md:hidden">
                  <label className="text-xs font-semibold text-muted-foreground">Exercise</label>
                  <select
                    className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    value={activeExerciseIndex}
                    onChange={(event) => setActiveExerciseIndex(Number(event.target.value))}
                  >
                    {exercises.map((exercise, index) => (
                      <option key={`${exercise.exerciseId}-${index}`} value={index}>
                        {exercise.name}
                      </option>
                    ))}
                  </select>
                </div>
                {activeExercise ? (
                  <ActiveExercisePanel
                    exercise={activeExercise}
                    exerciseIndex={activeExerciseIndex}
                    canEdit={Boolean(workoutSession)}
                    isSaving={saveIndex === activeExerciseIndex}
                    onSave={() => handleSaveExercise(activeExerciseIndex)}
                    onSetChange={handleSetChange}
                  />
                ) : null}
          {workoutSession ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setFinishOpen(true)}>Finish workout</Button>
              <Button variant="secondary" onClick={handleSkipWorkout}>
                Skip workout
              </Button>
            </div>
          ) : null}
              </div>
              <div className="md:col-span-3">
                <CoachRail
                  sessionNotes={sessionNotes}
                  completedSets={completedSets}
                  totalSets={totalSets}
                  progressPct={progressPct}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Finish workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Exercises</p>
                <p className="text-lg font-semibold text-foreground">
                  {completedExercises}/{exercises.length}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Sets</p>
                <p className="text-lg font-semibold text-foreground">
                  {completedSets}/{totalSets}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Volume</p>
                <p className="text-lg font-semibold text-foreground">
                  {totalVolume > 0 ? totalVolume.toFixed(0) : "—"}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Notes to coach
              </label>
              <textarea
                className="min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="Optional notes for your coach..."
                value={finishNotes}
                onChange={(event) => setFinishNotes(event.target.value)}
              />
            </div>
            {finishError ? (
              <Alert className="border-danger/30">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{finishError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleConfirmFinish}
                disabled={!workoutSession || finishStatus === "saving"}
              >
                {finishStatus === "saving" ? "Saving..." : "Confirm finish"}
              </Button>
              <Button variant="secondary" onClick={() => setFinishOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/80 backdrop-blur md:static md:border-none md:bg-transparent md:backdrop-blur-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="text-xs text-muted-foreground">
            {workoutSession ? "Ready to finish? Save and log your session." : "Start the workout to log sets."}
          </div>
          <Button
            onClick={() => setFinishOpen(true)}
            disabled={!workoutSession}
          >
            Finish workout
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExerciseNav({
  exercises,
  activeExerciseIndex,
  onSelect,
}: {
  exercises: ExerciseState[];
  activeExerciseIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <Card className="hidden rounded-xl border-border/70 bg-card/80 md:block">
      <CardHeader>
        <CardTitle className="text-base">Exercises</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {exercises.map((exercise, index) => {
          const completed = exercise.sets.filter((setItem) => setItem.is_completed).length;
          const total = exercise.sets.length;
          const isDone = total > 0 && completed === total;
          return (
            <button
              key={`${exercise.exerciseId}-${index}`}
              type="button"
              onClick={() => onSelect(index)}
              className={`flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-sm transition ${
                index === activeExerciseIndex
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "hover:bg-muted/40"
              } ${isDone ? "text-muted-foreground" : "text-foreground"}`}
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{exercise.name}</span>
                <span className="text-xs text-muted-foreground">
                  {completed}/{total} sets completed
                </span>
              </div>
              {isDone ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <Check className="h-4 w-4" />
                </span>
              ) : null}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ActiveExercisePanel({
  exercise,
  exerciseIndex,
  canEdit,
  isSaving,
  onSave,
  onSetChange,
}: {
  exercise: ExerciseState;
  exerciseIndex: number;
  canEdit: boolean;
  isSaving: boolean;
  onSave: () => void;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: keyof SetState,
    value: string | boolean
  ) => void;
}) {
  return (
    <Card className="rounded-xl border-border/70 bg-card/80">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-lg">{exercise.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {exercise.notes ?? "No coach notes for this exercise."}
          </p>
        </div>
        {exercise.videoUrl ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(exercise.videoUrl ?? "", "_blank")}
          >
            <Film className="mr-2 h-4 w-4" />
            Watch demo
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <ExerciseSetTable
          exercise={exercise}
          exerciseIndex={exerciseIndex}
          canEdit={canEdit}
          onSetChange={onSetChange}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!canEdit || isSaving}
          onClick={onSave}
        >
          {isSaving ? "Saving..." : "Save sets"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ExerciseSetTable({
  exercise,
  exerciseIndex,
  canEdit,
  onSetChange,
}: {
  exercise: ExerciseState;
  exerciseIndex: number;
  canEdit: boolean;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: keyof SetState,
    value: string | boolean
  ) => void;
}) {
  const unitLabel = exercise.weightUnit ?? "kg";
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-[60px_1fr_120px_100px_80px] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
        <span>Set</span>
        <span>Previous</span>
        <span>Weight</span>
        <span>Reps</span>
        <span>Done</span>
      </div>
      {exercise.sets.map((setItem, setIndex) => {
        const isDone = setItem.is_completed;
        return (
          <div
            key={`${exercise.exerciseId}-${setIndex}`}
            className={`grid grid-cols-[60px_1fr_120px_100px_80px] items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0 ${
              isDone ? "opacity-60" : ""
            }`}
          >
            <span className="text-xs font-semibold text-muted-foreground">{setIndex + 1}</span>
            <span
              className={`text-xs text-muted-foreground ${
                isDone ? "line-through" : ""
              }`}
            >
              {exercise.previousLabel ?? "—"}
            </span>
            <div className="flex items-center gap-2">
              <input
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={setItem.weight}
                onChange={(event) =>
                  onSetChange(exerciseIndex, setIndex, "weight", event.target.value)
                }
                disabled={!canEdit}
              />
              <span className="text-xs text-muted-foreground">{unitLabel}</span>
            </div>
            <input
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={setItem.reps}
              onChange={(event) =>
                onSetChange(exerciseIndex, setIndex, "reps", event.target.value)
              }
              disabled={!canEdit}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={setItem.is_completed}
                onChange={(event) =>
                  onSetChange(exerciseIndex, setIndex, "is_completed", event.target.checked)
                }
                disabled={!canEdit}
              />
              Done
            </label>
          </div>
        );
      })}
    </div>
  );
}

function CoachRail({
  sessionNotes,
  completedSets,
  totalSets,
  progressPct,
}: {
  sessionNotes: string | null;
  completedSets: number;
  totalSets: number;
  progressPct: number;
}) {
  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-base">Coach notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {sessionNotes ?? "No additional notes from your coach."}
        </CardContent>
      </Card>
      <Card className="rounded-xl border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-base">Today&apos;s focus</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Stay consistent, keep form tight, and log every working set.
        </CardContent>
      </Card>
      <Card className="rounded-xl border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-base">Session progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {completedSets}/{totalSets} sets completed
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/40">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListChecks className="h-4 w-4 text-primary" />
            Track progress as you go.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
