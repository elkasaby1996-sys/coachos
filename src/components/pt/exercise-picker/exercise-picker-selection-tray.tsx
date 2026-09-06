import { CheckCircle2, X } from "lucide-react";
import { Button } from "../../ui/button";
import type {
  ExercisePickerSelectionEntry,
  ExercisePickerSelectionState,
} from "../../../lib/exercise-picker";

export function ExercisePickerSelectionTray({
  selection,
  submitting,
  onRemove,
  onClear,
  onCancel,
  onAddSelected,
}: {
  selection: ExercisePickerSelectionState;
  submitting: boolean;
  onRemove: (entry: ExercisePickerSelectionEntry) => void;
  onClear: () => void;
  onCancel: () => void;
  onAddSelected: () => void;
}) {
  const entries = Array.from(selection.values());

  return (
    <footer className="border-t border-border/70 bg-card/95 px-3 py-3 backdrop-blur sm:px-5">
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
              aria-live="polite"
            >
              <CheckCircle2
                className="h-4 w-4 text-primary"
                aria-hidden="true"
              />
              {entries.length} selected
            </p>
            {entries.length ? (
              <button
                type="button"
                className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onClear}
              >
                Clear selection
              </button>
            ) : null}
          </div>
          {entries.length ? (
            <div
              className="mt-2 flex max-h-16 flex-wrap gap-1.5 overflow-y-auto pr-1"
              aria-label="Selected exercises"
            >
              {entries.map((entry) => (
                <span
                  key={entry.key}
                  className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/8 py-1 pl-2.5 pr-1 text-xs text-foreground"
                >
                  <span className="max-w-44 truncate">{entry.item.name}</span>
                  <button
                    type="button"
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-primary/12 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${entry.item.name} from selection`}
                    onClick={() => onRemove(entry)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Choose saved or provider exercises. Prescription comes next.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 xl:flex xl:shrink-0">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!entries.length || submitting}
            onClick={onAddSelected}
          >
            {submitting
              ? "Adding…"
              : entries.length > 1
                ? `Add ${entries.length} selected`
                : "Add selected"}
          </Button>
        </div>
      </div>
    </footer>
  );
}
