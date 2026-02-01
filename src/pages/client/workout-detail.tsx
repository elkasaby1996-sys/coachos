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
  detail: TemplateExerciseRow | null;
  sets: SetState[];
};

type TemplateExerciseRow = {
  id: string;
  sort_order: number | null;
  sets: number | null;
  reps: string | null;
  weight_kg: number | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe: number | null;
  video_url: string | null;
  notes: string | null;
  exercise: {
    id: string;
    name: string | null;
    muscle_group: string | null;
    equipment: string | null;
    video_url: string | null;
  } | null;
};

const getErrorDetails = (error: unknown) => {
  if (!error) return { code: "unknown", message: "Unknown error" };
  if (typeof error === "object") {
    const err = error as { code?: string | null; message?: string | null };
    return { code: err.code ?? "unknown", message: err.message ?? "Unknown error" };
  }
  return { code: "unknown", message: "Unknown error" };
};

export function ClientWorkoutDetailPage() {
  const { assignedWorkoutId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [saveIndex, setSaveIndex] = useState<number | null>(null);
  const [showSummary, setShowSummary] = useState(false);

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

  const assignedQuery = useQuery({
    queryKey: ["assigned-workout", assignedWorkoutId, clientId],
    enabled: !!assignedWorkoutId && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, status, completed_at, workout_template:workout_templates(id, name, description, workout_type)"
        )
        .eq("id", assignedWorkoutId ?? "")
        .eq("client_id", clientId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const assignedExercisesQuery = useQuery({
    queryKey: ["assigned-workout-exercises", assignedWorkoutId, clientId],
    enabled: !!assignedWorkoutId && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workout_exercises")
        .select(
          "id, sort_order, sets, reps, weight_kg, rest_seconds, tempo, rpe, video_url, notes, exercise:exercises(id, name, muscle_group, equipment, video_url)"
        )
        .eq("assigned_workout_id", assignedWorkoutId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateExerciseRow[];
    },
  });

  const workoutLogQuery = useQuery({
    queryKey: ["workout-log", assignedWorkoutId, clientId],
    enabled: !!assignedWorkoutId && !!clientId && !!assignedQuery.data,
    queryFn: async () => {
      const { data: existing, error: existingError } = await supabase
        .from("workout_logs")
        .select("id, title, status, started_at, finished_at, assigned_workout_id")
        .eq("assigned_workout_id", assignedWorkoutId ?? "")
        .eq("client_id", clientId ?? "")
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return existing;

      const title = assignedQuery.data?.workout_template?.name ?? "Workout";
      const { data: created, error: createError } = await supabase
        .from("workout_logs")
        .insert({
          client_id: clientId,
          assigned_workout_id: assignedWorkoutId,
          workout_template_id: assignedQuery.data?.workout_template?.id ?? null,
          title,
          status: "in_progress",
        })
        .select("id, title, status, started_at, finished_at, assigned_workout_id")
        .maybeSingle();
      if (createError) throw createError;
      return created;
    },
  });

  const workoutLog = workoutLogQuery.data ?? null;

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
    const templateExercises = assignedExercisesQuery.data ?? [];
    const next = templateExercises.map((row) => {
      const name = row.exercise?.name ?? "Exercise";
      const count = row.sets && row.sets > 0 ? row.sets : 3;
      const sets = Array.from({ length: count }).map((_, index) => {
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
      return { name, detail: row, sets };
    });
    setExercises(next);
  }, [logItemsQuery.data, workoutLog, assignedExercisesQuery.data]);

  useEffect(() => {
    if (assignedQuery.data?.status === "completed") {
      setShowSummary(true);
    }
  }, [assignedQuery.data?.status]);

  const errors = [
    clientQuery.error,
    assignedQuery.error,
    assignedExercisesQuery.error,
    workoutLogQuery.error,
    logItemsQuery.error,
  ].filter(Boolean);

  const templateExercises = assignedExercisesQuery.data ?? [];

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

  const saveSet = async (exerciseIndex: number, setIndex: number) => {
    if (!workoutLog?.id) return;
    const exercise = exercises[exerciseIndex];
    const setItem = exercise.sets[setIndex];
    const repsValue = setItem.reps.trim() ? Number(setItem.reps) : null;
    const weightValue = setItem.weight_kg.trim() ? Number(setItem.weight_kg) : null;
    const notesValue = setItem.notes.trim() || null;
    const hasValues = Boolean(repsValue || weightValue || notesValue);

    if (setItem.id) {
      const { error } = await supabase
        .from("workout_log_items")
        .update({
          reps: repsValue,
          weight_kg: weightValue,
          notes: notesValue,
        })
        .eq("id", setItem.id);
      if (error) return;
      return;
    }

    if (hasValues) {
      const { data, error } = await supabase
        .from("workout_log_items")
        .insert({
          workout_log_id: workoutLog.id,
          exercise_name: exercise.name,
          set_index: setIndex + 1,
          reps: repsValue,
          weight_kg: weightValue,
          notes: notesValue,
        })
        .select("id")
        .maybeSingle();
      if (error || !data?.id) return;
      setExercises((prev) =>
        prev.map((ex, exIdx) => {
          if (exIdx !== exerciseIndex) return ex;
          return {
            ...ex,
            sets: ex.sets.map((set, sIdx) =>
              sIdx === setIndex ? { ...set, id: data.id } : set
            ),
          };
        })
      );
    }
  };

  const handleSaveExercise = async (exerciseIndex: number) => {
    if (!workoutLog?.id) return;
    setSaveIndex(exerciseIndex);
    for (let idx = 0; idx < exercises[exerciseIndex].sets.length; idx += 1) {
      // eslint-disable-next-line no-await-in-loop
      await saveSet(exerciseIndex, idx);
    }
    await queryClient.invalidateQueries({ queryKey: ["workout-log-items", workoutLog.id] });
    setSaveIndex(null);
  };

  const handleFinish = async () => {
    if (!workoutLog?.id) return;
    await supabase
      .from("workout_logs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", workoutLog.id);
    await supabase
      .from("assigned_workouts")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", assignedWorkoutId ?? "");
    setShowSummary(true);
    await queryClient.invalidateQueries({ queryKey: ["assigned-workout", assignedWorkoutId] });
  };

  const summaryGroups = useMemo(() => {
    const items = logItemsQuery.data ?? [];
    return items.reduce<Record<string, typeof items>>((acc, item) => {
      if (!acc[item.exercise_name]) acc[item.exercise_name] = [];
      acc[item.exercise_name].push(item);
      return acc;
    }, {});
  }, [logItemsQuery.data]);

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Assigned workout</p>
          <h2 className="text-xl font-semibold tracking-tight">
            {assignedQuery.data?.workout_template?.name ?? "Workout"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {assignedQuery.data?.workout_template?.description ??
              "In-progress workout log."}
          </p>
        </div>
        <Badge variant={assignedQuery.data?.status === "completed" ? "success" : "muted"}>
          {assignedQuery.data?.status === "completed" ? "Completed" : "In progress"}
        </Badge>
      </div>

      {errors.length > 0 ? (
        <div className="space-y-2">
          {errors.map((error, index) => {
            const details = getErrorDetails(error);
            return (
              <Alert key={`${index}-${details.message}`} className="border-danger/30">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {details.code}: {details.message}
                </AlertDescription>
              </Alert>
            );
          })}
        </div>
      ) : null}

      {assignedQuery.isLoading || workoutLogQuery.isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Workout log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : !assignedQuery.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Workout not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>We couldn't find this assigned workout. Try going back home.</p>
            <Button variant="secondary" onClick={() => navigate("/app/home")}>
              Back to home
            </Button>
          </CardContent>
        </Card>
      ) : showSummary ? (
        <Card>
          <CardHeader>
            <CardTitle>Workout summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {Object.keys(summaryGroups).length > 0 ? (
              Object.entries(summaryGroups).map(([exercise, items]) => (
                <div key={exercise} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold">{exercise}</p>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {items.map((item) => (
                      <div key={item.id}>
                        Set {item.set_index}: {item.reps ?? "-"} reps @{" "}
                        {item.weight_kg ?? "-"} kg
                        {item.notes ? ` · ${item.notes}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                No sets logged yet.
              </div>
            )}
            <Button onClick={() => navigate("/app/home")}>Back to home</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Exercises</CardTitle>
              <p className="text-sm text-muted-foreground">
                {assignedQuery.data?.workout_template?.description ??
                  "Coach-programmed exercises for this session."}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {templateExercises.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Coach hasn't added exercises yet.
                </div>
              ) : (
                templateExercises.map((exercise) => {
                  const name = exercise.exercise?.name ?? "Exercise";
                  const sets = exercise.sets ? `${exercise.sets} sets` : "";
                  const reps = exercise.reps ? `${exercise.reps} reps` : "";
                  const repLine = [sets, reps].filter(Boolean).join(" x ");
                  const weight =
                    typeof exercise.weight_kg === "number"
                      ? `${exercise.weight_kg} kg`
                      : null;
                  const details = [
                    repLine,
                    weight ? `Weight ${weight}` : "Set load",
                    exercise.rest_seconds ? `Rest ${exercise.rest_seconds}s` : null,
                    exercise.tempo ? `Tempo ${exercise.tempo}` : null,
                    typeof exercise.rpe === "number" ? `RPE ${exercise.rpe}` : null,
                  ].filter(Boolean);
                  const video =
                    exercise.video_url || exercise.exercise?.video_url || null;

                  return (
                    <div
                      key={exercise.id}
                      className="rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{name}</p>
                          {details.length > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {details.join(" - ")}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No parameters set yet.
                            </p>
                          )}
                        </div>
                        {video ? (
                          <a
                            className="text-xs font-semibold text-accent"
                            href={video}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Watch video
                          </a>
                        ) : null}
                      </div>
                      {exercise.notes ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Notes: {exercise.notes}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

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
                      onBlur={() => saveSet(exerciseIndex, setIndex)}
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
                      onBlur={() => saveSet(exerciseIndex, setIndex)}
                    />
                    <input
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      type="text"
                      placeholder="Notes"
                      value={setItem.notes}
                      onChange={(event) =>
                        handleSetChange(exerciseIndex, setIndex, "notes", event.target.value)
                      }
                      onBlur={() => saveSet(exerciseIndex, setIndex)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleFinish}>Finish workout</Button>
            <Button variant="secondary" onClick={() => navigate("/app/home")}>
              Back to home
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
