import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
  StatusBanner,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { LoadingPanel } from "../../components/common/action-feedback";
import { Skeleton, StatusPill } from "../../components/ui/coachos";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import { formatRelativeTime } from "../../lib/relative-time";
import { supabase } from "../../lib/supabase";
import { buildSourceLabel } from "./home-unified";
import {
  applyUnifiedWorkoutFilter,
  canManagePersonalWorkout,
  groupUnifiedWorkoutsByState,
  isTerminalWorkoutStatus,
  preparePersonalWorkoutDraft,
  resolveWorkoutPrimaryAction,
  type PreparedPersonalWorkoutDraft,
  unifiedWorkoutFilters,
  type PersonalWorkoutExerciseDraft,
  type UnifiedWorkoutFilterKey,
  type UnifiedWorkoutRow,
} from "./workouts-unified";

type ClientProfileRow = {
  id: string;
  workspace_id: string | null;
  timezone: string | null;
  created_at: string | null;
};

type RawAssignedWorkoutRow = {
  id: string;
  status: string | null;
  day_type: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  completed_at: string | null;
  coach_note: string | null;
  program_day_index: number | null;
  workout_name?: string | null;
  workout_template:
    | {
        id: string | null;
        name: string | null;
        description: string | null;
        workout_type_tag: string | null;
        workspace_id: string | null;
      }
    | Array<{
        id: string | null;
        name: string | null;
        description: string | null;
        workout_type_tag: string | null;
        workspace_id: string | null;
      }>
    | null;
  program_template:
    | {
        id: string | null;
        name: string | null;
        workspace_id: string | null;
      }
    | Array<{
        id: string | null;
        name: string | null;
        workspace_id: string | null;
      }>
    | null;
};

type ActiveWorkoutSessionRow = {
  id: string;
  assigned_workout_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
};

type OwnedExerciseRow = {
  id: string;
  name: string;
};

