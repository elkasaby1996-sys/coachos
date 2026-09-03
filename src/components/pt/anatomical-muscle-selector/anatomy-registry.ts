import type {
  AnatomicalSurface,
  MuscleKey,
} from "../../../lib/exercise-muscle-taxonomy";
import { ADAPTED_ANATOMICAL_REGIONS } from "./artwork/artwork-adapter";

export type AnatomySurface = AnatomicalSurface;
export type AnatomySide = "left" | "right" | "center";

type AnatomyPathShape = {
  id: string;
  kind: "path";
  side: AnatomySide;
  d: string;
  strokeWidth?: number;
};

type AnatomyEllipseShape = {
  id: string;
  kind: "ellipse";
  side: AnatomySide;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  strokeWidth?: number;
};

export type AnatomyShape = AnatomyPathShape | AnatomyEllipseShape;

export type AnatomicalRegionDefinition = {
  id: string;
  surface: AnatomySurface;
  muscleKey: MuscleKey;
  label: string;
  interactionLayer: number;
  artwork: readonly AnatomyShape[];
  hitAreas: readonly AnatomyShape[];
};

// Illustration coordinates and private hit identifiers never leave this
// module. The explicit adapter is the only bridge to the exercise domain.
export const ANATOMICAL_REGION_DEFINITIONS = ADAPTED_ANATOMICAL_REGIONS;

export const ANATOMY_SURFACES = ["front", "back"] as const;

export const getAnatomicalRegionsForSurface = (surface: AnatomySurface) =>
  ANATOMICAL_REGION_DEFINITIONS.filter(
    (definition) => definition.surface === surface,
  ).sort((left, right) => left.interactionLayer - right.interactionLayer);

export const SELECTABLE_ANATOMY_MUSCLE_KEYS = Array.from(
  new Set(ANATOMICAL_REGION_DEFINITIONS.map(({ muscleKey }) => muscleKey)),
);
