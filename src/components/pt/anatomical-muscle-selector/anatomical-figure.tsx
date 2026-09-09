import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { MuscleKey } from "../../../lib/exercise-muscle-taxonomy";
import {
  getAnatomicalRegionsForSurface,
  type AnatomicalRegionDefinition,
  type AnatomyShape,
  type AnatomySurface,
} from "./anatomy-registry";
import { getImageSurfaceArtwork } from "./artwork/supplied-anatomy";

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
  const artwork = getImageSurfaceArtwork(surface);
  return (
    <g aria-hidden="true" className="anatomy-base-layer">
      <image
        href={artwork.href}
        width={artwork.width}
        height={artwork.height}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}

function VisibleMuscleArtwork({
  definitions,
  value,
  interaction,
  materialId,
}: {
  definitions: readonly AnatomicalRegionDefinition[];
  value: MuscleKey | null;
  interaction: InteractionState;
  materialId: string;
}) {
  return (
    <g aria-hidden="true" className="anatomy-art-layer">
      {definitions.map((definition) => (
        <g
          key={`art-${definition.id}`}
          className="anatomy-art-muscle"
          style={
            {
              "--anatomy-selected-fill": `url(#${materialId}-selected)`,
              "--anatomy-hover-fill": `url(#${materialId}-hover)`,
            } as CSSProperties
          }
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
    if (!disabled) onInteractionChange({ regionId: definition.id, mode });
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
  const materialId = `anatomy-${useId().replace(/:/g, "")}`;
  const definitions = getAnatomicalRegionsForSurface(surface);
  const artwork = getImageSurfaceArtwork(surface);

  const activateRegion = (definition: AnatomicalRegionDefinition) => {
    if (!disabled) onValueChange(definition.muscleKey);
  };

  const preview =
    !disabled && interaction
      ? definitions.find((definition) => definition.id === interaction.regionId)
      : null;

  return (
    <>
      <svg
        className="anatomy-figure"
        viewBox={artwork.viewBox}
        preserveAspectRatio="xMidYMid meet"
        aria-labelledby={labelledBy}
        data-surface={surface}
      >
        <defs>
          <linearGradient
            id={`${materialId}-selected`}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0" stopColor="#9bffeb" />
            <stop offset="0.5" stopColor="#3dd6ba" />
            <stop offset="1" stopColor="#139c8b" />
          </linearGradient>
          <linearGradient
            id={`${materialId}-hover`}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0" stopColor="#c1fff4" />
            <stop offset="1" stopColor="#72bcb5" />
          </linearGradient>
        </defs>
        <g className="anatomy-content-layer">
          <BaseSilhouette surface={surface} />
          <VisibleMuscleArtwork
            definitions={definitions}
            value={value}
            interaction={disabled ? null : interaction}
            materialId={materialId}
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
      <p className="anatomy-preview" aria-hidden="true">
        {preview
          ? `Preview · ${preview.label}`
          : "Click or focus a muscle to explore"}
      </p>
    </>
  );
}
