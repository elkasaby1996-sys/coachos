import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";
import { supabase } from "../../lib/supabase";
import { workoutTemplateExerciseQueryKeys } from "../../lib/exercise-query-contracts";

type PreviewTemplate = {
  id: string;
  name: string | null;
  description: string | null;
  workout_type_tag: string | null;
};

type Exercise = { id: string; name: string | null; video_url: string | null };
type TemplateExercise = {
  id: string;
  sort_order: number | null;
  sets: number | null;
  reps: string | null;
  superset_group: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe: number | null;
  video_url: string | null;
  notes: string | null;
  exercise: Exercise | null;
};

export function WorkoutTemplatePreviewDialog({
  template,
  onClose,
}: {
  template: PreviewTemplate | null;
  onClose: () => void;
}) {
  const templateId = template?.id ?? null;
  const exercisesQuery = useQuery({
    queryKey: workoutTemplateExerciseQueryKeys.preview(templateId),
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select(
          "id, sort_order, sets, reps, superset_group, rest_seconds, tempo, rpe, video_url, notes, exercise:exercises(id,name,video_url)",
        )
        .eq("workout_template_id", templateId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<
        Omit<TemplateExercise, "exercise"> & {
          exercise: Exercise | Exercise[] | null;
        }
      >;
      return rows.map((row) => ({
        ...row,
        exercise: Array.isArray(row.exercise)
          ? (row.exercise[0] ?? null)
          : row.exercise,
      }));
    },
  });

  return (
    <Dialog
      open={!!template}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="space-y-5 sm:max-w-[760px]">
        <DialogHeader className="pr-10">
          <DialogTitle className="break-words">
            {template?.name ?? "Workout preview"}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap break-words">
            {template?.description?.trim() || "Exercises and workout details."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {template?.workout_type_tag ? (
            <Badge variant="muted">{template.workout_type_tag}</Badge>
          ) : null}
          {exercisesQuery.isSuccess ? (
            <span className="text-sm text-muted-foreground">
              {exercisesQuery.data.length}{" "}
              {exercisesQuery.data.length === 1 ? "exercise" : "exercises"}
            </span>
          ) : null}
        </div>
        {exercisesQuery.isLoading ? (
          <div
            role="status"
            aria-label="Loading exercises"
            className="space-y-3"
          >
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : exercisesQuery.isError ? (
          <div
            role="alert"
            className="space-y-3 rounded-lg border border-destructive/30 p-4"
          >
            <p className="text-sm">
              Unable to load exercises. Please try again.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void exercisesQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : exercisesQuery.data?.length ? (
          <ol aria-label="Workout exercises" className="space-y-3">
            {exercisesQuery.data.map((row, index) => {
              const videoUrl = row.video_url || row.exercise?.video_url;
              const details = [
                ["Sets", row.sets ?? "—"],
                ["Reps", row.reps || "—"],
                [
                  "Rest",
                  row.superset_group
                    ? "No rest"
                    : row.rest_seconds !== null
                      ? `${row.rest_seconds}s`
                      : "—",
                ],
                ...(row.tempo ? [["Tempo", row.tempo]] : []),
                ...(row.rpe !== null ? [["RPE", row.rpe]] : []),
              ];
              return (
                <li key={row.id} className="ui-inset space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5 text-sm tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-semibold text-foreground">
                        {row.exercise?.name || "Exercise unavailable"}
                      </h3>
                      {row.superset_group ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Superset {row.superset_group}
                        </p>
                      ) : null}
                    </div>
                    {videoUrl && /^https?:\/\//i.test(videoUrl) ? (
                      <a
                        href={videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Video: ${row.exercise?.name || "exercise"} (opens in a new tab)`}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-[var(--ui-action)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        Video{" "}
                        <ExternalLink
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      </a>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                    {details.map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-1 break-words text-sm font-medium tabular-nums">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {row.notes?.trim() ? (
                    <p className="whitespace-pre-wrap break-words border-t border-[var(--ui-border)] pt-3 text-sm text-muted-foreground">
                      {row.notes}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="rounded-lg border border-dashed border-[var(--ui-border)] p-6 text-center text-sm text-muted-foreground">
            No exercises added to this workout yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
