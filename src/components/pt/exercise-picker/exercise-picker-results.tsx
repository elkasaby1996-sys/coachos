import { ChevronDown, Dumbbell } from "lucide-react";
import { Skeleton } from "../../ui/skeleton";
import {
  groupExerciseBrowserMatches,
  type FilteredExerciseBrowserItem,
} from "../../../lib/exercise-browser";
import {
  getMuscleMetadata,
  type MuscleKey,
} from "../../../lib/exercise-muscle-taxonomy";
import { ExercisePickerSelectableRow } from "./exercise-picker-selectable-row";

type ExercisePickerResultsProps = {
  items: FilteredExerciseBrowserItem[];
  muscleKey: MuscleKey | null;
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  isSelected: (item: FilteredExerciseBrowserItem) => boolean;
  disabledReasonForItem: (item: FilteredExerciseBrowserItem) => string | null;
  onToggle: (item: FilteredExerciseBrowserItem) => void;
};

function ResultRows({
  items,
  isSelected,
  disabledReasonForItem,
  onToggle,
}: Pick<
  ExercisePickerResultsProps,
  "isSelected" | "disabledReasonForItem" | "onToggle"
> & {
  items: FilteredExerciseBrowserItem[];
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ExercisePickerSelectableRow
          key={item.key}
          item={item}
          selected={isSelected(item)}
          disabledReason={disabledReasonForItem(item)}
          onToggle={() => onToggle(item)}
        />
      ))}
    </div>
  );
}

function EmptyResults({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 px-5 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card/70 text-muted-foreground">
        <Dumbbell className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function ExercisePickerResults(props: ExercisePickerResultsProps) {
  if (props.loading) {
    return (
      <div className="space-y-2" aria-label="Loading exercises">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const groups = groupExerciseBrowserMatches(props.items, props.muscleKey);
  const rowProps = {
    isSelected: props.isSelected,
    disabledReasonForItem: props.disabledReasonForItem,
    onToggle: props.onToggle,
  };
  if (!props.muscleKey) {
    return groups.ungrouped.length ? (
      <ResultRows items={groups.ungrouped} {...rowProps} />
    ) : (
      <EmptyResults
        title={props.emptyTitle}
        description={props.emptyDescription}
      />
    );
  }

  const muscleLabel = getMuscleMetadata(props.muscleKey).label;
  if (!groups.directMatches.length && !groups.relatedExercises.length) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
          No direct matches for {muscleLabel}.
        </p>
        <EmptyResults
          title={props.emptyTitle}
          description={props.emptyDescription}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="exercise-picker-direct-heading">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3
            id="exercise-picker-direct-heading"
            className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground"
          >
            Direct matches
          </h3>
          <span className="text-xs text-muted-foreground">
            {groups.directMatches.length}
          </span>
        </div>
        {groups.directMatches.length ? (
          <ResultRows items={groups.directMatches} {...rowProps} />
        ) : (
          <p className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
            No direct matches for {muscleLabel}.
          </p>
        )}
      </section>

      {groups.relatedExercises.length ? (
        groups.directMatches.length ? (
          <details className="group rounded-2xl border border-border/65 bg-muted/15">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
                Related exercises · {groups.relatedExercises.length}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="border-t border-border/60 p-2">
              <ResultRows items={groups.relatedExercises} {...rowProps} />
            </div>
          </details>
        ) : (
          <section aria-labelledby="exercise-picker-related-heading">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3
                id="exercise-picker-related-heading"
                className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground"
              >
                Related exercises
              </h3>
              <span className="text-xs text-muted-foreground">
                {groups.relatedExercises.length}
              </span>
            </div>
            <ResultRows items={groups.relatedExercises} {...rowProps} />
          </section>
        )
      ) : null}
    </div>
  );
}
