import { Check } from "lucide-react";
import { DashboardCard } from "../../pt/dashboard/DashboardCard";

export type ExerciseNavItem = {
  exerciseId: string;
  name: string;
  setsCompleted: number;
  totalSets: number;
};

export function ExerciseNav({
  exercises,
  activeExerciseId,
  onSelect,
}: {
  exercises: ExerciseNavItem[];
  activeExerciseId: string | null;
  onSelect: (exerciseId: string) => void;
}) {
  return (
    <div className="hidden xl:block">
      <DashboardCard title="Exercises" subtitle="Tap to jump between movements.">
        <div className="space-y-2">
          {exercises.map((exercise) => {
            const isActive = exercise.exerciseId === activeExerciseId;
            const isDone = exercise.totalSets > 0 && exercise.setsCompleted === exercise.totalSets;
            return (
              <button
                key={exercise.exerciseId}
                type="button"
                onClick={() => onSelect(exercise.exerciseId)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                  isActive
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-transparent hover:bg-muted/40"
                } ${isDone ? "text-muted-foreground" : "text-foreground"}`}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{exercise.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {exercise.setsCompleted}/{exercise.totalSets} sets completed
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
        </div>
      </DashboardCard>
    </div>
  );
}
