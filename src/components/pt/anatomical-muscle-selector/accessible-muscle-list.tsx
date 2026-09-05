import { useId, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "../../ui/input";
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
  const id = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const filteredGroups = muscleGroups
    .map((group) => ({
      ...group,
      muscles: group.muscles.filter((muscle) =>
        `${muscle.label} ${group.label}`.toLocaleLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.muscles.length);
  return (
    <div className="anatomy-muscle-list" aria-label="Muscles by body region">
      <label className="anatomy-search" htmlFor={`${id}-search`}>
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search muscles</span>
        <Input
          id={`${id}-search`}
          type="search"
          placeholder="Search muscles…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled}
        />
      </label>
      <div className="anatomy-muscle-groups">
        {filteredGroups.map((group) => {
          const selectedMuscle = group.muscles.find(
            (muscle) => muscle.key === value,
          );
          const groupLabelId = `${id}-muscle-group-${group.key}`;

          return (
            <details
              key={`${group.key}-${Boolean(needle)}`}
              open={needle ? true : undefined}
              className="anatomy-region group"
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 hover:bg-card/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span
                    id={groupLabelId}
                    className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    {group.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {selectedMuscle?.label ??
                      `${group.muscles.length} ${group.muscles.length === 1 ? "muscle" : "muscles"}`}
                  </span>
                </span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div
                className="space-y-1 border-t border-border/50 p-2.5"
                role="group"
                aria-labelledby={groupLabelId}
              >
                {group.muscles.map((muscle) => {
                  const selected = value === muscle.key;
                  return (
                    <button
                      key={muscle.key}
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => {
                        if (!disabled) onValueChange(muscle.key);
                      }}
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
            </details>
          );
        })}
        {!filteredGroups.length ? (
          <p className="anatomy-empty" role="status">
            No muscles match “{query}”. Try a muscle or body region.
          </p>
        ) : null}
      </div>
    </div>
  );
}
