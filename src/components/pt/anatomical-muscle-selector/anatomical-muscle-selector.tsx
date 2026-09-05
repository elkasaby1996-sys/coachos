import { useId, useState } from "react";
import { Check, Expand, List, RotateCcw, ScanSearch } from "lucide-react";
import {
  BODY_REGIONS,
  getMuscleMetadata,
  type MuscleKey,
} from "../../../lib/exercise-muscle-taxonomy";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { AccessibleMuscleList } from "./accessible-muscle-list";
import { AnatomicalFigure } from "./anatomical-figure";
import {
  getAnatomicalRegionsForSurface,
  type AnatomySurface,
} from "./anatomy-registry";
import "./anatomical-muscle-selector.css";

export type AnatomicalMuscleSelectorProps = {
  value: MuscleKey | null;
  onValueChange: (value: MuscleKey | null) => void;
  disabled?: boolean;
  className?: string;
};

function SelectionContext({
  value,
  activeSurface,
}: {
  value: MuscleKey | null;
  activeSurface: AnatomySurface;
}) {
  const selectedMuscle = value ? getMuscleMetadata(value) : null;
  const region = BODY_REGIONS.find(
    (item) => item.key === selectedMuscle?.regionKey,
  );
  const onSurface = getAnatomicalRegionsForSurface(activeSurface).some(
    (item) => item.muscleKey === value,
  );
  return (
    <div
      className="anatomy-selection-context"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="anatomy-selection-icon" aria-hidden="true">
        {selectedMuscle ? <Check size={16} /> : <ScanSearch size={16} />}
      </span>
      <div>
        <strong>{selectedMuscle ? selectedMuscle.label : "All muscles"}</strong>
        <p>
          {selectedMuscle
            ? `${region?.label}${onSurface ? " · Selected" : ` · Selected on ${activeSurface === "front" ? "back" : "front"}`}`
            : "Choose one muscle to filter exercises."}
        </p>
      </div>
    </div>
  );
}

type AnatomyWorkspaceProps = {
  value: MuscleKey | null;
  onValueChange: (value: MuscleKey) => void;
  disabled: boolean;
  activeSurface: AnatomySurface;
  setActiveSurface: (surface: AnatomySurface) => void;
  expanded?: boolean;
  onClear: () => void;
};

function AnatomyWorkspace({
  value,
  onValueChange,
  disabled,
  activeSurface,
  setActiveSurface,
  expanded = false,
  onClear,
}: AnatomyWorkspaceProps) {
  const id = useId();
  const headingId = `${id}-${activeSurface}-heading`;
  const [view, setView] = useState("map");
  return (
    <Tabs value={view} onValueChange={setView} className="anatomy-workspace">
      <TabsList className="anatomy-view-tabs" aria-label="Anatomy display">
        <TabsTrigger value="map" disabled={disabled}>
          <ScanSearch size={15} aria-hidden="true" />
          Body map
        </TabsTrigger>
        <TabsTrigger value="list" disabled={disabled}>
          <List size={15} aria-hidden="true" />
          Muscle list
        </TabsTrigger>
      </TabsList>
      <TabsContent value="map" className="anatomy-map-content">
        <div className="anatomy-map-layout">
          {expanded ? (
            <aside
              className="anatomy-atlas-navigation"
              aria-label="Browse muscles"
            >
              <h3>Browse anatomy</h3>
              <AccessibleMuscleList
                value={value}
                onValueChange={onValueChange}
                disabled={disabled}
              />
            </aside>
          ) : null}
          <div className="anatomy-map-visual">
            <div
              className="anatomy-surface-switch"
              role="group"
              aria-label="Anatomical surface"
            >
              {(["front", "back"] as const).map((surface) => (
                <button
                  key={surface}
                  type="button"
                  disabled={disabled}
                  aria-pressed={activeSurface === surface}
                  onClick={() => setActiveSurface(surface)}
                >
                  {surface === "front" ? "Front" : "Back"}
                </button>
              ))}
            </div>
            <h3 id={headingId} className="sr-only">
              {activeSurface} anatomical muscle map
            </h3>
            <div className="anatomy-canvas">
              <div className="anatomy-figure-stage">
                <AnatomicalFigure
                  surface={activeSurface}
                  value={value}
                  onValueChange={onValueChange}
                  disabled={disabled}
                  labelledBy={headingId}
                />
              </div>
            </div>
          </div>
          {expanded ? (
            <aside
              className="anatomy-atlas-selection"
              aria-label="Selected muscle"
            >
              <h3>Selected muscle</h3>
              <SelectionContext value={value} activeSurface={activeSurface} />
              <Button
                type="button"
                variant="ghost"
                onClick={onClear}
                disabled={disabled || !value}
                aria-label="Clear selected muscle"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Clear selection
              </Button>
              <div className="anatomy-guidance">
                <h4>Explore, then select</h4>
                <p>
                  Use the body map or browse by body region. Choosing a muscle
                  updates your exercise results immediately.
                </p>
                <p>Front and back share the same selection.</p>
              </div>
            </aside>
          ) : null}
        </div>
      </TabsContent>
      <TabsContent value="list" className="anatomy-list-content">
        <AccessibleMuscleList
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        />
      </TabsContent>
      {!expanded || view === "list" ? (
        <div className="anatomy-selection-row">
          <SelectionContext value={value} activeSurface={activeSurface} />
          {expanded ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onClear}
              disabled={disabled || !value}
              aria-label="Clear selected muscle"
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}
    </Tabs>
  );
}

export function AnatomicalMuscleSelector({
  value,
  onValueChange,
  disabled = false,
  className,
}: AnatomicalMuscleSelectorProps) {
  const [activeSurface, setActiveSurface] = useState<AnatomySurface>("front");
  const selectMuscle = (muscleKey: MuscleKey) => {
    if (!disabled) onValueChange(muscleKey);
  };
  const clear = () => {
    if (!disabled) onValueChange(null);
  };
  const workspaceProps = {
    value,
    onValueChange: selectMuscle,
    disabled,
    activeSurface,
    setActiveSurface,
    onClear: clear,
  };

  return (
    <section
      className={cn(
        "anatomy-selector anatomy-theme",
        disabled && "is-disabled",
        className,
      )}
      aria-label="Anatomical muscle selector"
      aria-disabled={disabled || undefined}
    >
      <Dialog>
        <div className="anatomy-selector-heading">
          <h3>Target muscle</h3>
          <div className="anatomy-heading-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={clear}
              disabled={disabled || !value}
              aria-label="Clear selected muscle"
            >
              Clear
            </Button>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label="Expand anatomy"
                title="Expand anatomy"
              >
                <Expand size={16} aria-hidden="true" />
              </Button>
            </DialogTrigger>
          </div>
        </div>
        <AnatomyWorkspace {...workspaceProps} />
        <DialogContent
          className={cn(
            "anatomy-theme anatomy-atlas",
            disabled && "is-disabled",
          )}
        >
          <header className="anatomy-atlas-heading">
            <span className="anatomy-eyebrow">EXERCISE ANATOMY</span>
            <DialogTitle>Find your target muscle</DialogTitle>
            <DialogDescription>
              Explore the body. Choose one muscle to refine your exercises.
            </DialogDescription>
          </header>
          <AnatomyWorkspace {...workspaceProps} expanded />
        </DialogContent>
      </Dialog>
    </section>
  );
}
