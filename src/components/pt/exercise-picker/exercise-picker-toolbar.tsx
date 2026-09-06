import { Plus, RotateCcw, Search } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export function ExercisePickerToolbar({
  query,
  hasActiveFilters,
  onQueryChange,
  onClearFilters,
  onCreateExercise,
}: {
  query: string;
  hasActiveFilters: boolean;
  onQueryChange: (value: string) => void;
  onClearFilters: () => void;
  onCreateExercise: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="relative min-w-0">
        <label htmlFor="exercise-picker-search" className="sr-only">
          Search exercises
        </label>
        <Search className="app-search-icon h-4 w-4" aria-hidden="true" />
        <Input
          id="exercise-picker-search"
          className="app-search-input w-full"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search names, muscles, equipment, or notes"
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={!hasActiveFilters}
        onClick={onClearFilters}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Clear filters
      </Button>
      <Button type="button" variant="secondary" onClick={onCreateExercise}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create exercise
      </Button>
    </div>
  );
}
