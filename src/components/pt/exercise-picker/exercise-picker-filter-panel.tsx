import type { KeyboardEvent } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { AnatomicalMuscleSelector } from "../anatomical-muscle-selector";
import { ProviderAnatomyFilterFields } from "../provider-anatomy-filter-fields";
import {
  getMuscleMetadata,
  type MuscleKey,
} from "../../../lib/exercise-muscle-taxonomy";
import type {
  ProviderAnatomyFilterState,
  ProviderBodyPartValue,
  ProviderTargetMuscleValue,
} from "../../../lib/exercise-provider-anatomy";

type ExercisePickerFilterPanelProps = {
  anatomyState: ProviderAnatomyFilterState;
  providerFiltersVisible: boolean;
  onMuscleChange: (value: MuscleKey | null) => void;
  onBodyPartChange: (value: ProviderBodyPartValue | null) => void;
  onTargetMuscleChange: (value: ProviderTargetMuscleValue | null) => void;
};

function FilterContent({
  anatomyState,
  providerFiltersVisible,
  onMuscleChange,
  onBodyPartChange,
  onTargetMuscleChange,
}: ExercisePickerFilterPanelProps) {
  return (
    <div className="min-w-0 max-w-full space-y-3">
      {providerFiltersVisible ? (
        <div className="ui-panel grid min-w-0 gap-3 border border-border/70 p-3 sm:grid-cols-2 lg:grid-cols-1">
          <ProviderAnatomyFilterFields
            idPrefix="exercise-picker"
            state={anatomyState}
            onBodyPartChange={onBodyPartChange}
            onTargetMuscleChange={onTargetMuscleChange}
          />
        </div>
      ) : null}
      <AnatomicalMuscleSelector
        value={anatomyState.canonicalMuscleKey}
        onValueChange={onMuscleChange}
      />
    </div>
  );
}

export function ExercisePickerFilterPanel(
  props: ExercisePickerFilterPanelProps,
) {
  const selectedLabel = props.anatomyState.canonicalMuscleKey
    ? getMuscleMetadata(props.anatomyState.canonicalMuscleKey).label
    : "All muscles";

  const handleSummaryKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const details = event.currentTarget.parentElement;
    if (details instanceof HTMLDetailsElement) details.open = !details.open;
  };

  return (
    <>
      <aside className="hidden min-w-0 self-start lg:block">
        <FilterContent {...props} />
      </aside>

      <details className="ui-panel exercise-picker-mobile-filters group border border-border/70 lg:hidden">
        <summary
          className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
          onKeyDown={handleSummaryKeyDown}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
              <Filter className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                Anatomy filters
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {selectedLabel}
              </span>
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-border/60 p-3">
          <FilterContent {...props} />
        </div>
      </details>
    </>
  );
}
