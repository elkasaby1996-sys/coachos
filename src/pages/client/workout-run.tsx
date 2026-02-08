import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Skeleton } from "../../components/ui/skeleton";
import { PageContainer } from "../../components/common/page-container";
import { supabase } from "../../lib/supabase";
import { getSupabaseErrorMessage } from "../../lib/supabase-errors";
import { useAuth } from "../../lib/auth";
import {
  ActiveExercisePanel,
  type ActiveExercise,
  type SetState,
  type PreviousSetMap,
} from "../../components/client/workout-session/ActiveExercisePanel";
import {
  ExerciseNav,
  type ExerciseNavItem,
} from "../../components/client/workout-session/ExerciseNav";
import { CoachRail } from "../../components/client/workout-session/CoachRail";

type ExerciseState = ActiveExercise;

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

type WorkoutSetLogHistoryRow = {
  exercise_id: string | null;
  weight: number | null;
  reps: number | null;
};

const getErrorMessage = (error: unknown) => getSupabaseErrorMessage(error);

const isUuid = (value: string | undefined | null) =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export function ClientWorkoutRunPage() {
  const navigate = useNavigate();
  const { assignedWorkoutId } = useParams();
  const workoutId = isUuid(assignedWorkoutId) ? assignedWorkoutId : null;
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [saveIndex, setSaveIndex] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishNotes, setFinishNotes] = useState("");
  const [finishStatus, setFinishStatus] = useState<"idle" | "saving" | "error">("idle");
  const [finishError, setFinishError] = useState<string | null>(null);
  const [restTimerEnabled, setRestTimerEnabled] = useState(true);
  const [restAutoStart, setRestAutoStart] = useState(true);

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
  const workoutTemplateId = assignedWorkoutQuery.data?.workout_template?.id ?? null;

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

  const previousSessionQuery = useQuery({
    queryKey: ["workout-session-prev", clientId, workoutTemplateId, workoutSession?.id],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: sessions, error: sessionError } = await supabase
        .from("workout_sessions")
        .select("id, assigned_workout_id, completed_at")
        .eq("client_id", clientId ?? "")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(20);

      if (sessionError) throw sessionError;
      const filtered = (sessions ?? []).filter(
        (row) => row.id && row.id !== workoutSession?.id
      );
      if (filtered.length === 0) return null;

      if (!workoutTemplateId) {
        return filtered[0] as { id: string } | null;
      }

      const assignedIds = filtered
        .map((row) => row.assigned_workout_id)
        .filter((id): id is string => Boolean(id));
      if (assignedIds.length === 0) return null;

      const { data: assignments, error: assignedError } = await supabase
        .from("assigned_workouts")
        .select("id, workout_template_id")
        .in("id", assignedIds);
      if (assignedError) throw assignedError;

      const templateMap = new Map(
        (assignments ?? []).map((row) => [row.id, row.workout_template_id])
      );

      const match = filtered.find(
        (row) => row.assigned_workout_id && templateMap.get(row.assigned_workout_id) === workoutTemplateId
      );
      return (match as { id: string } | null) ?? null;
    },
  });

  const previousLogsQuery = useQuery({
    queryKey: ["workout-set-logs-prev", previousSessionQuery.data?.id],
    enabled: !!previousSessionQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select("exercise_id, set_number, reps, weight, is_completed")
        .eq("workout_session_id", previousSessionQuery.data?.id ?? "")
        .eq("is_completed", true);
      if (error) throw error;
      return (data ?? []) as WorkoutSetLogRow[];
    },
  });

  const historicalLogsQuery = useQuery({
    queryKey: ["workout-set-logs-history", clientId, workoutSession?.id],
    enabled: !!clientId,
    queryFn: async () => {
      let query = supabase
        .from("workout_set_logs")
        .select("exercise_id, weight, reps, workout_session:workout_sessions!inner(id, completed_at)")
        .eq("workout_session.client_id", clientId ?? "")
        .not("workout_session.completed_at", "is", null)
        .eq("is_completed", true);

      if (workoutSession?.id) {
        query = query.neq("workout_session_id", workoutSession.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as WorkoutSetLogHistoryRow[];
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
    const next = sourceRows.map((row, index) => {
      const exercise = "exercise" in row ? row.exercise : exerciseById.get(row.exercise_id ?? "");
      const exerciseId = exercise?.id ?? row.exercise_id ?? row.id ?? `exercise-${index}`;
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
        exerciseId,
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
    const exists = activeExerciseId
      ? exercises.some((exercise) => exercise.exerciseId === activeExerciseId)
      : false;
    if (!exists) {
      setActiveExerciseId(exercises[0].exerciseId);
    }
  }, [activeExerciseId, exercises]);

  const errors = [
    clientQuery.error,
    assignedWorkoutQuery.error,
    workoutSessionQuery.error,
    assignedExercisesQuery.error,
    exercisesQuery.error,
    templateExercisesQuery.error,
    setLogsQuery.error,
    previousSessionQuery.error,
    previousLogsQuery.error,
    historicalLogsQuery.error,
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

  const saveExerciseSets = async (exercise: ExerciseState, sessionId: string) => {
    for (let idx = 0; idx < exercise.sets.length; idx += 1) {
      const setItem = exercise.sets[idx];
      const repsValue = parseOptionalNumber(setItem.reps);
      const weightValue = parseOptionalNumber(setItem.weight);
      const rpeValue = parseOptionalNumber(setItem.rpe);
      const isCompleted = Boolean(setItem.is_completed);
      const hasValues =
        repsValue !== null ||
        weightValue !== null ||
        rpeValue !== null ||
        isCompleted;

      if (hasValues) {
        const { error } = await supabase.from("workout_set_logs").upsert(
          {
            workout_session_id: sessionId,
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
      } else {
        const { error } = await supabase
          .from("workout_set_logs")
          .delete()
          .eq("workout_session_id", sessionId)
          .eq("exercise_id", exercise.exerciseId)
          .eq("set_number", idx + 1);
        if (error) throw error;
      }
    }
  };

  const saveAllExercises = async () => {
    if (!workoutSession?.id) return;
    try {
      for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
        setSaveIndex(exerciseIndex);
        // eslint-disable-next-line no-await-in-loop
        await saveExerciseSets(exercises[exerciseIndex], workoutSession.id);
      }
      await queryClient.invalidateQueries({
        queryKey: ["workout-set-logs", workoutSession.id],
      });
    } finally {
      setSaveIndex(null);
    }
  };

  const handleSaveExercise = async (exerciseIndex: number) => {
    if (!workoutSession?.id) return;
    const exercise = exercises[exerciseIndex];
    setSaveIndex(exerciseIndex);
    setSaveError(null);

    try {
      await saveExerciseSets(exercise, workoutSession.id);
      await queryClient.invalidateQueries({
        queryKey: ["workout-set-logs", workoutSession.id],
      });
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setSaveIndex(null);
    }
  };

  const handleConfirmFinish = async () => {
    if (!workoutId || !workoutSession?.id) return;
    setFinishStatus("saving");
    setFinishError(null);
    setSaveError(null);
    const completedAt = new Date().toISOString();
    try {
      await saveAllExercises();

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
  const activeExerciseIndex = useMemo(
    () => exercises.findIndex((exercise) => exercise.exerciseId === activeExerciseId),
    [activeExerciseId, exercises]
  );
  const activeExercise =
    activeExerciseIndex >= 0 ? exercises[activeExerciseIndex] : null;
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
  const completedSetCount = useMemo(
    () => exercises.reduce((sum, exercise) => sum + exercise.sets.filter((s) => s.is_completed).length, 0),
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
  const historicalBestByExercise = useMemo(() => {
    const map = new Map<string, { bestWeight: number; bestVolume: number }>();
    (historicalLogsQuery.data ?? []).forEach((log) => {
      if (!log.exercise_id) return;
      const weight = typeof log.weight === "number" ? log.weight : 0;
      const reps = typeof log.reps === "number" ? log.reps : 0;
      const volume = weight > 0 && reps > 0 ? weight * reps : 0;
      const current = map.get(log.exercise_id) ?? { bestWeight: 0, bestVolume: 0 };
      map.set(log.exercise_id, {
        bestWeight: Math.max(current.bestWeight, weight),
        bestVolume: Math.max(current.bestVolume, volume),
      });
    });
    return map;
  }, [historicalLogsQuery.data]);
  const prSummary = useMemo(() => {
    return exercises
      .map((exercise) => {
        const bestWeightThisSession = exercise.sets.reduce((max, setItem) => {
          const weight = parseOptionalNumber(setItem.weight);
          if (weight === null) return max;
          return Math.max(max, weight);
        }, 0);
        const bestVolumeThisSession = exercise.sets.reduce((max, setItem) => {
          const weight = parseOptionalNumber(setItem.weight);
          const reps = parseOptionalNumber(setItem.reps);
          if (weight === null || reps === null) return max;
          const volume = weight * reps;
          return Math.max(max, volume);
        }, 0);
        const previousBest = historicalBestByExercise.get(exercise.exerciseId) ?? {
          bestWeight: 0,
          bestVolume: 0,
        };
        const newWeightPr =
          bestWeightThisSession > 0 && bestWeightThisSession > previousBest.bestWeight;
        const newVolumePr =
          bestVolumeThisSession > 0 && bestVolumeThisSession > previousBest.bestVolume;
        return {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.name,
          newWeightPr,
          newVolumePr,
        };
      })
      .filter((item) => item.newWeightPr || item.newVolumePr);
  }, [exercises, historicalBestByExercise]);
  const totalPrCount = useMemo(
    () =>
      prSummary.reduce(
        (sum, row) => sum + (row.newWeightPr ? 1 : 0) + (row.newVolumePr ? 1 : 0),
        0
      ),
    [prSummary]
  );
  const navItems = useMemo<ExerciseNavItem[]>(
    () =>
      exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        setsCompleted: exercise.sets.filter((setItem) => setItem.is_completed).length,
        totalSets: exercise.sets.length,
      })),
    [exercises]
  );
  const previousMap = useMemo(() => {
    const map = new Map<string, PreviousSetMap>();
    (previousLogsQuery.data ?? []).forEach((log) => {
      if (!log.exercise_id || typeof log.set_number !== "number") return;
      if (!map.has(log.exercise_id)) {
        map.set(log.exercise_id, new Map());
      }
      const exerciseMap = map.get(log.exercise_id);
      if (!exerciseMap) return;
      if (!exerciseMap.has(log.set_number)) {
        exerciseMap.set(log.set_number, {
          weight: typeof log.weight === "number" ? log.weight : null,
          reps: typeof log.reps === "number" ? log.reps : null,
        });
      }
    });
    return map;
  }, [previousLogsQuery.data]);

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
    <div className="w-full space-y-6 pb-16 md:pb-0">
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
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-3">
                <ExerciseNav
                  exercises={navItems}
                  activeExerciseId={activeExerciseId}
                  onSelect={setActiveExerciseId}
                />
              </div>
              <div className="xl:col-span-6 space-y-4">
                {!workoutSession ? (
                  <Card className="rounded-xl border-border/70 bg-card/80">
                    <CardHeader>
                      <CardTitle>Start workout</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <p>Start the session to begin logging sets.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={handleStartWorkout}>Start workout</Button>
                        <Button variant="secondary" onClick={() => navigate("/app/home")}>
                          Return home
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
                <div className="xl:hidden">
                  <label className="text-xs font-semibold text-muted-foreground">Exercise</label>
                  <select
                    className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    value={activeExerciseId ?? ""}
                    onChange={(event) => setActiveExerciseId(event.target.value)}
                  >
                    {exercises.map((exercise, index) => (
                      <option key={`${exercise.exerciseId}-${index}`} value={exercise.exerciseId}>
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
                    previousBySet={
                      previousMap.get(activeExercise.exerciseId) ?? new Map()
                    }
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
              <div className="xl:col-span-3">
                <CoachRail
                  sessionNotes={sessionNotes}
                  completedSets={completedSets}
                  totalSets={totalSets}
                  progressPct={progressPct}
                  restTimerEnabled={restTimerEnabled}
                  autoStartEnabled={restAutoStart}
                  autoStartTrigger={completedSetCount}
                  onToggleRestTimer={setRestTimerEnabled}
                  onToggleAutoStart={setRestAutoStart}
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
            <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-4">
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
                  {totalVolume > 0 ? totalVolume.toFixed(0) : "--"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">PRs</p>
                <p className="text-lg font-semibold text-foreground">{totalPrCount}</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Auto summary
              </p>
              {prSummary.length > 0 ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                  {prSummary.map((row) => {
                    const labels = [
                      row.newWeightPr ? "weight PR" : null,
                      row.newVolumePr ? "volume PR" : null,
                    ].filter(Boolean);
                    return (
                      <p key={row.exerciseId} className="text-foreground">
                        {row.exerciseName}: {labels.join(" + ")}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs">
                  No PRs this session.
                </div>
              )}
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
        <PageContainer className="flex items-center justify-between py-3">
          <div className="text-xs text-muted-foreground">
            {workoutSession ? "Ready to finish? Save and log your session." : "Start the workout to log sets."}
          </div>
          <Button
            onClick={() => setFinishOpen(true)}
            disabled={!workoutSession}
          >
            Finish workout
          </Button>
        </PageContainer>
      </div>
    </div>
  );
}

