import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { getSupabaseErrorDetails } from "../../lib/supabase-errors";
import { useAuth } from "../../lib/auth";

type SetState = {
  id?: string;
  reps: string;
  weight: string;
  rpe: string;
  is_completed: boolean;
};

type ExerciseState = {
  name: string;
  detail: TemplateExerciseRow | null;
  sets: SetState[];
};

type TemplateExerciseRow = {
  id: string;
  set_order?: number | null;
  sets: number | null;
  reps: number | null;
  superset_group?: string | null;
  is_completed?: boolean | null;
  rest_seconds?: number | null;
  tempo?: string | null;
  rpe?: number | null;
  video_url?: string | null;
  notes?: string | null;
  exercise:
    | {
        id: string;
        name: string | null;
        muscle_group: string | null;
        equipment: string | null;
        video_url?: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        muscle_group: string | null;
        equipment: string | null;
        video_url?: string | null;
      }>
    | null;
};

type WorkoutSetLog = {
  id: string;
  workout_session_id: string | null;
  exercise_id: string | null;
  set_number: number | null;
  reps: number | null;
  weight: number | null;
  rpe?: number | null;
  is_completed?: boolean | null;
  created_at: string | null;
};

type WorkoutSessionRow = {
  id: string;
  assigned_workout_id: string | null;
};

