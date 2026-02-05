import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";

const getErrorDetails = (error: unknown) => {
  if (!error) return { code: "unknown", message: "Unknown error" };
  if (typeof error === "object") {
    const err = error as { code?: string | null; message?: string | null };
    return {
      code: err.code ?? "unknown",
      message: err.message ?? "Unknown error",
    };
  }
  return { code: "unknown", message: "Unknown error" };
};

const formatWorkoutTypeTag = (value: string | null | undefined) =>
  value && value.trim().length > 0 ? value : "Workout";

const isUuid = (value: string | undefined | null) =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );

type TemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  workout_type: string | null;
  workout_type_tag: string | null;
};

type ExerciseRow = {
  id: string;
  name: string | null;
  video_url: string | null;
};

type TemplateExerciseRow = {
  id: string;
  sort_order: number | null;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe: number | null;
  video_url: string | null;
  notes: string | null;
  exercise: ExerciseRow | null;
};

export function PtWorkoutTemplatePreviewPage() {
  const { id } = useParams();
  const templateId = isUuid(id) ? id : null;
  const navigate = useNavigate();

  const templateQuery = useQuery({
    queryKey: ["workout-template", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id, name, description, workout_type, workout_type_tag")
        .eq("id", templateId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as TemplateRow | null;
    },
  });

  const templateExercisesQuery = useQuery({
    queryKey: ["workout-template-exercises", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select(
          "id, sort_order, sets, reps, rest_seconds, tempo, rpe, video_url, notes, exercise:exercises(id,name,video_url)"
        )
        .eq("workout_template_id", templateId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateExerciseRow[];
    },
  });

  const template = templateQuery.data;
  const exercises = templateExercisesQuery.data ?? [];

  const orderedExercises = useMemo(() => {
    return [...exercises];
  }, [exercises]);

  if (!templateId) {
    if (import.meta.env.DEV && id) {
      console.warn("INVALID_TEMPLATE_ID", id);
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid template link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Template id: {id ?? "missing"}</p>
          <Button variant="secondary" onClick={() => navigate("/pt/templates/workouts")}>Back to templates</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{template?.name ?? "Workout template"}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="muted">{formatWorkoutTypeTag(template?.workout_type_tag)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(`/pt/templates/workouts/${templateId}/edit`)}>
            Edit
          </Button>
          <Button>Assign</Button>
        </div>
      </div>

      {templateQuery.isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ) : templateQuery.error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Template error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {getErrorDetails(templateQuery.error).code}: {getErrorDetails(templateQuery.error).message}
          </CardContent>
        </Card>
      ) : !template ? (
        <Card>
          <CardHeader>
            <CardTitle>Template not found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This template could not be loaded.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {template.description?.trim() || "No description."}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
          <p className="text-sm text-muted-foreground">Ordered list of movements and cues.</p>
        </CardHeader>
        <CardContent>
          {templateExercisesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : templateExercisesQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              {getErrorDetails(templateExercisesQuery.error).code}: {getErrorDetails(templateExercisesQuery.error).message}
            </div>
          ) : orderedExercises.length > 0 ? (
            <ol className="space-y-3">
              {orderedExercises.map((row, index) => {
                const videoUrl = row.video_url ?? row.exercise?.video_url ?? null;
                return (
                  <li key={row.id} className="rounded-xl border border-border/70 bg-background/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{index + 1}.</span>
                          <h3 className="text-sm font-semibold">{row.exercise?.name ?? "Exercise"}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{row.sets ?? "--"} sets</span>
                          <span>{row.reps ?? "--"} reps</span>
                          <span>Rest {row.rest_seconds ?? "--"}s</span>
                          <span>Tempo {row.tempo ?? "--"}</span>
                          <span>RPE {row.rpe ?? "--"}</span>
                        </div>
                        {row.notes ? (
                          <p className="text-xs text-muted-foreground">{row.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {videoUrl ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => window.open(videoUrl, "_blank", "noopener,noreferrer")}
                          >
                            Video
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              No exercises yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
