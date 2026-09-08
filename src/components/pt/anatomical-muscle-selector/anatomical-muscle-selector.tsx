import { useId, useState } from "react";
import { Check, List, ScanSearch } from "../../../lib/icons";
import {
  BODY_REGIONS,
  getMuscleMetadata,
  type MuscleKey,
} from "../../../lib/exercise-muscle-taxonomy";
import { cn } from "../../../lib/utils";
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
};

function AnatomyWorkspace({
  value,
  onValueChange,
  disabled,
  activeSurface,
  setActiveSurface,
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
              <div className="anatomy-selection-row">
                <SelectionContext value={value} activeSurface={activeSurface} />
              </div>
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="list" className="anatomy-list-content">
        <AccessibleMuscleList
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        />
        <div className="anatomy-selection-row">
          <SelectionContext value={value} activeSurface={activeSurface} />
        </div>
      </TabsContent>
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
  const workspaceProps = {
    value,
    onValueChange: selectMuscle,
    disabled,
    activeSurface,
    setActiveSurface,
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
      <div className="anatomy-selector-heading">
        <h3>Target muscle</h3>
      </div>
      <AnatomyWorkspace {...workspaceProps} />
    </section>
  );
}
