import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dumbbell, MessageCircle, RotateCcw } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
  StickyActionBar,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

type TemplateExerciseRow = {
  id: string;
  sets: number | null;
  reps: number | null;
  superset_group?: string | null;
  rest_seconds?: number | null;
  tempo?: string | null;
  rpe?: number | null;
  notes?: string | null;
  exercise:
    | {
        id: string;
        name: string | null;
        muscle_group: string | null;
        equipment: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        muscle_group: string | null;
        equipment: string | null;
      }>
    | null;
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getSingleRelation = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

export function ClientWorkoutTodayPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatDateKey(today), [today]);

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
        .select(
          "id, workout_name, status, scheduled_date, completed_at, coach_note, workout_template:workout_templates(id, name, description, workout_type_tag)",
        )
        .eq("client_id", clientId)
        .eq("scheduled_date", todayKey)
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const workoutTemplate = getSingleRelation(
    (workoutQuery.data as { workout_template?: unknown } | null)?.workout_template,
  ) as
    | {
        id: string;
        name: string | null;
        description: string | null;
        workout_type_tag: string | null;
      }
    | null;

  const assignedExercisesQuery = useQuery({
    queryKey: ["assigned-workout-exercises", workoutQuery.data?.id],
    enabled: !!workoutQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workout_exercises")
        .select(
          "id, sets, reps, superset_group, rpe, tempo, notes, rest_seconds, exercise:exercises(id, name, muscle_group, equipment)",
        )
        .eq("assigned_workout_id", workoutQuery.data?.id ?? "")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateExerciseRow[];
    },
  });

  const templateExercisesQuery = useQuery({
    queryKey: ["workout-template-exercises", workoutTemplate?.id],
    enabled: !!workoutTemplate?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select(
          "id, sets, reps, superset_group, rest_seconds, tempo, rpe, notes, exercise:exercises(id, name, muscle_group, equipment)",
        )
        .eq("workout_template_id", workoutTemplate?.id ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateExerciseRow[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: "completed" | "skipped") => {
      if (!workoutQuery.data?.id) throw new Error("No workout found for today.");
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["assigned-workout-today", clientId, todayKey],
      });
      await queryClient.invalidateQueries({ queryKey: ["assigned-workouts-week"] });
    },
  });

  const startDefaultSession = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Client not found.");
      const { data, error } = await supabase
        .from("assigned_workouts")
        .insert({
          client_id: clientId,
          scheduled_date: todayKey,
          status: "planned",
          day_type: "workout",
        })
        .select("id")
        .maybeSingle();
      if (error || !data?.id) throw error ?? new Error("Unable to start session.");
      return data.id;
    },
    onSuccess: (assignedWorkoutId) => {
      queryClient.invalidateQueries({
        queryKey: ["assigned-workout-today", clientId, todayKey],
      });
      navigate(`/app/workout-run/${assignedWorkoutId}`);
    },
  });

  const refetchPage = () => {
    clientQuery.refetch();
    workoutQuery.refetch();
    assignedExercisesQuery.refetch();
    templateExercisesQuery.refetch();
  };

  const loading =
    clientQuery.isLoading ||
    workoutQuery.isLoading ||
    (!!workoutQuery.data &&
      (assignedExercisesQuery.isLoading || templateExercisesQuery.isLoading));

  const error =
    clientQuery.error ||
    workoutQuery.error ||
    assignedExercisesQuery.error ||
    templateExercisesQuery.error ||
    updateStatus.error ||
    startDefaultSession.error;

  const workout = workoutQuery.data ?? null;
  const exerciseRows =
    (assignedExercisesQuery.data ?? []).length > 0
      ? (assignedExercisesQuery.data ?? [])
      : (templateExercisesQuery.data ?? []);
  const state: "loading" | "error" | "empty" | "assigned" = loading
    ? "loading"
    : error
      ? "error"
      : workout
        ? "assigned"
        : "empty";

  return (
    <div className="portal-shell">
      <PortalPageHeader
        title="Workout Today"
        subtitle={today.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}
        stateText={
          state === "assigned" && workout?.status
            ? `Status: ${workout.status}`
            : undefined
        }
        actions={
          <Button variant="secondary" onClick={() => navigate("/app/home")}>
            Return home
          </Button>
        }
      />

      {state === "loading" ? (
        <div className="space-y-6">
          <Skeleton className="h-36 w-full rounded-[var(--radius-xl)]" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
            <Skeleton className="h-[24rem] w-full rounded-[var(--radius-xl)]" />
            <Skeleton className="h-[24rem] w-full rounded-[var(--radius-xl)]" />
          </div>
        </div>
      ) : null}

      {state === "error" ? (
        <EmptyStateBlock
          title="Workout could not be loaded"
          description={
            error instanceof Error
              ? error.message
              : "We couldn't load today's workout right now."
          }
          actions={
            <>
              <Button onClick={refetchPage}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate("/app/home")}
              >
                Return home
              </Button>
            </>
          }
        />
      ) : null}

      {state === "empty" ? (
        <EmptyStateBlock
          icon={<Dumbbell className="h-5 w-5" />}
          title="No workout assigned today"
          description="Your coach has not scheduled a session for today yet. You can check back later, message your coach, or start a fallback session now."
          actions={
            <>
              <Button
                onClick={() => startDefaultSession.mutate()}
                disabled={startDefaultSession.isPending || !clientId}
              >
                {startDefaultSession.isPending
                  ? "Starting..."
                  : "Start default session"}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(
                    `/app/messages?draft=${encodeURIComponent(
                      "I don't see a workout for today. Can you check my plan?",
                    )}`,
                  )
                }
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Message coach
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate("/app/home")}
              >
                Return home
              </Button>
            </>
          }
        />
      ) : null}

      {state === "assigned" && workout ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
            <SurfaceCard>
              <SurfaceCardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <SurfaceCardTitle>
                      {workoutTemplate?.name ?? workout.workout_name ?? "Assigned workout"}
                    </SurfaceCardTitle>
                    <SurfaceCardDescription>
                      {workoutTemplate?.description ??
                        "Your session overview for today."}
                    </SurfaceCardDescription>
                  </div>
                  <Badge
                    variant={
                      workout.status === "completed"
                        ? "success"
                        : workout.status === "skipped"
                          ? "danger"
                          : "secondary"
                    }
                  >
                    {workout.status}
                  </Badge>
                </div>
              </SurfaceCardHeader>
              <SurfaceCardContent className="space-y-4">
                <SectionCard className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="field-label">Session type</p>
                    <p className="text-sm text-foreground">
                      {workoutTemplate?.workout_type_tag ?? "Workout"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="field-label">Scheduled date</p>
                    <p className="text-sm text-foreground">{workout.scheduled_date}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="field-label">Completion</p>
                    <p className="text-sm text-foreground">
                      {workout.completed_at
                        ? new Date(workout.completed_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "Not completed yet"}
                    </p>
                  </div>
                </SectionCard>

                <SectionCard className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Exercise list
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Review the programmed exercises before you open the session.
                      </p>
                    </div>
                    <Badge variant="muted">{exerciseRows.length} items</Badge>
                  </div>

                  {exerciseRows.length > 0 ? (
                    <div className="grid gap-3">
                      {exerciseRows.map((exercise, index) => {
                        const exerciseInfo = getSingleRelation(exercise.exercise);
                        const details = [
                          exercise.sets ? `${exercise.sets} sets` : null,
                          exercise.reps ? `${exercise.reps} reps` : null,
                          exercise.rest_seconds ? `Rest ${exercise.rest_seconds}s` : null,
                          exercise.tempo ? `Tempo ${exercise.tempo}` : null,
                          typeof exercise.rpe === "number" ? `RPE ${exercise.rpe}` : null,
                        ].filter(Boolean);

                        return (
                          <SectionCard key={exercise.id} className="space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">
                                  {index + 1}. {exerciseInfo?.name ?? "Exercise"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {details.length > 0
                                    ? details.join(" • ")
                                    : "No exercise details added yet."}
                                </p>
                              </div>
                              {exercise.superset_group ? (
                                <Badge variant="secondary">
                                  Superset {exercise.superset_group}
                                </Badge>
                              ) : null}
                            </div>
                            {exercise.notes ? (
                              <p className="text-sm leading-6 text-muted-foreground">
                                {exercise.notes}
                              </p>
                            ) : null}
                          </SectionCard>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyStateBlock
                      title="Exercises are not available yet"
                      description="The workout is assigned, but the exercise list has not been attached yet."
                    />
                  )}
                </SectionCard>
              </SurfaceCardContent>
            </SurfaceCard>

            <div className="space-y-6">
              <SurfaceCard>
                <SurfaceCardHeader>
                  <SurfaceCardTitle>Session notes</SurfaceCardTitle>
                  <SurfaceCardDescription>
                    Key context for today's work.
                  </SurfaceCardDescription>
                </SurfaceCardHeader>
                <SurfaceCardContent className="space-y-4">
                  {workout.coach_note ? (
                    <SectionCard className="space-y-2">
                      <p className="field-label">Coach note</p>
                      <p className="text-sm leading-6 text-foreground">
                        {workout.coach_note}
                      </p>
                    </SectionCard>
                  ) : (
                    <EmptyStateBlock
                      title="No coach note for today"
                      description="This session does not include any extra coach instructions."
                    />
                  )}

                  <SectionCard className="space-y-3">
                    <p className="field-label">Quick actions</p>
                    <div className="grid gap-3">
                      <Button
                        onClick={() => navigate(`/app/workout-run/${workout.id}`)}
                      >
                        Open workout
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigate(
                            `/app/messages?draft=${encodeURIComponent(
                              `About today's workout: ${workoutTemplate?.name ?? workout.workout_name ?? "Assigned session"}`,
                            )}`,
                          )
                        }
                      >
                        Message coach
                      </Button>
                    </div>
                  </SectionCard>
                </SurfaceCardContent>
              </SurfaceCard>
            </div>
          </div>

          <StickyActionBar>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Ready to train?
              </p>
              <p className="text-sm text-muted-foreground">
                Open the workout to log the session, or mark the status here.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(`/app/workout-run/${workout.id}`)}>
                Open workout
              </Button>
              <Button
                variant="secondary"
                disabled={updateStatus.isPending || workout.status === "completed"}
                onClick={() => updateStatus.mutate("completed")}
              >
                {workout.status === "completed" ? "Completed" : "Mark completed"}
              </Button>
              <Button
                variant="ghost"
                disabled={updateStatus.isPending || workout.status === "skipped"}
                onClick={() => updateStatus.mutate("skipped")}
              >
                {workout.status === "skipped" ? "Skipped" : "Skip workout"}
              </Button>
            </div>
          </StickyActionBar>
        </>
      ) : null}
    </div>
  );
}
