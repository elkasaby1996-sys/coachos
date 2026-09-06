import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown, Dumbbell, RotateCcw, Search } from "lucide-react";
import { AnatomicalMuscleSelector } from "../anatomical-muscle-selector";
import { ProviderAnatomyFilterFields } from "../provider-anatomy-filter-fields";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select } from "../../ui/select";
import { Skeleton } from "../../ui/skeleton";
import {
  BODY_REGIONS,
  getMuscleMetadata,
  type MuscleKey,
} from "../../../lib/exercise-muscle-taxonomy";
import type {
  ExerciseBrowserItem,
  ExerciseBrowserView,
  FilteredExerciseBrowserItem,
} from "../../../lib/exercise-browser";
import { groupExerciseBrowserMatches } from "../../../lib/exercise-browser";
import type {
  ProviderAnatomyFilterState,
  ProviderBodyPartValue,
  ProviderTargetMuscleValue,
} from "../../../lib/exercise-provider-anatomy";

export function ExerciseLibraryToolbar({
  query,
  equipment,
  anatomyState,
  exerciseType,
  view,
  equipmentOptions,
  exerciseTypeOptions,
  metadataLoading,
  onQueryChange,
  onEquipmentChange,
  onBodyPartChange,
  onTargetMuscleChange,
  onProviderFilterChange,
  onViewChange,
  onClear,
  hasActiveFilters,
  action,
}: {
  query: string;
  equipment: string | null;
  anatomyState: ProviderAnatomyFilterState;
  exerciseType: string | null;
  view: ExerciseBrowserView;
  equipmentOptions: Array<{ value: string; label: string }>;
  exerciseTypeOptions: Array<{ value: string; label: string }>;
  metadataLoading: boolean;
  onQueryChange: (value: string) => void;
  onEquipmentChange: (value: string) => void;
  onBodyPartChange: (value: ProviderBodyPartValue | null) => void;
  onTargetMuscleChange: (value: ProviderTargetMuscleValue | null) => void;
  onProviderFilterChange: (field: "exerciseType", value: string) => void;
  onViewChange: (value: ExerciseBrowserView) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  action: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-3 rounded-[24px] border border-border/70 bg-card/65 p-3 shadow-card">
      <div className="min-w-0 space-y-3">
        <div className="min-w-0">
          <label
            htmlFor="exercise-library-search"
            className="mb-1.5 block text-xs font-semibold text-foreground"
          >
            Search exercises
          </label>
          <div className="relative">
            <Search className="app-search-icon h-4 w-4" aria-hidden="true" />
            <Input
              id="exercise-library-search"
              className="app-search-input w-full"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Name, muscle, equipment, or notes"
            />
          </div>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1">
          <div className="min-w-0">
            <label
              htmlFor="exercise-library-view"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Source
            </label>
            <Select
              id="exercise-library-view"
              className="w-full"
              value={view}
              aria-label="Exercise source"
              onChange={(event) =>
                onViewChange(
                  event.target.value === "provider" ? "provider" : "library",
                )
              }
            >
              <option value="library">My Library</option>
              <option value="provider">Provider Catalog</option>
            </Select>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:self-end">
            <Button
              type="button"
              variant="secondary"
              className="min-w-0 whitespace-nowrap"
              disabled={!hasActiveFilters}
              onClick={onClear}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Clear filters
            </Button>
            {action}
          </div>
        </div>
      </div>

      <div
        className="grid min-w-0 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2"
        aria-label="Exercise metadata filters"
      >
        <div className="min-w-0">
          <label
            htmlFor="exercise-library-equipment"
            className="mb-1.5 block text-xs font-semibold text-foreground"
          >
            Equipment
          </label>
          <Select
            id="exercise-library-equipment"
            className="w-full"
            value={equipment ?? ""}
            onChange={(event) => onEquipmentChange(event.target.value)}
          >
            <option value="">All equipment</option>
            {equipmentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <ProviderAnatomyFilterFields
          idPrefix="exercise-library"
          state={anatomyState}
          onBodyPartChange={onBodyPartChange}
          onTargetMuscleChange={onTargetMuscleChange}
        />
        <div className="min-w-0">
          <label
            htmlFor="exercise-library-type"
            className="mb-1.5 block text-xs font-semibold text-foreground"
          >
            Exercise type
          </label>
          <Select
            id="exercise-library-type"
            className="w-full"
            value={exerciseType ?? ""}
            disabled={metadataLoading}
            onChange={(event) =>
              onProviderFilterChange("exerciseType", event.target.value)
            }
          >
            <option value="">
              {metadataLoading ? "Loading types…" : "All exercise types"}
            </option>
            {exerciseTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}

function MuscleSelectorContent({
  muscleKey,
  onMuscleChange,
}: {
  muscleKey: MuscleKey | null;
  onMuscleChange: (value: MuscleKey | null) => void;
}) {
  return (
    <div className="min-w-0 max-w-full [&_.anatomy-view-tabs]:hidden">
      <AnatomicalMuscleSelector
        value={muscleKey}
        onValueChange={onMuscleChange}
      />
    </div>
  );
}

export function ExerciseLibraryFilterPanel(props: {
  muscleKey: MuscleKey | null;
  onMuscleChange: (value: MuscleKey | null) => void;
}) {
  const selectedLabel = props.muscleKey
    ? getMuscleMetadata(props.muscleKey).label
    : "All muscles";

  const handleMobileFilterSummaryKeyDown = (
    event: KeyboardEvent<HTMLElement>,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    const details = event.currentTarget.parentElement;
    if (details instanceof HTMLDetailsElement) details.open = !details.open;
  };

  return (
    <>
      <section className="hidden min-w-0 rounded-[26px] border border-border/70 bg-card/58 p-4 shadow-card xl:block">
        <div className="mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Filter by muscle
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Selected: {selectedLabel}
            </p>
          </div>
        </div>
        <MuscleSelectorContent {...props} />
      </section>

      <details className="exercise-library-mobile-filters group rounded-[24px] border border-border/70 bg-card/58 shadow-card xl:hidden">
        <summary
          className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
          onKeyDown={handleMobileFilterSummaryKeyDown}
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              Filter by muscle
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              Selected: {selectedLabel}
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-border/60 p-4">
          <MuscleSelectorContent {...props} />
        </div>
      </details>
    </>
  );
}

const matchLabels = {
  primary: "Primary match",
  secondary: "Secondary match",
  region: "Region match",
} as const;

const sourceLabels = {
  custom: "Custom",
  imported: "Imported",
  provider: "Provider",
} as const;

function getMuscleSummary(item: ExerciseBrowserItem) {
  const primary = item.muscleProfile.primaryMuscleKeys.map(
    (key) => getMuscleMetadata(key).label,
  );
  const secondary = item.muscleProfile.secondaryMuscleKeys.map(
    (key) => getMuscleMetadata(key).label,
  );
  const regions = item.muscleProfile.bodyRegionKeys.map(
    (key) => BODY_REGIONS.find((region) => region.key === key)?.label ?? key,
  );
  return {
    primary,
    secondary,
    fallback: primary.length || secondary.length ? [] : regions,
  };
}

export function ExerciseLibraryResultRow({
  item,
  actions,
}: {
  item: FilteredExerciseBrowserItem;
  actions: ReactNode;
}) {
  const muscles = getMuscleSummary(item);
  return (
    <article className="grid min-w-0 gap-3 rounded-[22px] border border-border/65 bg-background/38 px-4 py-3 transition-colors hover:border-border hover:bg-muted/22 md:grid-cols-[minmax(13rem,1fr)_minmax(11rem,0.72fr)_minmax(8rem,0.42fr)_auto] md:items-center md:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={`${item.name} starting position`}
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-16 w-16 shrink-0 rounded-2xl border border-border/60 bg-muted/35 object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold text-foreground sm:text-base">
              {item.name}
            </h3>
            <Badge variant={item.origin === "provider" ? "muted" : "info"}>
              {sourceLabels[item.origin]}
            </Badge>
            {item.matchReason ? (
              <Badge
                variant={item.matchReason === "primary" ? "success" : "neutral"}
              >
                {matchLabels[item.matchReason]}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-w-0 text-xs text-muted-foreground">
        <span className="mb-1 block font-semibold uppercase tracking-[0.12em] md:hidden">
          Muscles
        </span>
        {muscles.primary.length ? (
          <p className="truncate">
            <span className="font-medium text-foreground">Primary:</span>{" "}
            {muscles.primary.join(", ")}
          </p>
        ) : null}
        {muscles.secondary.length ? (
          <p className="mt-0.5 truncate">
            <span className="font-medium text-foreground">Secondary:</span>{" "}
            {muscles.secondary.join(", ")}
          </p>
        ) : null}
        {muscles.fallback.length ? (
          <p className="truncate">{muscles.fallback.join(", ")}</p>
        ) : null}
        {!muscles.primary.length &&
        !muscles.secondary.length &&
        !muscles.fallback.length ? (
          <p>Unclassified</p>
        ) : null}
      </div>

      <div className="min-w-0 text-xs text-muted-foreground">
        <span className="mb-1 block font-semibold uppercase tracking-[0.12em] md:hidden">
          Equipment
        </span>
        <span className="truncate">{item.equipment ?? "No equipment"}</span>
      </div>

      <div className="flex min-h-11 items-center gap-2 md:justify-end">
        {actions}
      </div>
    </article>
  );
}

export function ExerciseLibraryResults({
  items,
  muscleKey,
  loading,
  emptyTitle,
  emptyDescription,
  actionsForItem,
}: {
  items: FilteredExerciseBrowserItem[];
  muscleKey: MuscleKey | null;
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  actionsForItem: (item: FilteredExerciseBrowserItem) => ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-3" aria-label="Loading exercises">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-[22px]" />
        ))}
      </div>
    );
  }

  const renderEmpty = () => (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-muted/18 px-5 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-card/70 text-muted-foreground">
        <Dumbbell className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-foreground">
        {emptyTitle}
      </h3>
      <p className="mt-1 max-w-md text-sm leading-5 text-muted-foreground">
        {emptyDescription}
      </p>
    </div>
  );

  const renderRows = (rows: FilteredExerciseBrowserItem[]) => (
    <div className="space-y-2.5">
      {rows.map((item) => (
        <ExerciseLibraryResultRow
          key={item.key}
          item={item}
          actions={actionsForItem(item)}
        />
      ))}
    </div>
  );

  const groups = groupExerciseBrowserMatches(items, muscleKey);
  if (!muscleKey) {
    return groups.ungrouped.length
      ? renderRows(groups.ungrouped)
      : renderEmpty();
  }

  const muscleLabel = getMuscleMetadata(muscleKey).label;
  if (!groups.directMatches.length && !groups.relatedExercises.length) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
          No direct matches for {muscleLabel}.
        </p>
        {renderEmpty()}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="exercise-library-direct-heading">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3
            id="exercise-library-direct-heading"
            className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground"
          >
            Direct matches
          </h3>
          <span className="text-xs text-muted-foreground">
            {groups.directMatches.length}
          </span>
        </div>
        {groups.directMatches.length ? (
          renderRows(groups.directMatches)
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
              <ChevronDown
                className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <div className="border-t border-border/60 p-2">
              {renderRows(groups.relatedExercises)}
            </div>
          </details>
        ) : (
          <section aria-labelledby="exercise-library-related-heading">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3
                id="exercise-library-related-heading"
                className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground"
              >
                Related exercises
              </h3>
              <span className="text-xs text-muted-foreground">
                {groups.relatedExercises.length}
              </span>
            </div>
            {renderRows(groups.relatedExercises)}
          </section>
        )
      ) : null}
    </div>
  );
}
