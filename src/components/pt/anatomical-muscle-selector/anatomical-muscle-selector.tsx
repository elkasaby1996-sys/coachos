import { useId, useState } from "react";
import { List, RotateCcw, ScanSearch } from "lucide-react";
import {
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
  const selectedMuscle = value ? getMuscleMetadata(value) : null;

  const selectMuscle = (muscleKey: MuscleKey) => {
    if (!disabled) onValueChange(muscleKey);
  };

  const headingId = `${id}-${activeSurface}-heading`;

  return (
    <section
      className={cn(
        "anatomy-selector w-full min-w-0 rounded-[var(--ui-radius-card)] bg-card/72 p-3 shadow-card sm:p-4",
        disabled && "is-disabled",
        className,
      )}
      aria-label="Anatomical muscle selector"
      aria-disabled={disabled}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {selectedMuscle
          ? `${selectedMuscle.label} selected.`
          : "Muscle selection cleared."}
      </div>

      <Tabs defaultValue="map" className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <TabsList className="anatomy-view-tabs grid min-w-0 flex-1 grid-cols-2">
            <TabsTrigger value="map" className="gap-2">
              <ScanSearch className="h-4 w-4" aria-hidden="true" />
              Body map
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" aria-hidden="true" />
              Muscle list
            </TabsTrigger>
          </TabsList>
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
              <span className="hidden sm:inline">Clear</span>
            </Button>
          ) : null}
        </div>

        <TabsContent value="map" className="mt-2 min-w-0">
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

          <h3 id={headingId} className="sr-only">
            {activeSurface} anatomical muscle map
          </h3>
          <div className="anatomy-canvas mt-2 min-w-0 overflow-hidden rounded-[18px] px-1.5 py-1.5 sm:mt-[25px] sm:px-2 sm:py-[23px]">
            <div className="anatomy-figure-stage flex min-w-0 justify-center">
              <AnatomicalFigure
                surface={activeSurface}
                value={value}
                onValueChange={selectMuscle}
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
    </section>
  );
}