type PersonalAssignedWorkoutExerciseRow = {
  id: string;
  sets: number | null;
  reps: number | null;
  sort_order: number | null;
  superset_group: string | null;
  exercise:
    | {
        id: string | null;
        name: string | null;
      }
    | Array<{
        id: string | null;
        name: string | null;
      }>
    | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const createExerciseDraft = (): PersonalWorkoutExerciseDraft => ({
  name: "",
  sets: "3",
  reps: "10",
  supersetGroup: "",
});

const getSingleRelation = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const normalizeStatus = (status: string | null | undefined) =>
  status === "pending" ? "planned" : (status ?? "planned");

const isMissingWorkoutNameColumnError = (error: unknown) => {
  const candidate = (error ?? {}) as SupabaseErrorLike;
  if (candidate.code === "42703") return true;
  const combined = `${candidate.message ?? ""} ${candidate.details ?? ""} ${candidate.hint ?? ""}`.toLowerCase();
  return combined.includes("workout_name") && combined.includes("column");
};

const formatScheduledDate = (value: string | null, todayKey: string) => {
  if (!value) return "No date";
  if (value === todayKey) return "Today";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
};

const getFilterEmptyCopy = (filter: UnifiedWorkoutFilterKey) => {
  switch (filter) {
    case "assigned":
      return {
        title: "No coach-assigned workouts yet",
        description:
          "Assigned sessions from your coach will appear here as soon as they are scheduled.",
      };
    case "personal":
      return {
        title: "No personal workouts yet",
        description:
          "Create a personal workout to keep momentum while coach-assigned sessions are pending.",
      };
    case "today":
      return {
        title: "No workouts due today",
        description:
          "You're clear for now. Check upcoming sessions or create a personal workout when ready.",
      };
    case "upcoming":
      return {
        title: "No upcoming workouts",
        description:
          "Once workouts are scheduled ahead, they will show up here.",
      };
    case "all":
    default:
      return {
        title: "No workouts yet",
        description:
          "This is your unified workouts hub for personal and coach-assigned sessions.",
      };
  }
};

export function ClientWorkoutsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSessionAuth();
  const { activeClientId } = useBootstrapAuth();
  const [activeFilter, setActiveFilter] =
    useState<UnifiedWorkoutFilterKey>("all");
  const [isCreateWorkoutOpen, setIsCreateWorkoutOpen] = useState(false);
  const [personalWorkoutName, setPersonalWorkoutName] = useState("");
  const [personalWorkoutDate, setPersonalWorkoutDate] = useState("");
  const [exerciseDrafts, setExerciseDrafts] = useState<
    PersonalWorkoutExerciseDraft[]
  >([createExerciseDraft()]);
  const [isEditWorkoutOpen, setIsEditWorkoutOpen] = useState(false);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editingWorkoutName, setEditingWorkoutName] = useState("");
  const [editingWorkoutDate, setEditingWorkoutDate] = useState("");
  const [editingExerciseDrafts, setEditingExerciseDrafts] = useState<
    PersonalWorkoutExerciseDraft[]
  >([createExerciseDraft()]);
  const [hydratedEditWorkoutId, setHydratedEditWorkoutId] = useState<
    string | null
  >(null);
  const [deleteWorkoutTarget, setDeleteWorkoutTarget] =
    useState<UnifiedWorkoutRow | null>(null);

  const clientQuery = useQuery({
    queryKey: ["client-workouts-profiles", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, workspace_id, timezone, created_at")
        .eq("user_id", session?.user?.id ?? "")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientProfileRow[];
    },
  });

  const clientProfiles = useMemo(() => clientQuery.data ?? [], [clientQuery.data]);
  const clientProfile = useMemo(
    () =>
      clientProfiles.find((row) => row.id === activeClientId) ??
      clientProfiles[0] ??
      null,
    [activeClientId, clientProfiles],
  );
  const clientId = clientProfile?.id ?? null;
  const todayKey = useMemo(
    () => getTodayInTimezone(clientProfile?.timezone ?? null),
    [clientProfile?.timezone],
  );
  const activeWorkoutDate = personalWorkoutDate || todayKey;
  const activeEditWorkoutDate = editingWorkoutDate || todayKey;
  const workoutWindowStart = useMemo(
    () => addDaysToDateString(todayKey, -45),
    [todayKey],
  );
  const workoutWindowEnd = useMemo(
    () => addDaysToDateString(todayKey, 60),
    [todayKey],
  );

  const workoutsQuery = useQuery({
    queryKey: [
      "client-workouts-unified",
      clientId,
      workoutWindowStart,
      workoutWindowEnd,
    ],
    enabled: !!clientId,
    queryFn: async () => {
      const baseSelect =
        "id, status, day_type, scheduled_date, created_at, completed_at, coach_note, program_day_index, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, description, workout_type_tag, workspace_id), program_template:program_templates!assigned_workouts_program_id_fkey(id, name, workspace_id)";

      const withWorkoutName = await supabase
        .from("assigned_workouts")
        .select(
          "id, status, day_type, scheduled_date, created_at, completed_at, coach_note, workout_name, program_day_index, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, description, workout_type_tag, workspace_id), program_template:program_templates!assigned_workouts_program_id_fkey(id, name, workspace_id)",
        )
        .eq("client_id", clientId ?? "")
        .gte("scheduled_date", workoutWindowStart)
        .lte("scheduled_date", workoutWindowEnd)
        .order("scheduled_date", { ascending: true });

      if (!withWorkoutName.error) {
        return (withWorkoutName.data ?? []) as RawAssignedWorkoutRow[];
      }

      if (!isMissingWorkoutNameColumnError(withWorkoutName.error)) {
        throw withWorkoutName.error;
      }

      const withoutWorkoutName = await supabase
        .from("assigned_workouts")
        .select(baseSelect)
        .eq("client_id", clientId ?? "")
        .gte("scheduled_date", workoutWindowStart)
        .lte("scheduled_date", workoutWindowEnd)
        .order("scheduled_date", { ascending: true });

      if (withoutWorkoutName.error) {
        throw withoutWorkoutName.error;
      }

      return (withoutWorkoutName.data ?? []) as RawAssignedWorkoutRow[];
    },
  });

  const activeSessionsQuery = useQuery({
    queryKey: ["client-workouts-active-sessions", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id, assigned_workout_id, started_at, completed_at, created_at")
        .eq("client_id", clientId ?? "")
        .is("completed_at", null)
        .not("assigned_workout_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ActiveWorkoutSessionRow[];
    },
  });

  const activeSessionByWorkout = useMemo(() => {
    const map = new Map<string, ActiveWorkoutSessionRow>();
    (activeSessionsQuery.data ?? []).forEach((sessionRow) => {
      if (!sessionRow.assigned_workout_id) return;
      if (!map.has(sessionRow.assigned_workout_id)) {
        map.set(sessionRow.assigned_workout_id, sessionRow);
      }
    });
    return map;
  }, [activeSessionsQuery.data]);

  const sourceWorkspaceIds = useMemo(() => {
    const ids = new Set<string>();
    (workoutsQuery.data ?? []).forEach((row) => {
      const template = getSingleRelation(row.workout_template);
      const program = getSingleRelation(row.program_template);
      const workspaceId = template?.workspace_id ?? program?.workspace_id ?? null;
      if (workspaceId) ids.add(workspaceId);
    });
    return Array.from(ids);
  }, [workoutsQuery.data]);

  const sourceWorkspacesQuery = useQuery({
    queryKey: ["client-workouts-source-workspaces", sourceWorkspaceIds.join(",")],
    enabled: sourceWorkspaceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name")
        .in("id", sourceWorkspaceIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const workspaceNameById = useMemo(
    () =>
      Object.fromEntries(
        (sourceWorkspacesQuery.data ?? []).map((row) => [row.id, row.name]),
      ) as Record<string, string>,
    [sourceWorkspacesQuery.data],
  );

  const workouts = useMemo<UnifiedWorkoutRow[]>(() => {
    return (workoutsQuery.data ?? []).map((row) => {
      const workoutTemplate = getSingleRelation(row.workout_template);
      const programTemplate = getSingleRelation(row.program_template);
      const sourceWorkspaceId =
        workoutTemplate?.workspace_id ?? programTemplate?.workspace_id ?? null;

      const sourceLabel = buildSourceLabel({
        workspaceId: sourceWorkspaceId,
        workspaceName: sourceWorkspaceId
          ? workspaceNameById[sourceWorkspaceId] ?? null
          : null,
      });

      return {
        id: row.id,
        status: normalizeStatus(row.status),
        dayType: row.day_type,
        scheduledDate: row.scheduled_date,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        sourceWorkspaceId,
        sourceLabel,
        sourceKind: sourceWorkspaceId ? "assigned" : "personal",
        workoutName:
          workoutTemplate?.name ??
          row.workout_name?.trim() ??
          (row.day_type === "rest" ? "Rest day" : "Workout"),
        workoutTypeTag: workoutTemplate?.workout_type_tag ?? null,
        coachNote: row.coach_note,
        programName: programTemplate?.name ?? null,
        programDayIndex: row.program_day_index,
        hasActiveSession: activeSessionByWorkout.has(row.id),
      } satisfies UnifiedWorkoutRow;
    });
  }, [activeSessionByWorkout, workoutsQuery.data, workspaceNameById]);

  const editingWorkout = useMemo(
    () => workouts.find((row) => row.id === editingWorkoutId) ?? null,
    [editingWorkoutId, workouts],
  );

  const editWorkoutExercisesQuery = useQuery({
    queryKey: ["client-personal-workout-edit-exercises", editingWorkoutId],
    enabled: isEditWorkoutOpen && !!editingWorkoutId,
    queryFn: async () => {
      if (!editingWorkoutId) return [];
      const { data, error } = await supabase
        .from("assigned_workout_exercises")
        .select(
          "id, sets, reps, sort_order, superset_group, exercise:exercises(id, name)",
        )
        .eq("assigned_workout_id", editingWorkoutId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PersonalAssignedWorkoutExerciseRow[];
    },
  });

  const filteredWorkouts = useMemo(
    () => applyUnifiedWorkoutFilter(workouts, activeFilter, todayKey),
    [activeFilter, todayKey, workouts],
  );

  const sections = useMemo(
    () => groupUnifiedWorkoutsByState(filteredWorkouts, todayKey),
    [filteredWorkouts, todayKey],
  );

  const resetPersonalWorkoutForm = () => {
    setPersonalWorkoutName("");
    setPersonalWorkoutDate(todayKey);
    setExerciseDrafts([createExerciseDraft()]);
  };

  const resetEditWorkoutForm = () => {
    setEditingWorkoutId(null);
    setEditingWorkoutName("");
    setEditingWorkoutDate(todayKey);
    setEditingExerciseDrafts([createExerciseDraft()]);
    setHydratedEditWorkoutId(null);
  };

  useEffect(() => {
    if (!isEditWorkoutOpen || !editingWorkoutId || !editingWorkout) return;
    if (hydratedEditWorkoutId === editingWorkoutId) return;
    if (editWorkoutExercisesQuery.isLoading) return;

    const hydratedDrafts = (editWorkoutExercisesQuery.data ?? [])
      .map((row) => {
        const exerciseRelation = getSingleRelation(row.exercise);
        const name = exerciseRelation?.name?.trim() ?? "";
        if (!name) return null;
        return {
          name,
          sets: String(row.sets ?? 3),
          reps: row.reps !== null && row.reps !== undefined ? String(row.reps) : "",
          supersetGroup: row.superset_group?.trim().toUpperCase() ?? "",
        } satisfies PersonalWorkoutExerciseDraft;
      })
      .filter((row): row is PersonalWorkoutExerciseDraft => Boolean(row));

    setEditingWorkoutName(editingWorkout.workoutName);
    setEditingWorkoutDate(editingWorkout.scheduledDate ?? todayKey);
    setEditingExerciseDrafts(
      hydratedDrafts.length > 0 ? hydratedDrafts : [createExerciseDraft()],
    );
    setHydratedEditWorkoutId(editingWorkoutId);
  }, [
    editWorkoutExercisesQuery.data,
    editWorkoutExercisesQuery.isLoading,
    editingWorkout,
    editingWorkoutId,
    hydratedEditWorkoutId,
    isEditWorkoutOpen,
    todayKey,
  ]);

  const resolveOwnedExerciseIds = async (
    preparedDraft: PreparedPersonalWorkoutDraft,
  ) => {
    if (!session?.user?.id) {
      throw new Error("Client profile not ready.");
    }

    const { data: ownedExercises, error: ownedExercisesError } = await supabase
      .from("exercises")
      .select("id, name")
      .eq("owner_user_id", session.user.id)
      .is("workspace_id", null);
    if (ownedExercisesError) {
      throw ownedExercisesError;
    }

    const ownedExerciseByName = new Map(
      ((ownedExercises ?? []) as OwnedExerciseRow[]).map((row) => [
        row.name.trim().toLowerCase(),
        row.id,
      ]),
    );

    const exerciseIdsByName = new Map<string, string>();
    for (const exercise of preparedDraft.exercises) {
      const key = exercise.name.toLowerCase();
      const existingId = ownedExerciseByName.get(key);
      if (existingId) {
        exerciseIdsByName.set(key, existingId);
        continue;
      }

      const { data: insertedExercise, error: insertedExerciseError } =
        await supabase
          .from("exercises")
          .insert({
            owner_user_id: session.user.id,
            workspace_id: null,
            name: exercise.name,
            source: "manual",
          })
          .select("id")
          .maybeSingle();

      if (!insertedExerciseError && insertedExercise?.id) {
        exerciseIdsByName.set(key, insertedExercise.id);
        continue;
      }

      if (insertedExerciseError?.code === "23505") {
        const { data: duplicateExercise, error: duplicateLookupError } =
          await supabase
            .from("exercises")
            .select("id")
            .eq("owner_user_id", session.user.id)
            .is("workspace_id", null)
            .ilike("name", exercise.name)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (duplicateLookupError) throw duplicateLookupError;
        if (!duplicateExercise?.id) {
          throw new Error("Couldn't resolve exercise creation conflict.");
        }
        exerciseIdsByName.set(key, duplicateExercise.id);
        continue;
      }

      throw insertedExerciseError ?? new Error("Couldn't create exercise.");
    }

    return exerciseIdsByName;
  };

  const createPersonalWorkoutMutation = useMutation({
    mutationFn: async () => {
      if (!clientId || !session?.user?.id) {
        throw new Error("Client profile not ready.");
      }

      let assignedWorkoutId: string | null = null;
      try {
        const preparedDraft = preparePersonalWorkoutDraft({
          workoutName: personalWorkoutName,
          scheduledDate: activeWorkoutDate,
          exerciseDrafts,
        });
        const exerciseIdsByName = await resolveOwnedExerciseIds(preparedDraft);

        const withWorkoutNameInsert = await supabase
          .from("assigned_workouts")
          .insert({
            client_id: clientId,
            scheduled_date: preparedDraft.scheduledDate,
            status: "planned",
            day_type: "workout",
            workout_name: preparedDraft.workoutName,
          })
          .select("id")
          .maybeSingle();

        let assignedWorkout = withWorkoutNameInsert.data;
        let assignedWorkoutError = withWorkoutNameInsert.error;

        if (
          assignedWorkoutError &&
          isMissingWorkoutNameColumnError(assignedWorkoutError)
        ) {
          const fallbackInsert = await supabase
            .from("assigned_workouts")
            .insert({
              client_id: clientId,
              scheduled_date: preparedDraft.scheduledDate,
              status: "planned",
              day_type: "workout",
            })
            .select("id")
            .maybeSingle();
          assignedWorkout = fallbackInsert.data;
          assignedWorkoutError = fallbackInsert.error;
        }

        if (assignedWorkoutError || !assignedWorkout?.id) {
          throw assignedWorkoutError ?? new Error("Unable to create workout.");
        }
        assignedWorkoutId = assignedWorkout.id;

        const assignedExerciseInserts = preparedDraft.exercises.map((exercise) => {
          const exerciseId = exerciseIdsByName.get(exercise.name.toLowerCase());
          if (!exerciseId) {
            throw new Error(`Missing exercise reference for ${exercise.name}.`);
          }
          return {
            assigned_workout_id: assignedWorkout.id,
            exercise_id: exerciseId,
            sort_order: exercise.sortOrder,
            sets: exercise.sets,
            reps: exercise.reps,
            superset_group: exercise.supersetGroup,
            rest_seconds: exercise.supersetGroup ? 0 : null,
          };
        });

        const { error: assignedExerciseError } = await supabase
          .from("assigned_workout_exercises")
          .insert(assignedExerciseInserts);
        if (assignedExerciseError) {
          throw assignedExerciseError;
        }

        return assignedWorkout.id;
      } catch (error) {
        if (assignedWorkoutId) {
          const cleanupDelete = await supabase
            .from("assigned_workouts")
            .delete()
            .eq("id", assignedWorkoutId);

          if (!cleanupDelete.error) {
            throw error;
          }

          await supabase
            .from("assigned_workouts")
            .update({
              status: "skipped",
              completed_at: new Date().toISOString(),
              coach_note:
                "This personal workout creation attempt failed before exercises were attached and was closed automatically.",
            })
            .eq("id", assignedWorkoutId);
        }
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          "client-workouts-unified",
          clientId,
          workoutWindowStart,
          workoutWindowEnd,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ["assigned-workout-today", clientId, todayKey],
      });
      await queryClient.invalidateQueries({
        queryKey: ["assigned-workouts-week"],
      });
      setActiveFilter("personal");
      setIsCreateWorkoutOpen(false);
      resetPersonalWorkoutForm();
    },
  });

  const editPersonalWorkoutMutation = useMutation({
    mutationFn: async () => {
      if (!clientId || !session?.user?.id || !editingWorkoutId) {
        throw new Error("Personal workout is not ready to edit.");
      }

      const preparedDraft = preparePersonalWorkoutDraft({
        workoutName: editingWorkoutName,
        scheduledDate: activeEditWorkoutDate,
        exerciseDrafts: editingExerciseDrafts,
      });
      const exerciseIdsByName = await resolveOwnedExerciseIds(preparedDraft);

      const withWorkoutNameUpdate = await supabase
        .from("assigned_workouts")
        .update({
          scheduled_date: preparedDraft.scheduledDate,
          workout_name: preparedDraft.workoutName,
        })
        .eq("id", editingWorkoutId)
        .eq("client_id", clientId)
        .is("workout_template_id", null)
        .is("program_id", null)
        .select("id")
        .maybeSingle();

      let updatedWorkout = withWorkoutNameUpdate.data;
      let updatedWorkoutError = withWorkoutNameUpdate.error;

      if (
        updatedWorkoutError &&
        isMissingWorkoutNameColumnError(updatedWorkoutError)
      ) {
        const fallbackUpdate = await supabase
          .from("assigned_workouts")
          .update({
            scheduled_date: preparedDraft.scheduledDate,
          })
          .eq("id", editingWorkoutId)
          .eq("client_id", clientId)
          .is("workout_template_id", null)
          .is("program_id", null)
          .select("id")
          .maybeSingle();
        updatedWorkout = fallbackUpdate.data;
        updatedWorkoutError = fallbackUpdate.error;
      }

      if (updatedWorkoutError) {
        throw updatedWorkoutError;
      }
      if (!updatedWorkout?.id) {
        throw new Error("Only personal workouts can be edited.");
      }

      const { error: clearExercisesError } = await supabase
        .from("assigned_workout_exercises")
        .delete()
        .eq("assigned_workout_id", editingWorkoutId);
      if (clearExercisesError) {
        throw clearExercisesError;
      }

      const nextExerciseRows = preparedDraft.exercises.map((exercise) => {
        const exerciseId = exerciseIdsByName.get(exercise.name.toLowerCase());
        if (!exerciseId) {
          throw new Error(`Missing exercise reference for ${exercise.name}.`);
        }
        return {
          assigned_workout_id: editingWorkoutId,
          exercise_id: exerciseId,
          sort_order: exercise.sortOrder,
          sets: exercise.sets,
          reps: exercise.reps,
          superset_group: exercise.supersetGroup,
          rest_seconds: exercise.supersetGroup ? 0 : null,
        };
      });

      const { error: upsertExercisesError } = await supabase
        .from("assigned_workout_exercises")
        .insert(nextExerciseRows);
      if (upsertExercisesError) {
        throw upsertExercisesError;
      }

      return editingWorkoutId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          "client-workouts-unified",
          clientId,
          workoutWindowStart,
          workoutWindowEnd,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ["assigned-workout-today", clientId, todayKey],
      });
      await queryClient.invalidateQueries({
        queryKey: ["assigned-workouts-week"],
      });
      setIsEditWorkoutOpen(false);
      resetEditWorkoutForm();
      setActiveFilter("personal");
    },
  });

  const deletePersonalWorkoutMutation = useMutation({
    mutationFn: async (workoutId: string) => {
      if (!clientId) {
        throw new Error("Client profile not ready.");
      }
      const { data, error } = await supabase
        .from("assigned_workouts")
        .delete()
        .eq("id", workoutId)
        .eq("client_id", clientId)
        .is("workout_template_id", null)
        .is("program_id", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) {
        throw new Error("Only personal workouts can be deleted.");
      }
      return data.id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          "client-workouts-unified",
          clientId,
          workoutWindowStart,
          workoutWindowEnd,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ["assigned-workout-today", clientId, todayKey],
      });
      await queryClient.invalidateQueries({
        queryKey: ["assigned-workouts-week"],
      });
      setDeleteWorkoutTarget(null);
      setActiveFilter("personal");
    },
  });

  const updateExerciseDraft = (
    index: number,
    field: keyof PersonalWorkoutExerciseDraft,
    value: string,
  ) => {
    setExerciseDrafts((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  };

  const removeExerciseDraft = (index: number) => {
    setExerciseDrafts((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [createExerciseDraft()];
    });
  };

  const updateEditingExerciseDraft = (
    index: number,
    field: keyof PersonalWorkoutExerciseDraft,
    value: string,
  ) => {
    setEditingExerciseDrafts((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  };

  const removeEditingExerciseDraft = (index: number) => {
    setEditingExerciseDrafts((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [createExerciseDraft()];
    });
  };

  const openEditWorkoutDialog = (workout: UnifiedWorkoutRow) => {
    setEditingWorkoutId(workout.id);
    setHydratedEditWorkoutId(null);
    setIsEditWorkoutOpen(true);
  };

  const loading =
    clientQuery.isLoading || workoutsQuery.isLoading || activeSessionsQuery.isLoading;
  const hardError = clientQuery.error ?? workoutsQuery.error ?? null;
  const partialError = activeSessionsQuery.error ?? sourceWorkspacesQuery.error;
  const activeFilterLabel =
    unifiedWorkoutFilters.find((filter) => filter.key === activeFilter)?.label ??
    "All";
  const totalVisible = filteredWorkouts.length;
  const hasAnyWorkouts = workouts.length > 0;
  const emptyCopy = getFilterEmptyCopy(activeFilter);
  const createdWorkoutId = createPersonalWorkoutMutation.data;
  const editDialogReady =
    Boolean(editingWorkoutId) &&
    hydratedEditWorkoutId === editingWorkoutId &&
    !editWorkoutExercisesQuery.isLoading;

  const renderPersonalManagementActions = (workout: UnifiedWorkoutRow) => {
    if (!canManagePersonalWorkout(workout)) {
      return null;
    }

    const disableActions =
      editPersonalWorkoutMutation.isPending || deletePersonalWorkoutMutation.isPending;

    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={disableActions}
          onClick={() => openEditWorkoutDialog(workout)}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disableActions}
          onClick={() => setDeleteWorkoutTarget(workout)}
        >
          Delete
        </Button>
      </div>
    );
  };

  return (
    <div className="portal-shell">
      <PortalPageHeader
        title="Workouts"
        subtitle="One unified workouts hub across personal and coach-assigned sessions."
        stateText={`${activeFilterLabel} - ${totalVisible} in view`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                setIsCreateWorkoutOpen(true);
                if (!personalWorkoutDate) {
                  setPersonalWorkoutDate(todayKey);
                }
              }}
              disabled={!clientId}
            >
              Create workout
            </Button>
            <Button variant="secondary" onClick={() => navigate("/app/find-coach")}>
              Find a Coach
            </Button>
          </div>
        }
      />

      <Dialog
        open={isCreateWorkoutOpen}
        onOpenChange={(open) => {
          setIsCreateWorkoutOpen(open);
          if (!open && !createPersonalWorkoutMutation.isPending) {
            resetPersonalWorkoutForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create personal workout</DialogTitle>
            <DialogDescription>
              Build a personal session with a workout name and at least one
              exercise, then run it with the same workout runner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <SectionCard className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="personal-workout-name">Workout name</Label>
                <Input
                  id="personal-workout-name"
                  placeholder="Example: Personal Upper Strength"
                  value={personalWorkoutName}
                  onChange={(event) => setPersonalWorkoutName(event.target.value)}
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="personal-workout-date">Schedule date</Label>
                <Input
                  id="personal-workout-date"
                  type="date"
                  value={activeWorkoutDate}
                  onChange={(event) => setPersonalWorkoutDate(event.target.value)}
                />
              </div>
            </SectionCard>

            <SurfaceCard>
              <SurfaceCardHeader>
                <SurfaceCardTitle>Exercises</SurfaceCardTitle>
                <SurfaceCardDescription>
                  Add one or more exercises so the workout opens with a runnable
                  structure. Use the same superset label (like A) to pair
                  exercises.
                </SurfaceCardDescription>
              </SurfaceCardHeader>
              <SurfaceCardContent className="space-y-3">
                {exerciseDrafts.map((exercise, index) => (
                  <SectionCard
                    key={`exercise-draft-${index}`}
                    className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px_108px_96px_auto]"
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`exercise-name-${index}`}>Exercise name</Label>
                      <Input
                        id={`exercise-name-${index}`}
                        placeholder="Example: Goblet Squat"
                        value={exercise.name}
                        onChange={(event) =>
                          updateExerciseDraft(index, "name", event.target.value)
                        }
                        maxLength={80}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`exercise-sets-${index}`}>Sets</Label>
                      <Input
                        id={`exercise-sets-${index}`}
                        inputMode="numeric"
                        type="number"
                        min={1}
                        max={20}
                        value={exercise.sets}
                        onChange={(event) =>
                          updateExerciseDraft(index, "sets", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`exercise-reps-${index}`}>Reps</Label>
                      <Input
                        id={`exercise-reps-${index}`}
                        placeholder="8-12"
                        value={exercise.reps}
                        onChange={(event) =>
                          updateExerciseDraft(index, "reps", event.target.value)
                        }
                        maxLength={20}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`exercise-superset-${index}`}>Superset</Label>
                      <Input
                        id={`exercise-superset-${index}`}
                        placeholder="A"
                        value={exercise.supersetGroup}
                        onChange={(event) =>
                          updateExerciseDraft(
                            index,
                            "supersetGroup",
                            event.target.value,
                          )
                        }
                        maxLength={16}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => removeExerciseDraft(index)}
                        disabled={createPersonalWorkoutMutation.isPending}
                      >
                        Remove
                      </Button>
                    </div>
                  </SectionCard>
                ))}
                <Button
                  variant="secondary"
                  onClick={() =>
                    setExerciseDrafts((prev) => [...prev, createExerciseDraft()])
                  }
                  disabled={createPersonalWorkoutMutation.isPending}
                >
                  Add exercise
                </Button>
              </SurfaceCardContent>
            </SurfaceCard>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateWorkoutOpen(false);
                resetPersonalWorkoutForm();
              }}
              disabled={createPersonalWorkoutMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createPersonalWorkoutMutation.mutate()}
              disabled={!clientId || createPersonalWorkoutMutation.isPending}
            >
              {createPersonalWorkoutMutation.isPending
                ? "Creating..."
                : "Create workout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditWorkoutOpen}
        onOpenChange={(open) => {
          setIsEditWorkoutOpen(open);
          if (!open && !editPersonalWorkoutMutation.isPending) {
            resetEditWorkoutForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit personal workout</DialogTitle>
            <DialogDescription>
              Update your personal workout details while keeping the same shared
              runner/session flow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editWorkoutExercisesQuery.error ? (
              <StatusBanner
                variant="error"
                title="Couldn't load workout details"
                description={
                  editWorkoutExercisesQuery.error instanceof Error
                    ? editWorkoutExercisesQuery.error.message
                    : "Please try again."
                }
                actions={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => editWorkoutExercisesQuery.refetch()}
                  >
                    Retry
                  </Button>
                }
              />
            ) : null}

            {!editDialogReady ? (
              editWorkoutExercisesQuery.error ? null : (
                <SurfaceCard>
                  <SurfaceCardContent className="space-y-3 pt-6">
                    <LoadingPanel
                      title="Loading workout details"
                      description="Preparing your personal workout for editing."
                    />
                    <Skeleton className="h-24 w-full rounded-2xl" />
                    <Skeleton className="h-24 w-full rounded-2xl" />
                  </SurfaceCardContent>
                </SurfaceCard>
              )
            ) : (
              <>
                <SectionCard className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-workout-name">Workout name</Label>
                    <Input
                      id="edit-workout-name"
                      value={editingWorkoutName}
                      onChange={(event) => setEditingWorkoutName(event.target.value)}
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-workout-date">Schedule date</Label>
                    <Input
                      id="edit-workout-date"
                      type="date"
                      value={activeEditWorkoutDate}
                      onChange={(event) => setEditingWorkoutDate(event.target.value)}
                    />
                  </div>
                </SectionCard>

                <SurfaceCard>
                  <SurfaceCardHeader>
                    <SurfaceCardTitle>Exercises</SurfaceCardTitle>
                    <SurfaceCardDescription>
                      Keep at least one exercise so the workout remains runnable.
                      Match superset labels to keep exercises paired.
                    </SurfaceCardDescription>
                  </SurfaceCardHeader>
                  <SurfaceCardContent className="space-y-3">
                    {editingExerciseDrafts.map((exercise, index) => (
                      <SectionCard
                        key={`editing-exercise-draft-${index}`}
                        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px_108px_96px_auto]"
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`editing-exercise-name-${index}`}>
                            Exercise name
                          </Label>
                          <Input
                            id={`editing-exercise-name-${index}`}
                            value={exercise.name}
                            onChange={(event) =>
                              updateEditingExerciseDraft(
                                index,
                                "name",
                                event.target.value,
                              )
                            }
                            maxLength={80}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`editing-exercise-sets-${index}`}>Sets</Label>
                          <Input
                            id={`editing-exercise-sets-${index}`}
                            inputMode="numeric"
                            type="number"
                            min={1}
                            max={20}
                            value={exercise.sets}
                            onChange={(event) =>
                              updateEditingExerciseDraft(
                                index,
                                "sets",
                                event.target.value,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`editing-exercise-reps-${index}`}>Reps</Label>
                          <Input
                            id={`editing-exercise-reps-${index}`}
                            value={exercise.reps}
                            onChange={(event) =>
                              updateEditingExerciseDraft(
                                index,
                                "reps",
                                event.target.value,
                              )
                            }
                            maxLength={20}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`editing-exercise-superset-${index}`}>
                            Superset
                          </Label>
                          <Input
                            id={`editing-exercise-superset-${index}`}
                            placeholder="A"
                            value={exercise.supersetGroup}
                            onChange={(event) =>
                              updateEditingExerciseDraft(
                                index,
                                "supersetGroup",
                                event.target.value,
                              )
                            }
                            maxLength={16}
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            variant="ghost"
                            className="w-full"
                            disabled={editPersonalWorkoutMutation.isPending}
                            onClick={() => removeEditingExerciseDraft(index)}
                          >
                            Remove
                          </Button>
                        </div>
                      </SectionCard>
                    ))}
                    <Button
                      variant="secondary"
                      disabled={editPersonalWorkoutMutation.isPending}
                      onClick={() =>
                        setEditingExerciseDrafts((prev) => [
                          ...prev,
                          createExerciseDraft(),
                        ])
                      }
                    >
                      Add exercise
                    </Button>
                  </SurfaceCardContent>
                </SurfaceCard>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={editPersonalWorkoutMutation.isPending}
              onClick={() => {
                setIsEditWorkoutOpen(false);
                resetEditWorkoutForm();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!editDialogReady || editPersonalWorkoutMutation.isPending}
              onClick={() => editPersonalWorkoutMutation.mutate()}
            >
              {editPersonalWorkoutMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteWorkoutTarget)}
        onOpenChange={(open) => {
          if (!open && !deletePersonalWorkoutMutation.isPending) {
            setDeleteWorkoutTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete personal workout</DialogTitle>
            <DialogDescription>
              This removes the workout and any linked session data. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <SectionCard className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {deleteWorkoutTarget?.workoutName ?? "Personal workout"}
            </p>
            <p className="text-sm text-muted-foreground">
              {deleteWorkoutTarget
                ? formatScheduledDate(deleteWorkoutTarget.scheduledDate, todayKey)
                : "No date"}
            </p>
          </SectionCard>
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={deletePersonalWorkoutMutation.isPending}
              onClick={() => setDeleteWorkoutTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              disabled={
                deletePersonalWorkoutMutation.isPending || !deleteWorkoutTarget
              }
              onClick={() => {
                if (!deleteWorkoutTarget) return;
                deletePersonalWorkoutMutation.mutate(deleteWorkoutTarget.id);
              }}
            >
              {deletePersonalWorkoutMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {hardError ? (
        <EmptyStateBlock
          title="Workouts are unavailable right now"
          description={
            hardError instanceof Error
              ? hardError.message
              : "We couldn't load your workouts."
          }
          actions={
            <Button
              onClick={() => {
                clientQuery.refetch();
                workoutsQuery.refetch();
                activeSessionsQuery.refetch();
              }}
            >
              Retry
            </Button>
          }
        />
      ) : (
        <>
          {partialError ? (
            <StatusBanner
              variant="warning"
              title="Some workout details are delayed"
              description="Core workouts are visible, but session/source metadata is still loading."
              actions={
                <Button
                  variant="secondary"
                  onClick={() => {
                    activeSessionsQuery.refetch();
                    sourceWorkspacesQuery.refetch();
                  }}
                >
                  Refresh details
                </Button>
              }
            />
          ) : null}

          {createdWorkoutId ? (
            <StatusBanner
              variant="success"
              title="Personal workout created"
              description="Your workout is now in the list. Open it anytime to start the shared runner flow."
              actions={
                <Button
                  size="sm"
                  onClick={() => navigate(`/app/workout-run/${createdWorkoutId}`)}
                >
                  Start now
                </Button>
              }
            />
          ) : null}

          {createPersonalWorkoutMutation.error ? (
            <StatusBanner
              variant="error"
              title="Couldn't create personal workout"
              description={
                createPersonalWorkoutMutation.error instanceof Error
                  ? createPersonalWorkoutMutation.error.message
                  : "Please try again in a moment."
              }
            />
          ) : null}

          {editPersonalWorkoutMutation.error ? (
            <StatusBanner
              variant="error"
              title="Couldn't edit personal workout"
              description={
                editPersonalWorkoutMutation.error instanceof Error
                  ? editPersonalWorkoutMutation.error.message
                  : "Please try again in a moment."
              }
            />
          ) : null}

          {deletePersonalWorkoutMutation.error ? (
            <StatusBanner
              variant="error"
              title="Couldn't delete personal workout"
              description={
                deletePersonalWorkoutMutation.error instanceof Error
                  ? deletePersonalWorkoutMutation.error.message
                  : "Please try again in a moment."
              }
            />
          ) : null}

          <SurfaceCard>
            <SurfaceCardHeader>
              <SurfaceCardTitle>Filters</SurfaceCardTitle>
              <SurfaceCardDescription>
                Keep one workouts experience while narrowing what you want to see.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {unifiedWorkoutFilters.map((filter) => (
                  <Button
                    key={filter.key}
                    size="sm"
                    variant={activeFilter === filter.key ? "default" : "secondary"}
                    onClick={() => setActiveFilter(filter.key)}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>
              <SectionCard className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <p className="field-label">In progress</p>
                  <p className="text-xl font-semibold text-foreground">
                    {sections.inProgress.length}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="field-label">Today</p>
                  <p className="text-xl font-semibold text-foreground">
                    {sections.today.length}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="field-label">Upcoming</p>
                  <p className="text-xl font-semibold text-foreground">
                    {sections.upcoming.length}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="field-label">Recently completed</p>
                  <p className="text-xl font-semibold text-foreground">
                    {sections.recentlyCompleted.length}
                  </p>
                </div>
              </SectionCard>
            </SurfaceCardContent>
          </SurfaceCard>

          {loading ? (
            <SurfaceCard>
              <SurfaceCardContent className="space-y-3 pt-6">
                <LoadingPanel
                  title="Loading workouts"
                  description="Merging personal and assigned sessions for this account."
                />
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 w-full rounded-2xl" />
                ))}
              </SurfaceCardContent>
            </SurfaceCard>
          ) : totalVisible === 0 ? (
            <EmptyStateBlock
              title={emptyCopy.title}
              description={emptyCopy.description}
                actions={
                  <>
                    <Button
                      onClick={() => {
                        setIsCreateWorkoutOpen(true);
                        if (!personalWorkoutDate) {
                          setPersonalWorkoutDate(todayKey);
                        }
                      }}
                      disabled={!clientId}
                    >
                      Create workout
                    </Button>
                    <Button
                      variant="secondary"
                    onClick={() => navigate(hasAnyWorkouts ? "/app/home" : "/app/find-coach")}
                  >
                    {hasAnyWorkouts ? "Back to home" : "Find a Coach"}
                  </Button>
                </>
              }
            />
          ) : (
            <div className="space-y-6">
              {sections.inProgress.length > 0 ? (
                <SurfaceCard>
                  <SurfaceCardHeader>
                    <SurfaceCardTitle>In Progress</SurfaceCardTitle>
                    <SurfaceCardDescription>
                      Active sessions ready to resume.
                    </SurfaceCardDescription>
                  </SurfaceCardHeader>
                  <SurfaceCardContent className="space-y-3">
                    {sections.inProgress.map((workout) => {
                      const action = resolveWorkoutPrimaryAction(workout);
                      return (
                        <SectionCard key={workout.id} className="space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                {workout.workoutName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {workout.workoutTypeTag ?? "Workout"}
                              </p>
                            </div>
                            <StatusPill status="in_progress" />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="muted">{workout.sourceLabel}</Badge>
                            {workout.programName ? (
                              <Badge variant="muted">
                                {workout.programDayIndex
                                  ? `${workout.programName} - Day ${workout.programDayIndex}`
                                  : workout.programName}
                              </Badge>
                            ) : null}
                            <span>
                              {formatScheduledDate(workout.scheduledDate, todayKey)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => navigate(action.href)}>
                              {action.label}
                            </Button>
                            {renderPersonalManagementActions(workout)}
                          </div>
                        </SectionCard>
                      );
                    })}
                  </SurfaceCardContent>
                </SurfaceCard>
              ) : null}

              {sections.today.length > 0 ? (
                <SurfaceCard>
                  <SurfaceCardHeader>
                    <SurfaceCardTitle>Today</SurfaceCardTitle>
                    <SurfaceCardDescription>
                      Due now or overdue sessions across all workout sources.
                    </SurfaceCardDescription>
                  </SurfaceCardHeader>
                  <SurfaceCardContent className="space-y-3">
                    {sections.today.map((workout) => {
                      const action = resolveWorkoutPrimaryAction(workout);
                      const isOverdue = Boolean(
                        workout.scheduledDate &&
                          workout.scheduledDate < todayKey &&
                          !isTerminalWorkoutStatus(workout.status),
                      );
                      return (
                        <SectionCard key={workout.id} className="space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                {workout.workoutName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {workout.workoutTypeTag ?? "Workout"}
                              </p>
                            </div>
                            <StatusPill
                              status={isOverdue ? "review_needed" : workout.status}
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="muted">{workout.sourceLabel}</Badge>
                            {workout.programName ? (
                              <Badge variant="muted">
                                {workout.programDayIndex
                                  ? `${workout.programName} - Day ${workout.programDayIndex}`
                                  : workout.programName}
                              </Badge>
                            ) : (
                              <span>Standalone workout</span>
                            )}
                            <span>
                              {formatScheduledDate(workout.scheduledDate, todayKey)}
                            </span>
                          </div>
                          {workout.coachNote ? (
                            <p className="text-sm leading-6 text-muted-foreground">
                              {workout.coachNote}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => navigate(action.href)}>
                              {action.label}
                            </Button>
                            {renderPersonalManagementActions(workout)}
                          </div>
                        </SectionCard>
                      );
                    })}
                  </SurfaceCardContent>
                </SurfaceCard>
              ) : null}

              {sections.upcoming.length > 0 ? (
                <SurfaceCard>
                  <SurfaceCardHeader>
                    <SurfaceCardTitle>Upcoming</SurfaceCardTitle>
                    <SurfaceCardDescription>
                      Planned sessions scheduled ahead.
                    </SurfaceCardDescription>
                  </SurfaceCardHeader>
                  <SurfaceCardContent className="space-y-3">
                    {sections.upcoming.map((workout) => {
                      const action = resolveWorkoutPrimaryAction(workout);
                      return (
                        <SectionCard key={workout.id} className="space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                {workout.workoutName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {workout.workoutTypeTag ?? "Workout"}
                              </p>
                            </div>
                            <StatusPill status={workout.status} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="muted">{workout.sourceLabel}</Badge>
                            {workout.programName ? (
                              <Badge variant="muted">
                                {workout.programDayIndex
                                  ? `${workout.programName} - Day ${workout.programDayIndex}`
                                  : workout.programName}
                              </Badge>
                            ) : null}
                            <span>
                              {formatScheduledDate(workout.scheduledDate, todayKey)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => navigate(action.href)}
                            >
                              {action.label}
                            </Button>
                            {renderPersonalManagementActions(workout)}
                          </div>
                        </SectionCard>
                      );
                    })}
                  </SurfaceCardContent>
                </SurfaceCard>
              ) : null}

              {sections.recentlyCompleted.length > 0 ? (
                <SurfaceCard>
                  <SurfaceCardHeader>
                    <SurfaceCardTitle>Recently Completed</SurfaceCardTitle>
                    <SurfaceCardDescription>
                      Review recent sessions and summaries.
                    </SurfaceCardDescription>
                  </SurfaceCardHeader>
                  <SurfaceCardContent className="space-y-3">
                    {sections.recentlyCompleted.map((workout) => {
                      const action = resolveWorkoutPrimaryAction(workout);
                      return (
                        <SectionCard key={workout.id} className="space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                {workout.workoutName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {workout.completedAt
                                  ? `Logged ${formatRelativeTime(workout.completedAt)}`
                                  : "Marked complete"}
                              </p>
                            </div>
                            <StatusPill status={workout.status} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="muted">{workout.sourceLabel}</Badge>
                            {workout.programName ? (
                              <Badge variant="muted">
                                {workout.programDayIndex
                                  ? `${workout.programName} - Day ${workout.programDayIndex}`
                                  : workout.programName}
                              </Badge>
                            ) : null}
                            <span>
                              {formatScheduledDate(workout.scheduledDate, todayKey)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => navigate(action.href)}
                            >
                              {action.label}
                            </Button>
                            {renderPersonalManagementActions(workout)}
                          </div>
                        </SectionCard>
                      );
                    })}
                  </SurfaceCardContent>
                </SurfaceCard>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
