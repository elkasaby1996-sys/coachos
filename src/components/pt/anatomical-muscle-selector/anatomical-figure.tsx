import { useState, type KeyboardEvent } from "react";
import type { MuscleKey } from "../../../lib/exercise-muscle-taxonomy";
import {
  getAnatomicalRegionsForSurface,
  type AnatomicalRegionDefinition,
  type AnatomyShape,
  type AnatomySurface,
} from "./anatomy-registry";

type AnatomicalFigureProps = {
  surface: AnatomySurface;
  value: MuscleKey | null;
  onValueChange: (value: MuscleKey) => void;
  onActiveLabelChange: (label: string | null) => void;
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
  return (
    <g aria-hidden="true" className="anatomy-base-layer">
      <ellipse className="anatomy-head" cx="120" cy="38" rx="21" ry="27" />
      <path
        className="anatomy-body"
        d="M104 61 C109 67 113 70 120 70 C127 70 131 67 136 61 L139 82 C153 85 172 91 185 102 C198 113 201 132 201 151 L211 239 C214 255 205 265 195 263 C185 261 182 252 180 240 L169 188 L171 226 C173 246 169 264 164 282 L164 365 L169 468 C171 489 163 501 153 500 C143 499 140 488 139 474 L124 302 C123 293 122 289 120 289 C118 289 117 293 116 302 L101 474 C100 488 97 499 87 500 C77 501 69 489 71 468 L76 365 L76 282 C71 264 67 246 69 226 L71 188 L60 240 C58 252 55 261 45 263 C35 265 26 255 29 239 L39 151 C39 132 42 113 55 102 C68 91 87 85 101 82 Z"
      />
      <path
        className="anatomy-foot"
        d="M72 486 C78 492 89 493 99 488 L97 503 C86 510 72 509 65 502 Z"
      />
      <path
        className="anatomy-foot"
        d="M168 486 C162 492 151 493 141 488 L143 503 C154 510 168 509 175 502 Z"
      />

      {surface === "front" ? (
        <g className="anatomy-detail-lines">
          <path d="M88 101 C101 92 111 91 120 96 C129 91 139 92 152 101" />
          <path d="M120 142 L120 230" />
          <path d="M84 374 C91 380 101 382 109 373" />
          <path d="M156 374 C149 380 139 382 131 373" />
        </g>
      ) : (
        <g className="anatomy-detail-lines">
          <path d="M89 111 C103 118 112 122 120 129 C128 122 137 118 151 111" />
          <path d="M120 129 L120 230" />
          <path d="M84 374 C92 379 101 381 109 373" />
          <path d="M156 374 C148 379 139 381 131 373" />
        </g>
      )}
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
  onActiveLabelChange,
}: {
  definition: AnatomicalRegionDefinition;
  selected: boolean;
  disabled: boolean;
  onActivate: (definition: AnatomicalRegionDefinition) => void;
  onInteractionChange: (interaction: InteractionState) => void;
  onActiveLabelChange: (label: string | null) => void;
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
    onActiveLabelChange(definition.label);
  };

  const clearActive = () => {
    onInteractionChange(null);
    onActiveLabelChange(null);
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
  onActiveLabelChange,
  disabled,
  labelledBy,
}: AnatomicalFigureProps) {
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const definitions = getAnatomicalRegionsForSurface(surface);

  const activateRegion = (definition: AnatomicalRegionDefinition) => {
    if (!disabled) onValueChange(definition.muscleKey);
  };

  return (
    <svg
      className="anatomy-figure"
      viewBox="0 0 240 520"
      preserveAspectRatio="xMidYMid meet"
      aria-labelledby={labelledBy}
      data-surface={surface}
    >
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
            onActiveLabelChange={onActiveLabelChange}
          />
        ))}
      </g>
    </svg>
  );
}
