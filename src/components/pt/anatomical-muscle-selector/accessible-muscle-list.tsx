import { Check } from "lucide-react";
import {
  BODY_REGIONS,
  MUSCLES,
  type MuscleKey,
} from "../../../lib/exercise-muscle-taxonomy";
import { cn } from "../../../lib/utils";

type AccessibleMuscleListProps = {
  value: MuscleKey | null;
  onValueChange: (value: MuscleKey) => void;
  disabled: boolean;
};

const muscleGroups = BODY_REGIONS.map((region) => ({
  ...region,
  muscles: MUSCLES.filter((muscle) => muscle.regionKey === region.key),
})).filter(({ muscles }) => muscles.length > 0);

export function AccessibleMuscleList({
  value,
  onValueChange,
  disabled,
}: AccessibleMuscleListProps) {
  return (
    <div
      className="grid min-w-0 gap-3 sm:grid-cols-2"
      aria-label="Canonical muscles"
    >
      {muscleGroups.map((group) => (
        <section
          key={group.key}
          className="min-w-0 rounded-2xl border border-border/60 bg-muted/18 p-2.5"
          aria-labelledby={`muscle-group-${group.key}`}
        >
          <h3
            id={`muscle-group-${group.key}`}
            className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            {group.label}
          </h3>
          <div className="space-y-1" role="group">
            {group.muscles.map((muscle) => {
              const selected = value === muscle.key;
              return (
                <button
                  key={muscle.key}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => onValueChange(muscle.key)}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
                    selected
                      ? "border-primary/55 bg-primary/12 font-semibold text-foreground shadow-[inset_3px_0_0_oklch(var(--accent))]"
                      : "border-transparent bg-background/35 text-muted-foreground hover:border-border/70 hover:bg-card/70 hover:text-foreground",
                  )}
                >
                  <span>{muscle.label}</span>
                  {selected ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-primary">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Selected
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
