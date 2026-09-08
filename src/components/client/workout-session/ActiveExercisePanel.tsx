import { Film } from "lucide-react";
import { Button } from "../../ui/button";
import { DashboardCard } from "../../pt/dashboard/DashboardCard";

export type SetState = {
  id?: string;
  reps: string;
  weight: string;
  rpe: string;
  is_completed: boolean;
};

export type ActiveExercise = {
  id: string;
  exerciseId: string;
  name: string;
  supersetGroup?: string | null;
  notes: string | null;
  videoUrl: string | null;
  previousLabel: string | null;
  weightUnit: string | null;
  targets?: {
    reps: string | number | null;
    rpe: number | null;
    tempo: string | null;
    restSeconds: number | null;
  };
  sets: SetState[];
};

export type PreviousSetMap = Map<
  number,
  { weight: number | null; reps: number | null }
>;

export function ActiveExercisePanel({
  exercise,
  exerciseIndex,
  canEdit,
  isSaving,
  onSave,
  onSetChange,
  previousBySet,
}: {
  exercise: ActiveExercise;
  exerciseIndex: number;
  canEdit: boolean;
  isSaving: boolean;
  onSave: () => void;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: keyof SetState,
    value: string | boolean,
  ) => void;
  previousBySet: PreviousSetMap;
}) {
  const panelTitle = exercise.supersetGroup
    ? `Superset ${exercise.supersetGroup} - ${exercise.name}`
    : exercise.name;
  const panelSubtitle = exercise.supersetGroup
    ? `Superset ${exercise.supersetGroup}. ${exercise.notes ?? "No coach notes for this exercise."}`
    : (exercise.notes ?? "No coach notes for this exercise.");
  return (
    <DashboardCard
      title={panelTitle}
      subtitle={panelSubtitle}
      action={
        exercise.videoUrl ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(exercise.videoUrl ?? "", "_blank")}
          >
            <Film className="mr-2 h-4 w-4" />
            Watch demo
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <dl
          className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
          aria-label="Exercise targets"
        >
          <div>
            <dt className="text-muted-foreground">Sets</dt>
            <dd>{exercise.sets.length}</dd>
          </div>
          {exercise.targets?.reps != null && (
            <div>
              <dt className="text-muted-foreground">Target reps / duration</dt>
              <dd>{exercise.targets.reps}</dd>
            </div>
          )}
          {exercise.targets?.rpe != null && (
            <div>
              <dt className="text-muted-foreground">Target RPE</dt>
              <dd>{exercise.targets.rpe}</dd>
            </div>
          )}
          {exercise.targets?.tempo && (
            <div>
              <dt className="text-muted-foreground">Tempo</dt>
              <dd>{exercise.targets.tempo}</dd>
            </div>
          )}
          {exercise.targets?.restSeconds != null && (
            <div>
              <dt className="text-muted-foreground">Rest</dt>
              <dd>{exercise.targets.restSeconds} seconds</dd>
            </div>
          )}
        </dl>
        <ExerciseSetTable
          exercise={exercise}
          exerciseIndex={exerciseIndex}
          canEdit={canEdit && !isSaving}
          onSetChange={onSetChange}
          previousBySet={previousBySet}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!canEdit || isSaving}
          onClick={onSave}
        >
          {isSaving ? "Saving..." : "Save sets"}
        </Button>
      </div>
    </DashboardCard>
  );
}

function ExerciseSetTable({
  exercise,
  exerciseIndex,
  canEdit,
  onSetChange,
  previousBySet,
}: {
  exercise: ActiveExercise;
  exerciseIndex: number;
  canEdit: boolean;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: keyof SetState,
    value: string | boolean,
  ) => void;
  previousBySet: PreviousSetMap;
}) {
  const unitLabel = exercise.weightUnit ?? "kg";
  return (
    <div className="space-y-3">
      {exercise.sets.map((setItem, setIndex) => {
        const previous = previousBySet.get(setIndex + 1);
        const prefix = `${exercise.name}, set ${setIndex + 1}`;
        return (
          <fieldset
            key={`${exercise.id}-${setIndex}`}
            className="min-w-0 rounded-xl border border-border p-3"
          >
            <legend className="px-1 text-sm font-semibold">
              Set {setIndex + 1}
            </legend>
            <p className="mb-3 text-sm text-muted-foreground">
              Previous:{" "}
              {previous?.weight != null && previous.reps != null
                ? `${previous.weight} ${unitLabel} × ${previous.reps}`
                : "No previous set"}
            </p>
            <div className="grid min-w-0 grid-cols-2 gap-3">
              {(
                [
                  ["weight", `Weight (${unitLabel})`],
                  ["reps", "Reps"],
                  ["rpe", "RPE (1–10)"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="grid min-w-0 gap-1 text-sm">
                  {label}
                  <input
                    className="app-field min-h-11 w-full min-w-0 px-3 text-base"
                    type="number"
                    inputMode={field === "reps" ? "numeric" : "decimal"}
                    aria-label={`${prefix}, ${label}`}
                    min={field === "rpe" ? 1 : 0}
                    max={field === "rpe" ? 10 : undefined}
                    step={field === "reps" ? 1 : field === "rpe" ? 0.5 : "any"}
                    value={setItem[field]}
                    disabled={!canEdit}
                    onChange={(event) =>
                      onSetChange(
                        exerciseIndex,
                        setIndex,
                        field,
                        event.target.value,
                      )
                    }
                  />
                </label>
              ))}
              <label className="flex min-h-11 items-center gap-3 self-end text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  aria-label={`${prefix}, Done`}
                  checked={setItem.is_completed}
                  disabled={!canEdit}
                  onChange={(event) =>
                    onSetChange(
                      exerciseIndex,
                      setIndex,
                      "is_completed",
                      event.target.checked,
                    )
                  }
                />
                Done
              </label>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