const getErrorDetails = (error: unknown) => getSupabaseErrorDetails(error);
const getSingleRelation = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
const getWorkoutTemplate = (value: any) =>
  getSingleRelation(value?.workout_template);

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
          "id, status, completed_at, workout_template:workout_templates(id, name, description, workout_type_tag)",
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
      const baseQuery = () =>
        supabase
          .from("assigned_workout_exercises")
          .select(
            "id, assigned_workout_id, exercise_id, sets, reps, superset_group, rpe, tempo, notes, rest_seconds, exercise:exercises(id, name, muscle_group, equipment, video_url)",
          )
          .eq("assigned_workout_id", assignedWorkoutId ?? "");
      const ordered = await baseQuery().order("created_at", {
        ascending: true,
      });
      if (!ordered.error)
        return (ordered.data ?? []) as unknown as TemplateExerciseRow[];
      if (ordered.error.code === "42703") {
        const fallback = await baseQuery();
        if (fallback.error) throw fallback.error;
        return (fallback.data ?? []) as unknown as TemplateExerciseRow[];
      }
      throw ordered.error;
    },
  });

  const workoutTemplate = getWorkoutTemplate(assignedQuery.data);
  const workoutTemplateId = workoutTemplate?.id ?? null;

  const templateExercisesQuery = useQuery({
    queryKey: ["workout-template-exercises", workoutTemplateId],
    enabled: !!workoutTemplateId,
    queryFn: async () => {
      const templateId = workoutTemplateId;
      if (!templateId) return [];
      const baseQuery = () =>
        supabase
          .from("workout_template_exercises")
          .select(
            "id, sort_order, sets, reps, superset_group, rest_seconds, tempo, rpe, video_url, notes, exercise:exercises(id, name, muscle_group, equipment, video_url)",
          )
          .eq("workout_template_id", templateId);
      const ordered = await baseQuery().order("sort_order", {
        ascending: true,
      });
      if (!ordered.error)
        return (ordered.data ?? []) as unknown as TemplateExerciseRow[];
      if (ordered.error.code === "42703") {
        const fallback = await baseQuery();
        if (fallback.error) throw fallback.error;
        return (fallback.data ?? []) as unknown as TemplateExerciseRow[];
      }
      throw ordered.error;
    },
  });

  const workoutSessionQuery = useQuery({
    queryKey: ["workout-session", assignedWorkoutId, clientId],
    enabled: !!assignedWorkoutId && !!clientId && !!assignedQuery.data,
    queryFn: async () => {
      const selectSession = async (orderColumn: "created_at" | "started_at") =>
        supabase
          .from("workout_sessions")
          .select("id, assigned_workout_id")
          .eq("assigned_workout_id", assignedWorkoutId ?? "")
          .order(orderColumn, { ascending: false })
          .maybeSingle();

      const { data: existing, error: existingError } =
        await selectSession("created_at");
      if (existingError?.code === "42703") {
        const fallback = await selectSession("started_at");
        if (fallback.error) throw fallback.error;
        if (fallback.data) return fallback.data as WorkoutSessionRow;
        return null;
      }
      if (existingError) throw existingError;
      if (existing) return existing as WorkoutSessionRow;

      const { data: created, error: createError } = await supabase
        .from("workout_sessions")
        .insert({
          assigned_workout_id: assignedWorkoutId,
        })
        .select("id, assigned_workout_id")
        .maybeSingle();
      if (createError) throw createError;
      return (created ?? null) as WorkoutSessionRow | null;
    },
  });

  const workoutSession = workoutSessionQuery.data ?? null;

  const workoutSetLogsQuery = useQuery({
    queryKey: ["workout-set-logs", workoutSession?.id],
    enabled: !!workoutSession?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select(
          "id, workout_session_id, exercise_id, set_number, reps, weight, rpe, is_completed, created_at",
        )
        .eq("workout_session_id", workoutSession?.id ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [exercises, setExercises] = useState<ExerciseState[]>([]);

  useEffect(() => {
    if (!workoutSession) return;
    const items = (workoutSetLogsQuery.data ?? []) as WorkoutSetLog[];
    const latestByKey = new Map<string, WorkoutSetLog>();
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
      const nextTime = item.created_at
        ? new Date(item.created_at).getTime()
        : 0;
      if (nextTime > existingTime) {
        latestByKey.set(key, item);
      }
    });
    const templateExercises =
      assignedExercisesQuery.data && assignedExercisesQuery.data.length > 0
        ? assignedExercisesQuery.data
        : (templateExercisesQuery.data ?? []);
    const next = templateExercises.map((row) => {
      const exerciseInfo = getSingleRelation(row.exercise);
      const name = exerciseInfo?.name ?? "Exercise";
      const count = row.sets && row.sets > 0 ? row.sets : 3;
      const sets = Array.from({ length: count }).map((_, index) => {
        const setNumber = index + 1;
        const key = `${exerciseInfo?.id ?? ""}-${setNumber}`;
        const item = latestByKey.get(key);
        return {
          id: item?.id,
          reps: typeof item?.reps === "number" ? String(item.reps) : "",
          weight: typeof item?.weight === "number" ? String(item.weight) : "",
          rpe: typeof item?.rpe === "number" ? String(item.rpe) : "",
          is_completed: item?.is_completed === true,
        };
      });
      return { name, detail: row, sets };
    });
    setExercises(next);
  }, [
    workoutSetLogsQuery.data,
    workoutSession,
    assignedExercisesQuery.data,
    templateExercisesQuery.data,
  ]);

  useEffect(() => {
    if (assignedQuery.data?.status === "completed") {
      setShowSummary(true);
    }
  }, [assignedQuery.data?.status]);

  const errors = [
    clientQuery.error,
    assignedQuery.error,
    assignedExercisesQuery.error,
    templateExercisesQuery.error,
    workoutSessionQuery.error,
    workoutSetLogsQuery.error,
  ].filter(Boolean);

  const templateExercises =
    assignedExercisesQuery.data && assignedExercisesQuery.data.length > 0
      ? assignedExercisesQuery.data
      : (templateExercisesQuery.data ?? []);
  const setLogsByExercise = useMemo(() => {
    const map = new Map<string, WorkoutSetLog[]>();
    (workoutSetLogsQuery.data ?? []).forEach((item) => {
      const log = item as WorkoutSetLog;
      if (!log.exercise_id) return;
      const existing = map.get(log.exercise_id) ?? [];
      existing.push(log);
      map.set(log.exercise_id, existing);
    });
    for (const logs of map.values()) {
      logs.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
    }
    return map;
  }, [workoutSetLogsQuery.data]);

  const exerciseNameById = useMemo(() => {
    const map = new Map<string, string>();
    templateExercises.forEach((row) => {
      const exerciseInfo = getSingleRelation(row.exercise);
      if (exerciseInfo?.id)
        map.set(exerciseInfo.id, exerciseInfo.name ?? "Exercise");
    });
    return map;
  }, [templateExercises]);

  const exerciseGroups = useMemo(() => {
    type ExerciseGroup = {
      key: string;
      supersetGroup: string | null;
      rows: TemplateExerciseRow[];
    };
    const groups: ExerciseGroup[] = [];
    templateExercises.forEach((row, index) => {
      const group = row.superset_group?.trim() || null;
      const last = groups[groups.length - 1];
      if (group && last && last.supersetGroup === group) {
        last.rows.push(row);
        return;
      }
      groups.push({
        key: group ? `superset-${group}-${index}` : `single-${row.id}`,
        supersetGroup: group,
        rows: [row],
      });
    });
    return groups;
  }, [templateExercises]);

  const handleSetChange = (
    exerciseIndex: number,
    setIndex: number,
    field: keyof SetState,
    value: string,
  ) => {
    setExercises((prev) =>
      prev.map((exercise, exIdx) => {
        if (exIdx !== exerciseIndex) return exercise;
        return {
          ...exercise,
          sets: exercise.sets.map((setItem, setIdx) =>
            setIdx === setIndex ? { ...setItem, [field]: value } : setItem,
          ),
        };
      }),
    );
  };

  const saveSet = async (exerciseIndex: number, setIndex: number) => {
    if (!workoutSession?.id) return;
    const exercise = exercises[exerciseIndex];
    const setItem = exercise.sets[setIndex];
    const repsValue = setItem.reps.trim() ? Number(setItem.reps) : null;
    const weightValue = setItem.weight.trim() ? Number(setItem.weight) : null;
    const rpeValue = setItem.rpe.trim() ? Number(setItem.rpe) : null;
    const hasValues = Boolean(repsValue || weightValue || rpeValue);
    const exerciseId = getSingleRelation(exercise.detail?.exercise)?.id;
    if (!exerciseId) return;
    const isCompleted = Boolean(repsValue || weightValue || rpeValue);

    const { data: existing, error: existingError } = await supabase
      .from("workout_set_logs")
      .select("id")
      .eq("workout_session_id", workoutSession.id)
      .eq("exercise_id", exerciseId)
      .eq("set_number", setIndex + 1)
      .maybeSingle();
    if (existingError) return;

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
      if (error) return;
    } else if (hasValues) {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .insert({
          workout_session_id: workoutSession.id,
          exercise_id: exerciseId,
          set_number: setIndex + 1,
          reps: repsValue,
          weight: weightValue,
          rpe: rpeValue,
          is_completed: isCompleted,
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
              sIdx === setIndex ? { ...set, id: data.id } : set,
            ),
          };
        }),
      );
    }
  };

  const handleSaveExercise = async (exerciseIndex: number) => {
    if (!workoutSession?.id) return;
    setSaveIndex(exerciseIndex);
    for (let idx = 0; idx < exercises[exerciseIndex].sets.length; idx += 1) {
      await saveSet(exerciseIndex, idx);
    }
    await queryClient.invalidateQueries({
      queryKey: ["workout-set-logs", workoutSession.id],
    });
    setSaveIndex(null);
  };

  const handleSaveSuperset = async (exerciseIndexes: number[]) => {
    if (!workoutSession?.id || exerciseIndexes.length === 0) return;
    setSaveIndex(-1);
    for (const exerciseIndex of exerciseIndexes) {
      for (
        let setIndex = 0;
        setIndex < exercises[exerciseIndex].sets.length;
        setIndex += 1
      ) {
        await saveSet(exerciseIndex, setIndex);
      }
    }
    await queryClient.invalidateQueries({
      queryKey: ["workout-set-logs", workoutSession.id],
    });
    setSaveIndex(null);
  };

  const handleFinish = async () => {
    if (!assignedWorkoutId) return;
    await supabase
      .from("assigned_workouts")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", assignedWorkoutId ?? "");
    setShowSummary(true);
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout", assignedWorkoutId],
    });
  };

  const summaryGroups = useMemo(() => {
    const items = (workoutSetLogsQuery.data ?? []) as WorkoutSetLog[];
    return items.reduce<Record<string, WorkoutSetLog[]>>((acc, item) => {
      const exerciseName =
        exerciseNameById.get(item.exercise_id ?? "") ?? "Exercise";
      if (!acc[exerciseName]) acc[exerciseName] = [];
      acc[exerciseName].push(item);
      return acc;
    }, {});
  }, [exerciseNameById, workoutSetLogsQuery.data]);

  const exerciseLogGroups = useMemo(() => {
    type GroupMember = {
      exercise: ExerciseState;
      exerciseIndex: number;
    };
    type ExerciseLogGroup = {
      key: string;
      supersetGroup: string | null;
      members: GroupMember[];
    };

    const groups: ExerciseLogGroup[] = [];
    exercises.forEach((exercise, exerciseIndex) => {
      const supersetGroup =
        templateExercises[exerciseIndex]?.superset_group?.trim() || null;
      const last = groups[groups.length - 1];
      if (supersetGroup && last && last.supersetGroup === supersetGroup) {
        last.members.push({ exercise, exerciseIndex });
        return;
      }
      groups.push({
        key: supersetGroup
          ? `log-superset-${supersetGroup}-${exerciseIndex}`
          : `log-single-${exerciseIndex}`,
        supersetGroup,
        members: [{ exercise, exerciseIndex }],
      });
    });
    return groups;
  }, [exercises, templateExercises]);

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Assigned workout</p>
          <h2 className="text-xl font-semibold tracking-tight">
            {workoutTemplate?.name ?? "Workout"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {workoutTemplate?.description ?? "In-progress workout log."}
          </p>
        </div>
        <Badge
          variant={
            assignedQuery.data?.status === "completed" ? "success" : "muted"
          }
        >
          {assignedQuery.data?.status === "completed"
            ? "Completed"
            : "In progress"}
        </Badge>
      </div>

      {errors.length > 0 ? (
        <div className="space-y-2">
          {errors.map((error, index) => {
            const details = getErrorDetails(error);
            return (
              <Alert
                key={`${index}-${details.message}`}
                className="border-danger/30"
              >
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {details.code}: {details.message}
                </AlertDescription>
              </Alert>
            );
          })}
        </div>
      ) : null}

      {assignedQuery.isLoading || workoutSessionQuery.isLoading ? (
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
                <div
                  key={exercise}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-semibold">{exercise}</p>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {items.map((item, index) => (
                      <div key={item.id}>
                        Set {item.set_number ?? index + 1}: {item.reps ?? "-"}{" "}
                        reps @ {item.weight ?? "-"}
                        {typeof item.rpe === "number"
                          ? ` Â· RPE ${item.rpe}`
                          : ""}
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
                {workoutTemplate?.description ??
                  "Coach-programmed exercises for this session."}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {templateExercises.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Coach hasn't added exercises yet.
                </div>
              ) : (
                exerciseGroups.map((group) => {
                  const groupIsSuperset =
                    Boolean(group.supersetGroup) && group.rows.length > 1;
                  return (
                    <div
                      key={group.key}
                      className={`rounded-lg border p-3 ${
                        groupIsSuperset
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-border bg-muted/30"
                      }`}
                    >
                      {groupIsSuperset ? (
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                          Superset {group.supersetGroup}
                        </p>
                      ) : null}
                      <div className="space-y-2">
                        {group.rows.map((exercise) => {
                          const exerciseInfo = getSingleRelation(
                            exercise.exercise,
                          );
                          const name = exerciseInfo?.name ?? "Exercise";
                          const sets = exercise.sets
                            ? `${exercise.sets} sets`
                            : "";
                          const reps = exercise.reps
                            ? `${exercise.reps} reps`
                            : "";
                          const repLine = [sets, reps]
                            .filter(Boolean)
                            .join(" x ");
                          const lastLog = setLogsByExercise.get(
                            exerciseInfo?.id ?? "",
                          )?.[0];
                          const lastWeight =
                            typeof lastLog?.weight === "number"
                              ? `Last ${lastLog.weight}`
                              : null;
                          const lastReps =
                            typeof lastLog?.reps === "number"
                              ? `Last reps ${lastLog.reps}`
                              : null;
                          const details = [
                            repLine,
                            exercise.superset_group
                              ? `Superset ${exercise.superset_group} (no rest)`
                              : null,
                            lastWeight ?? "No sets logged yet",
                            lastReps,
                            exercise.rest_seconds
                              ? `Rest ${exercise.rest_seconds}s`
                              : null,
                            exercise.tempo ? `Tempo ${exercise.tempo}` : null,
                            typeof exercise.rpe === "number"
                              ? `RPE ${exercise.rpe}`
                              : null,
                          ].filter(Boolean);
                          const video =
                            exercise.video_url ||
                            exerciseInfo?.video_url ||
                            null;

                          return (
                            <div
                              key={exercise.id}
                              className="rounded-lg border border-border/60 bg-background/30 p-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold">
                                    {name}
                                  </p>
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
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {exerciseLogGroups.map((group) => {
            const isSuperset =
              Boolean(group.supersetGroup) && group.members.length > 1;
            if (isSuperset) {
              const memberIndexes = group.members.map(
                (member) => member.exerciseIndex,
              );
              const maxSets = group.members.reduce(
                (max, member) => Math.max(max, member.exercise.sets.length),
                0,
              );
              const groupIsSaving =
                saveIndex === -1 ||
                group.members.some(
                  (member) => saveIndex === member.exerciseIndex,
                );
              return (
                <Card key={group.key}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">
                      Superset {group.supersetGroup}:{" "}
                      {group.members
                        .map((member) => member.exercise.name)
                        .join(" + ")}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={groupIsSaving}
                      onClick={() => handleSaveSuperset(memberIndexes)}
                    >
                      {groupIsSaving ? "Saving..." : "Save superset"}
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {Array.from({ length: maxSets }).map((_, setIndex) => (
                      <div
                        key={`${group.key}-set-${setIndex}`}
                        className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3"
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                          Set {setIndex + 1}
                        </div>
                        <div
                          className={`grid gap-2 ${group.members.length > 1 ? "md:grid-cols-2" : ""}`}
                        >
                          {group.members.map((member) => {
                            const setItem = member.exercise.sets[setIndex];
                            if (!setItem) {
                              return (
                                <div
                                  key={`${member.exercise.name}-empty-${setIndex}`}
                                  className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground"
                                >
                                  {member.exercise.name}: no set configured.
                                </div>
                              );
                            }
                            return (
                              <div
                                key={`${member.exercise.name}-${setIndex}`}
                                className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-[120px_1fr_1fr_1fr]"
                              >
                                <div className="text-xs font-semibold text-muted-foreground">
                                  {member.exercise.name}
                                </div>
                                <input
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                  type="number"
                                  inputMode="numeric"
                                  placeholder="Reps"
                                  value={setItem.reps}
                                  onChange={(event) =>
                                    handleSetChange(
                                      member.exerciseIndex,
                                      setIndex,
                                      "reps",
                                      event.target.value,
                                    )
                                  }
                                  onBlur={() =>
                                    saveSet(member.exerciseIndex, setIndex)
                                  }
                                />
                                <input
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="Weight"
                                  value={setItem.weight}
                                  onChange={(event) =>
                                    handleSetChange(
                                      member.exerciseIndex,
                                      setIndex,
                                      "weight",
                                      event.target.value,
                                    )
                                  }
                                  onBlur={() =>
                                    saveSet(member.exerciseIndex, setIndex)
                                  }
                                />
                                <input
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="RPE"
                                  value={setItem.rpe}
                                  onChange={(event) =>
                                    handleSetChange(
                                      member.exerciseIndex,
                                      setIndex,
                                      "rpe",
                                      event.target.value,
                                    )
                                  }
                                  onBlur={() =>
                                    saveSet(member.exerciseIndex, setIndex)
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            }

            const member = group.members[0];
            const exercise = member.exercise;
            const exerciseIndex = member.exerciseIndex;
            return (
              <Card key={group.key}>
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
                      className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-[120px_1fr_1fr_1fr]"
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
                          handleSetChange(
                            exerciseIndex,
                            setIndex,
                            "reps",
                            event.target.value,
                          )
                        }
                        onBlur={() => saveSet(exerciseIndex, setIndex)}
                      />
                      <input
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        type="number"
                        inputMode="decimal"
                        placeholder="Weight"
                        value={setItem.weight}
                        onChange={(event) =>
                          handleSetChange(
                            exerciseIndex,
                            setIndex,
                            "weight",
                            event.target.value,
                          )
                        }
                        onBlur={() => saveSet(exerciseIndex, setIndex)}
                      />
                      <input
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        type="number"
                        inputMode="decimal"
                        placeholder="RPE"
                        value={setItem.rpe}
                        onChange={(event) =>
                          handleSetChange(
                            exerciseIndex,
                            setIndex,
                            "rpe",
                            event.target.value,
                          )
                        }
                        onBlur={() => saveSet(exerciseIndex, setIndex)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
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
