import { useId } from "react";
import { Select } from "../ui/select";
import { cn } from "../../lib/utils";
import {
  BODY_REGIONS,
  MUSCLES,
  type MuscleKey,
} from "../../lib/exercise-muscle-taxonomy";
import type {
  ExerciseMuscleClassificationMode,
  ExerciseMuscleFormValue,
} from "../../lib/exercise-muscle-classification";

type ExerciseMuscleClassificationFieldsProps = {
  value: ExerciseMuscleFormValue;
  onChange: (value: ExerciseMuscleFormValue) => void;
  disabled?: boolean;
  legacyLabels?: readonly string[];
};

const modes: ReadonlyArray<{
  value: ExerciseMuscleClassificationMode;
  label: string;
  description: string;
}> = [
  {
    value: "specific",
    label: "Specific muscles",
    description: "Choose every primary and secondary muscle that applies.",
  },
  {
    value: "region",
    label: "General region",
    description: "Use a broad region without inventing a specific muscle.",
  },
  {
    value: "unclassified",
    label: "Unclassified",
    description: "Keep this exercise available without anatomy filters.",
  },
];

export function ExerciseMuscleClassificationFields({
  value,
  onChange,
  disabled = false,
  legacyLabels = [],
}: ExerciseMuscleClassificationFieldsProps) {
  const id = useId();
  const helperId = `${id}-helper`;

  const setMode = (mode: ExerciseMuscleClassificationMode) => {
    if (mode === "specific") {
      onChange({
        mode,
        primaryMuscleKeys: [],
        secondaryMuscleKeys: [],
        bodyRegionKey: null,
      });
      return;
    }
    if (mode === "region") {
      onChange({
        mode,
        primaryMuscleKeys: [],
        secondaryMuscleKeys: [],
        bodyRegionKey: value.bodyRegionKey,
      });
      return;
    }
    onChange({
      mode,
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
      bodyRegionKey: null,
    });
  };

  const togglePrimary = (key: MuscleKey, checked: boolean) => {
    const primaryMuscleKeys = checked
      ? [...value.primaryMuscleKeys, key]
      : value.primaryMuscleKeys.filter((candidate) => candidate !== key);
    onChange({
      ...value,
      primaryMuscleKeys: Array.from(new Set(primaryMuscleKeys)),
      secondaryMuscleKeys: value.secondaryMuscleKeys.filter(
        (candidate) => candidate !== key,
      ),
    });
  };

  const toggleSecondary = (key: MuscleKey, checked: boolean) => {
    if (value.primaryMuscleKeys.includes(key)) return;
    const secondaryMuscleKeys = checked
      ? [...value.secondaryMuscleKeys, key]
      : value.secondaryMuscleKeys.filter((candidate) => candidate !== key);
    onChange({
      ...value,
      secondaryMuscleKeys: Array.from(new Set(secondaryMuscleKeys)),
    });
  };

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <div>
        <legend className="text-xs font-semibold text-muted-foreground">
          Muscle classification
        </legend>
        <p
          id={helperId}
          className="mt-1 text-xs leading-5 text-muted-foreground"
        >
          Optional. Canonical classifications power future anatomy filters.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3" aria-describedby={helperId}>
        {modes.map((mode) => (
          <label
            key={mode.value}
            className={cn(
              "flex min-h-20 cursor-pointer gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
              value.mode === mode.value
                ? "border-primary bg-primary/5"
                : "border-border/70 bg-background/45 hover:bg-secondary/25",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name={`${id}-mode`}
              value={mode.value}
              checked={value.mode === mode.value}
              onChange={() => setMode(mode.value)}
              className="mt-1 h-4 w-4 shrink-0 accent-primary"
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">
                {mode.label}
              </span>
              <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                {mode.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      {value.mode === "specific" ? (
        <div className="ui-panel border border-border/70 p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] items-end gap-2 border-b border-border/60 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>Muscle</span>
            <span className="text-center">Primary</span>
            <span className="text-center">Secondary</span>
          </div>
          <div className="mt-2 space-y-3">
            {BODY_REGIONS.filter((region) => region.key !== "full_body").map(
              (region) => {
                const muscles = MUSCLES.filter(
                  (muscle) => muscle.regionKey === region.key,
                );
                if (muscles.length === 0) return null;
                return (
                  <section
                    key={region.key}
                    aria-labelledby={`${id}-${region.key}`}
                  >
                    <h4
                      id={`${id}-${region.key}`}
                      className="mb-1 text-xs font-semibold text-foreground"
                    >
                      {region.label}
                    </h4>
                    <div className="space-y-1">
                      {muscles.map((muscle) => {
                        const isPrimary = value.primaryMuscleKeys.includes(
                          muscle.key,
                        );
                        return (
                          <div
                            key={muscle.key}
                            className="grid min-h-10 grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] items-center gap-2 rounded-lg px-2 hover:bg-secondary/25"
                          >
                            <span className="text-sm text-foreground">
                              {muscle.label}
                            </span>
                            <label className="flex min-h-10 cursor-pointer items-center justify-center rounded-md focus-within:ring-2 focus-within:ring-ring">
                              <input
                                type="checkbox"
                                checked={isPrimary}
                                onChange={(event) =>
                                  togglePrimary(
                                    muscle.key,
                                    event.target.checked,
                                  )
                                }
                                className="h-4 w-4 accent-primary"
                                aria-label={`${muscle.label}, primary`}
                              />
                            </label>
                            <label
                              className={cn(
                                "flex min-h-10 items-center justify-center rounded-md focus-within:ring-2 focus-within:ring-ring",
                                isPrimary
                                  ? "cursor-not-allowed opacity-40"
                                  : "cursor-pointer",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={value.secondaryMuscleKeys.includes(
                                  muscle.key,
                                )}
                                disabled={isPrimary}
                                onChange={(event) =>
                                  toggleSecondary(
                                    muscle.key,
                                    event.target.checked,
                                  )
                                }
                                className="h-4 w-4 accent-primary"
                                aria-label={`${muscle.label}, secondary`}
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              },
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Selecting a muscle as Primary automatically removes it from
            Secondary. Body regions are derived from all selected muscles.
          </p>
        </div>
      ) : null}

      {value.mode === "region" ? (
        <div className="ui-panel space-y-2 border border-border/70 p-3">
          <label
            htmlFor={`${id}-region`}
            className="text-xs font-semibold text-muted-foreground"
          >
            General body region
          </label>
          <Select
            id={`${id}-region`}
            value={value.bodyRegionKey ?? ""}
            onChange={(event) =>
              onChange({
                mode: "region",
                primaryMuscleKeys: [],
                secondaryMuscleKeys: [],
                bodyRegionKey:
                  BODY_REGIONS.find(
                    (region) => region.key === event.target.value,
                  )?.key ?? null,
              })
            }
          >
            <option value="">Choose a region</option>
            {BODY_REGIONS.map((region) => (
              <option key={region.key} value={region.key}>
                {region.label}
              </option>
            ))}
          </Select>
          <p className="text-xs leading-5 text-muted-foreground">
            Broad regions such as Back, Arms, Upper legs, and Full body do not
            fabricate a specific muscle.
          </p>
        </div>
      ) : null}

      {value.mode === "unclassified" ? (
        <p className="rounded-xl border border-border/70 bg-secondary/20 p-3 text-xs leading-5 text-muted-foreground">
          This exercise remains available under All and Unclassified, but it
          will not appear under a specific anatomical muscle filter.
        </p>
      ) : null}

      {legacyLabels.length > 0 ? (
        <div className="ui-panel border border-border/70 p-3">
          <p className="text-xs font-semibold text-foreground">
            Existing legacy anatomy (reference only)
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {legacyLabels.join(", ")}. These labels are not used to guess or
            overwrite the canonical classification.
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
