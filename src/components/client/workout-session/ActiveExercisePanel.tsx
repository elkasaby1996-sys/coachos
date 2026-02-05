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
  notes: string | null;
  videoUrl: string | null;
  previousLabel: string | null;
  weightUnit: string | null;
  sets: SetState[];
};

export type PreviousSetMap = Map<number, { weight: number | null; reps: number | null }>;

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
    value: string | boolean
  ) => void;
  previousBySet: PreviousSetMap;
}) {
  return (
    <DashboardCard
      title={exercise.name}
      subtitle={exercise.notes ?? "No coach notes for this exercise."}
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
      <div className="space-y-3">
        <ExerciseSetTable
          exercise={exercise}
          exerciseIndex={exerciseIndex}
          canEdit={canEdit}
          onSetChange={onSetChange}
          previousBySet={previousBySet}
        />
        <Button size="sm" variant="secondary" disabled={!canEdit || isSaving} onClick={onSave}>
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
    value: string | boolean
  ) => void;
  previousBySet: PreviousSetMap;
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
        const previous = previousBySet.get(setIndex + 1);
        const previousLabel =
          previous && typeof previous.weight === "number" && typeof previous.reps === "number"
            ? `${previous.weight}${unitLabel ? ` ${unitLabel}` : ""} × ${previous.reps}`
            : "—";
        return (
          <div
            key={`${exercise.exerciseId}-${setIndex}`}
            className={`grid grid-cols-[60px_1fr_120px_100px_80px] items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0 ${
              isDone ? "opacity-60" : ""
            }`}
          >
            <span className="text-xs font-semibold text-muted-foreground">{setIndex + 1}</span>
            <span className={`text-xs text-muted-foreground ${isDone ? "line-through" : ""}`}>
              {previousLabel}
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
