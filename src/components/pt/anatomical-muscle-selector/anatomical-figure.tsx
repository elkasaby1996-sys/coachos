import { useState, type KeyboardEvent } from "react";
import type { MuscleKey } from "../../../lib/exercise-muscle-taxonomy";
import {
  getAnatomicalRegionsForSurface,
  type AnatomicalRegionDefinition,
  type AnatomyShape,
  type AnatomySurface,
} from "./anatomy-registry";
import { getAnatomicalSurfaceArtwork } from "./artwork/artwork-adapter";

type AnatomicalFigureProps = {
  surface: AnatomySurface;
  value: MuscleKey | null;
  onValueChange: (value: MuscleKey) => void;
  disabled: boolean;
  labelledBy: string;
};

type InteractionState = {
  regionId: string;
  mode: "hover" | "focus";
} | null;

function AnatomyShapeElement({
  shape,
  className,
}: {
  shape: AnatomyShape;
  className: string;
}) {
  const style = shape.strokeWidth
    ? { strokeWidth: shape.strokeWidth }
    : undefined;

  if (shape.kind === "ellipse") {
    return (
      <ellipse
        cx={shape.cx}
        cy={shape.cy}
        rx={shape.rx}
        ry={shape.ry}
        className={className}
        style={style}
        aria-hidden="true"
      />
    );
  }

  return (
    <path d={shape.d} className={className} style={style} aria-hidden="true" />
  );
}

function BaseSilhouette({ surface }: { surface: AnatomySurface }) {
  const artwork = getAnatomicalSurfaceArtwork(surface);

  return (
    <g aria-hidden="true" className="anatomy-base-layer">
      <path className="anatomy-body" d={artwork.outlinePath} />
      <g className="anatomy-passive-muscles">
        {artwork.passiveShapes.map((shape) => (
          <AnatomyShapeElement
            key={shape.id}
            shape={shape}
            className="anatomy-passive-shape"
          />
        ))}
      </g>
    </g>
  );
}

function VisibleMuscleArtwork({
  definitions,
  value,
  interaction,
}: {
  definitions: readonly AnatomicalRegionDefinition[];
  value: MuscleKey | null;
  interaction: InteractionState;
}) {
  return (
    <g aria-hidden="true" className="anatomy-art-layer">
      {definitions.map((definition) => (
        <g
          key={`art-${definition.id}`}
          className="anatomy-art-muscle"
          data-selected={value === definition.muscleKey}
          data-interaction={
            interaction?.regionId === definition.id ? interaction.mode : "none"
          }
        >
          {definition.artwork.map((shape) => (
            <AnatomyShapeElement
              key={shape.id}
              shape={shape}
              className="anatomy-art-shape"
            />
          ))}
        </g>
      ))}
    </g>
  );
}

function AnatomicalHitRegion({
  definition,
  selected,
  disabled,
  onActivate,
  onInteractionChange,
}: {
  definition: AnatomicalRegionDefinition;
  selected: boolean;
  disabled: boolean;
  onActivate: (definition: AnatomicalRegionDefinition) => void;
  onInteractionChange: (interaction: InteractionState) => void;
}) {
  const activate = () => {
    if (!disabled) onActivate(definition);
  };

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  };

  const setActive = (mode: "hover" | "focus") => {
    onInteractionChange({ regionId: definition.id, mode });
  };

  const clearActive = () => {
    onInteractionChange(null);
  };

  return (
    <g
      className="anatomy-hit-region"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={definition.label}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      data-hit-region={definition.id}
      onClick={activate}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => setActive("hover")}
      onPointerLeave={clearActive}
      onFocus={() => setActive("focus")}
      onBlur={clearActive}
    >
      <title>{definition.label}</title>
      {definition.hitAreas.map((shape) => (
        <AnatomyShapeElement
          key={shape.id}
          shape={shape}
          className="anatomy-hit-area"
        />
      ))}
    </g>
  );
}

export function AnatomicalFigure({
  surface,
  value,
  onValueChange,
  disabled,
  labelledBy,
}: AnatomicalFigureProps) {
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const definitions = getAnatomicalRegionsForSurface(surface);
  const artwork = getAnatomicalSurfaceArtwork(surface);

  const activateRegion = (definition: AnatomicalRegionDefinition) => {
    if (!disabled) onValueChange(definition.muscleKey);
  };

  return (
    <svg
      className="anatomy-figure"
      viewBox={artwork.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-labelledby={labelledBy}
      data-surface={surface}
    >
      <g className="anatomy-content-layer" transform={artwork.contentTransform}>
        <BaseSilhouette surface={surface} />
        <VisibleMuscleArtwork
          definitions={definitions}
          value={value}
          interaction={interaction}
        />
        <g className="anatomy-hit-layer">
          {definitions.map((definition) => (
            <AnatomicalHitRegion
              key={definition.id}
              definition={definition}
              selected={value === definition.muscleKey}
              disabled={disabled}
              onActivate={activateRegion}
              onInteractionChange={setInteraction}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
