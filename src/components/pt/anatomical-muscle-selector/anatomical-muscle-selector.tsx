import { useId, useState } from "react";
import { Check, List, RotateCcw, ScanSearch } from "lucide-react";
import {
  BODY_REGIONS,
  getMuscleMetadata,
  type MuscleKey,
} from "../../../lib/exercise-muscle-taxonomy";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { AccessibleMuscleList } from "./accessible-muscle-list";
import { AnatomicalFigure } from "./anatomical-figure";
import type { AnatomySurface } from "./anatomy-registry";
import "./anatomical-muscle-selector.css";

export type AnatomicalMuscleSelectorProps = {
  value: MuscleKey | null;
  onValueChange: (value: MuscleKey | null) => void;
  disabled?: boolean;
  className?: string;
};

export function AnatomicalMuscleSelector({
  value,
  onValueChange,
  disabled = false,
  className,
}: AnatomicalMuscleSelectorProps) {
  const id = useId();
  const [activeSurface, setActiveSurface] = useState<AnatomySurface>("front");
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const selectedMuscle = value ? getMuscleMetadata(value) : null;
  const selectedRegion = selectedMuscle
    ? BODY_REGIONS.find(({ key }) => key === selectedMuscle.regionKey)?.label
    : null;

  const selectMuscle = (muscleKey: MuscleKey) => {
    if (!disabled) onValueChange(muscleKey);
  };

  const headingId = `${id}-${activeSurface}-heading`;

  return (
    <section
      className={cn(
        "anatomy-selector w-full min-w-0 rounded-[26px] border border-border/70 bg-card/72 p-3 shadow-card sm:p-4",
        disabled && "is-disabled",
        className,
      )}
      aria-label="Anatomical muscle selector"
      aria-disabled={disabled}
    >
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            Filter by muscle
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Choose one canonical muscle from the atlas or list.
          </p>
        </div>
        {selectedMuscle ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={disabled}
            aria-label="Clear selected muscle"
            onClick={() => onValueChange(null)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </header>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {selectedMuscle
          ? `${selectedMuscle.label} selected.`
          : "Muscle selection cleared."}
      </div>

      <Tabs defaultValue="map" className="mt-4 min-w-0">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="map" className="gap-2">
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
            Body map
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2">
            <List className="h-4 w-4" aria-hidden="true" />
            Muscle list
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="min-w-0">
          <div
            className="anatomy-surface-switch mx-auto grid w-full max-w-64 grid-cols-2 gap-1 rounded-xl border border-border/65 bg-muted/45 p-1"
            role="group"
            aria-label="Anatomical surface"
          >
            {(["front", "back"] as const).map((surface) => (
              <button
                key={surface}
                type="button"
                aria-pressed={activeSurface === surface}
                disabled={disabled}
                onClick={() => setActiveSurface(surface)}
                className={cn(
                  "min-h-10 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium capitalize transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed",
                  activeSurface === surface
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {surface}
              </button>
            ))}
          </div>

          <div className="anatomy-canvas mt-3 min-w-0 overflow-hidden rounded-[22px] border border-border/60 bg-muted/20 px-2 pb-2 pt-3 sm:px-3">
            <div className="flex min-w-0 items-center justify-between gap-3 px-2">
              <h3
                id={headingId}
                className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground"
              >
                {activeSurface} view
              </h3>
              <span className="truncate text-xs text-muted-foreground">
                {activeLabel ?? "Select a muscle"}
              </span>
            </div>
            <div className="anatomy-figure-stage mt-1 flex min-w-0 justify-center">
              <AnatomicalFigure
                surface={activeSurface}
                value={value}
                onValueChange={selectMuscle}
                onActiveLabelChange={setActiveLabel}
                disabled={disabled}
                labelledBy={headingId}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="list" className="min-w-0">
          <p className="mb-3 text-sm leading-5 text-muted-foreground">
            Browse the same canonical muscles grouped by body region.
          </p>
          <AccessibleMuscleList
            value={value}
            onValueChange={selectMuscle}
            disabled={disabled}
          />
        </TabsContent>
      </Tabs>

      <div
        className="anatomy-selection-summary mt-3 flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border border-border/65 bg-background/45 px-3 py-2.5"
        data-selected={Boolean(selectedMuscle)}
      >
        <span
          className="anatomy-selection-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
          aria-hidden="true"
        >
          {selectedMuscle ? (
            <Check className="h-4 w-4" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {selectedMuscle ? "Selected muscle" : "Current filter"}
          </span>
          <span className="block truncate text-sm font-semibold text-foreground">
            {selectedMuscle?.label ?? "All muscles"}
          </span>
          {selectedRegion ? (
            <span className="block truncate text-xs text-muted-foreground">
              {selectedRegion}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
