import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown, Dumbbell, Filter, RotateCcw, Search } from "lucide-react";
import { AnatomicalMuscleSelector } from "../anatomical-muscle-selector";
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
  ExerciseBrowserClassificationFilter,
  ExerciseBrowserItem,
  ExerciseBrowserOriginFilter,
  ExerciseBrowserView,
  FilteredExerciseBrowserItem,
} from "../../../lib/exercise-browser";
import { groupExerciseBrowserMatches } from "../../../lib/exercise-browser";
import { cn } from "../../../lib/utils";

export function ExerciseLibraryToolbar({
  query,
  tag,
  view,
  onQueryChange,
  onTagChange,
  onViewChange,
  onClear,
  hasActiveFilters,
  action,
}: {
  query: string;
  tag: string | null;
  view: ExerciseBrowserView;
  onQueryChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onViewChange: (value: ExerciseBrowserView) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  action: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-3 rounded-[24px] border border-border/70 bg-card/65 p-3 shadow-card md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_minmax(11rem,0.42fr)_minmax(11rem,0.3fr)_auto]">
      <div className="relative min-w-0 md:col-span-2 xl:col-span-1">
        <label htmlFor="exercise-library-search" className="sr-only">
          Search exercises
        </label>
        <Search className="app-search-icon h-4 w-4" aria-hidden="true" />
        <Input
          id="exercise-library-search"
          className="app-search-input w-full"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search names, muscles, equipment, or notes"
        />
      </div>
      <div className="min-w-0">
        <label htmlFor="exercise-library-tag" className="sr-only">
          Filter by tag or equipment
        </label>
        <Input
          id="exercise-library-tag"
          className="w-full"
          value={tag ?? ""}
          onChange={(event) => onTagChange(event.target.value)}
          placeholder="Tag or equipment"
        />
      </div>
      <div className="min-w-0">
        <label htmlFor="exercise-library-view" className="sr-only">
          Exercise source
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
      <div className="grid min-w-0 grid-cols-2 gap-2 md:col-span-2 md:flex md:items-center xl:col-span-1">
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
  );
}

const libraryScopeOptions: Array<{
  label: string;
  origin: ExerciseBrowserOriginFilter;
  classification: ExerciseBrowserClassificationFilter;
}> = [
  { label: "All", origin: "all", classification: "all" },
  { label: "Custom", origin: "custom", classification: "all" },
  { label: "Imported", origin: "imported", classification: "all" },
  { label: "Unclassified", origin: "all", classification: "unclassified" },
];

function MuscleSelectorContent({
  muscleKey,
  origin,
  classification,
  libraryFiltersVisible,
  onMuscleChange,
  onLibraryScopeChange,
}: {
  muscleKey: MuscleKey | null;
  origin: ExerciseBrowserOriginFilter;
  classification: ExerciseBrowserClassificationFilter;
  libraryFiltersVisible: boolean;
  onMuscleChange: (value: MuscleKey | null) => void;
  onLibraryScopeChange: (
    origin: ExerciseBrowserOriginFilter,
    classification: ExerciseBrowserClassificationFilter,
  ) => void;
}) {
  return (
    <div className="space-y-4">
      {libraryFiltersVisible ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Library scope
          </p>
          <div
            className="grid grid-cols-2 gap-2"
            role="group"
            aria-label="Library scope"
          >
            {libraryScopeOptions.map((option) => {
              const selected =
                origin === option.origin &&
                classification === option.classification;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    onLibraryScopeChange(option.origin, option.classification)
                  }
                  className={cn(
                    "min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected
                      ? "border-primary/55 bg-primary/14 text-foreground shadow-[inset_0_-2px_0_oklch(var(--accent))]"
                      : "border-border/65 bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="min-w-0 max-w-full">
        <AnatomicalMuscleSelector
          value={muscleKey}
          onValueChange={onMuscleChange}
        />
      </div>
    </div>
  );
}

export function ExerciseLibraryFilterPanel(props: {
  muscleKey: MuscleKey | null;
  origin: ExerciseBrowserOriginFilter;
  classification: ExerciseBrowserClassificationFilter;
  libraryFiltersVisible: boolean;
  onMuscleChange: (value: MuscleKey | null) => void;
  onLibraryScopeChange: (
    origin: ExerciseBrowserOriginFilter,
    classification: ExerciseBrowserClassificationFilter,
  ) => void;
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
      <aside className="sticky top-5 hidden min-w-0 self-start rounded-[26px] border border-border/70 bg-card/58 p-4 shadow-card xl:block">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Filter by muscle
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Selected: {selectedLabel}
            </p>
          </div>
          <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <MuscleSelectorContent {...props} />
      </aside>

      <details className="exercise-library-mobile-filters group rounded-[24px] border border-border/70 bg-card/58 shadow-card xl:hidden">
        <summary
          className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
          onKeyDown={handleMobileFilterSummaryKeyDown}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
              <Filter className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                Filter by muscle
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Selected: {selectedLabel}
              </span>
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
          {item.tags.length ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.tags.slice(0, 3).join(" · ")}
            </p>
          ) : null}
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
