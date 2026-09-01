import { Check, CircleAlert, Plus } from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../../lib/utils";
import { getMuscleMetadata } from "../../../lib/exercise-muscle-taxonomy";
import type { FilteredExerciseBrowserItem } from "../../../lib/exercise-browser";

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

export function ExercisePickerSelectableRow({
  item,
  selected,
  disabledReason,
  onToggle,
}: {
  item: FilteredExerciseBrowserItem;
  selected: boolean;
  disabledReason: string | null;
  onToggle: () => void;
}) {
  const reasonId = `${item.key.replace(/[^a-z0-9_-]/gi, "-")}-reason`;
  const primary = item.muscleProfile.primaryMuscleKeys
    .map((key) => getMuscleMetadata(key).label)
    .join(", ");
  const secondary = item.muscleProfile.secondaryMuscleKeys
    .map((key) => getMuscleMetadata(key).label)
    .join(", ");

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-describedby={disabledReason ? reasonId : undefined}
      disabled={Boolean(disabledReason)}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle();
      }}
      data-exercise-browser-item-key={item.key}
      className={cn(
        "group grid min-h-20 w-full min-w-0 cursor-pointer gap-3 rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
        selected
          ? "border-primary/60 bg-primary/10 shadow-[inset_3px_0_0_oklch(var(--accent))]"
          : "border-border/65 bg-background/45 hover:border-border hover:bg-muted/25",
        disabledReason &&
          "cursor-not-allowed border-border/55 bg-muted/18 opacity-65",
      )}
    >
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {item.name}
          </span>
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
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {primary
            ? `Primary: ${primary}`
            : secondary
              ? `Secondary: ${secondary}`
              : "General or unclassified movement"}
          {item.equipment ? ` · ${item.equipment}` : ""}
        </span>
        {disabledReason ? (
          <span
            id={reasonId}
            className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"
          >
            <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            {disabledReason}
          </span>
        ) : null}
      </span>

      {!disabledReason ? (
        <span
          className={cn(
            "flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold",
            selected
              ? "border-primary/45 bg-primary/15 text-primary"
              : "border-border/70 bg-card/65 text-muted-foreground group-hover:text-foreground",
          )}
          aria-hidden="true"
        >
          {selected ? (
            <Check className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {selected ? "Selected" : "Select"}
        </span>
      ) : null}
    </button>
  );
}
