import {
  getMuscleMetadata,
  type AnatomicalSurface,
  type MuscleKey,
} from "../../../lib/exercise-muscle-taxonomy";

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

const path = (
  id: string,
  side: AnatomySide,
  d: string,
  strokeWidth?: number,
): AnatomyPathShape => ({ id, kind: "path", side, d, strokeWidth });

const ellipse = (
  id: string,
  side: AnatomySide,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strokeWidth?: number,
): AnatomyEllipseShape => ({
  id,
  kind: "ellipse",
  side,
  cx,
  cy,
  rx,
  ry,
  strokeWidth,
});

const region = (
  id: string,
  surface: AnatomySurface,
  muscleKey: MuscleKey,
  artwork: readonly AnatomyShape[],
  hitAreas: readonly AnatomyShape[],
  interactionLayer = 0,
): AnatomicalRegionDefinition => ({
  id,
  surface,
  muscleKey,
  label: getMuscleMetadata(muscleKey).label,
  interactionLayer,
  artwork,
  hitAreas,
});

// Illustration coordinates and private hit identifiers never leave this module.
// The explicit muscleKey mapping is the only bridge to the exercise domain.
export const ANATOMICAL_REGION_DEFINITIONS = [
  region(
    "front-pectorals",
    "front",
    "pectorals",
    [
      path(
        "art-front-pectorals-left",
        "left",
        "M79 111 C88 97 102 92 117 98 L117 137 C102 143 84 137 75 126 Z",
      ),
      path(
        "art-front-pectorals-right",
        "right",
        "M123 98 C138 92 152 97 161 111 L165 126 C156 137 138 143 123 137 Z",
      ),
    ],
    [
      ellipse("hit-front-pectorals-left", "left", 98, 119, 23, 24),
      ellipse("hit-front-pectorals-right", "right", 142, 119, 23, 24),
    ],
  ),
  region(
    "front-anterior-deltoids",
    "front",
    "anterior_deltoids",
    [
      path(
        "art-front-anterior-deltoids-left",
        "left",
        "M76 101 C65 102 57 111 57 124 C64 130 73 131 81 125 L86 107 Z",
      ),
      path(
        "art-front-anterior-deltoids-right",
        "right",
        "M164 101 C175 102 183 111 183 124 C176 130 167 131 159 125 L154 107 Z",
      ),
    ],
    [
      ellipse("hit-front-anterior-deltoids-left", "left", 70, 116, 17, 18),
      ellipse("hit-front-anterior-deltoids-right", "right", 170, 116, 17, 18),
    ],
    3,
  ),
  region(
    "front-lateral-deltoids",
    "front",
    "lateral_deltoids",
    [
      path(
        "art-front-lateral-deltoids-left",
        "left",
        "M59 108 C48 114 45 126 49 139 C56 143 64 139 68 131 L70 111 Z",
      ),
      path(
        "art-front-lateral-deltoids-right",
        "right",
        "M181 108 C192 114 195 126 191 139 C184 143 176 139 172 131 L170 111 Z",
      ),
    ],
    [
      ellipse("hit-front-lateral-deltoids-left", "left", 57, 126, 16, 22),
      ellipse("hit-front-lateral-deltoids-right", "right", 183, 126, 16, 22),
    ],
    2,
  ),
  region(
    "front-biceps",
    "front",
    "biceps",
    [
      path(
        "art-front-biceps-left",
        "left",
        "M48 139 C58 134 67 140 68 153 L64 181 C60 191 50 190 45 181 L43 154 C43 147 45 142 48 139 Z",
      ),
      path(
        "art-front-biceps-right",
        "right",
        "M192 139 C182 134 173 140 172 153 L176 181 C180 191 190 190 195 181 L197 154 C197 147 195 142 192 139 Z",
      ),
    ],
    [
      ellipse("hit-front-biceps-left", "left", 55, 163, 15, 31),
      ellipse("hit-front-biceps-right", "right", 185, 163, 15, 31),
    ],
  ),
  region(
    "front-forearms",
    "front",
    "forearms",
    [
      path(
        "art-front-forearms-left",
        "left",
        "M43 188 C50 183 59 185 63 191 L55 246 C51 255 42 257 37 249 L35 239 Z",
      ),
      path(
        "art-front-forearms-right",
        "right",
        "M197 188 C190 183 181 185 177 191 L185 246 C189 255 198 257 203 249 L205 239 Z",
      ),
    ],
    [
      path("hit-front-forearms-left", "left", "M51 186 L45 249", 24),
      path("hit-front-forearms-right", "right", "M189 186 L195 249", 24),
    ],
  ),
  region(
    "front-rectus-abdominis",
    "front",
    "rectus_abdominis",
    [
      path(
        "art-front-rectus-abdominis-left",
        "left",
        "M103 143 C108 140 113 140 117 143 L117 168 C112 171 106 170 102 167 Z M102 173 C107 170 112 171 117 173 L117 199 C112 202 106 201 102 198 Z M103 204 C108 201 113 202 117 204 L117 231 C111 234 106 231 103 227 Z",
      ),
      path(
        "art-front-rectus-abdominis-right",
        "right",
        "M123 143 C127 140 132 140 137 143 L138 167 C134 170 128 171 123 168 Z M123 173 C128 171 133 170 138 173 L138 198 C134 201 128 202 123 199 Z M123 204 C127 202 132 201 137 204 L137 227 C134 231 129 234 123 231 Z",
      ),
    ],
    [
      path(
        "hit-front-rectus-abdominis-center",
        "center",
        "M120 142 L120 231",
        38,
      ),
    ],
    2,
  ),
  region(
    "front-obliques",
    "front",
    "obliques",
    [
      path(
        "art-front-obliques-left",
        "left",
        "M79 143 C90 146 98 155 101 169 L98 225 C87 218 78 204 74 185 Z",
      ),
      path(
        "art-front-obliques-right",
        "right",
        "M161 143 C150 146 142 155 139 169 L142 225 C153 218 162 204 166 185 Z",
      ),
    ],
    [
      ellipse("hit-front-obliques-left", "left", 87, 185, 18, 45),
      ellipse("hit-front-obliques-right", "right", 153, 185, 18, 45),
    ],
  ),
  region(
    "front-hip-flexors",
    "front",
    "hip_flexors",
    [
      path(
        "art-front-hip-flexors-left",
        "left",
        "M96 228 C102 229 110 233 116 238 L110 269 C99 266 91 258 87 246 Z",
      ),
      path(
        "art-front-hip-flexors-right",
        "right",
        "M144 228 C138 229 130 233 124 238 L130 269 C141 266 149 258 153 246 Z",
      ),
    ],
    [
      ellipse("hit-front-hip-flexors-left", "left", 103, 249, 18, 23),
      ellipse("hit-front-hip-flexors-right", "right", 137, 249, 18, 23),
    ],
    2,
  ),
  region(
    "front-hip-abductors",
    "front",
    "hip_abductors",
    [
      path(
        "art-front-hip-abductors-left",
        "left",
        "M78 224 C88 223 96 230 100 240 L92 278 C80 275 72 264 70 249 Z",
      ),
      path(
        "art-front-hip-abductors-right",
        "right",
        "M162 224 C152 223 144 230 140 240 L148 278 C160 275 168 264 170 249 Z",
      ),
    ],
    [
      ellipse("hit-front-hip-abductors-left", "left", 83, 251, 18, 31),
      ellipse("hit-front-hip-abductors-right", "right", 157, 251, 18, 31),
    ],
  ),
  region(
    "front-quadriceps",
    "front",
    "quadriceps",
    [
      path(
        "art-front-quadriceps-left",
        "left",
        "M79 279 C91 271 106 273 114 286 L109 365 C104 380 91 386 79 373 C72 346 72 307 79 279 Z",
      ),
      path(
        "art-front-quadriceps-right",
        "right",
        "M161 279 C149 271 134 273 126 286 L131 365 C136 380 149 386 161 373 C168 346 168 307 161 279 Z",
      ),
    ],
    [
      ellipse("hit-front-quadriceps-left", "left", 94, 328, 25, 58),
      ellipse("hit-front-quadriceps-right", "right", 146, 328, 25, 58),
    ],
  ),
  region(
    "front-adductors",
    "front",
    "adductors",
    [
      path(
        "art-front-adductors-left",
        "left",
        "M111 276 C118 286 119 302 116 321 L108 359 C101 340 97 310 99 286 Z",
      ),
      path(
        "art-front-adductors-right",
        "right",
        "M129 276 C122 286 121 302 124 321 L132 359 C139 340 143 310 141 286 Z",
      ),
    ],
    [
      path("hit-front-adductors-left", "left", "M108 286 L108 352", 22),
      path("hit-front-adductors-right", "right", "M132 286 L132 352", 22),
    ],
    2,
  ),
  region(
    "front-tibialis-anterior",
    "front",
    "tibialis_anterior",
    [
      path(
        "art-front-tibialis-anterior-left",
        "left",
        "M82 385 C90 379 99 383 102 391 L95 469 C91 478 83 477 79 468 Z",
      ),
      path(
        "art-front-tibialis-anterior-right",
        "right",
        "M158 385 C150 379 141 383 138 391 L145 469 C149 478 157 477 161 468 Z",
      ),
    ],
    [
      path("hit-front-tibialis-anterior-left", "left", "M91 389 L87 469", 25),
      path(
        "hit-front-tibialis-anterior-right",
        "right",
        "M149 389 L153 469",
        25,
      ),
    ],
  ),
  region(
    "back-posterior-deltoids",
    "back",
    "posterior_deltoids",
    [
      path(
        "art-back-posterior-deltoids-left",
        "left",
        "M76 101 C65 102 56 112 57 126 C64 133 74 132 82 125 L87 107 Z",
      ),
      path(
        "art-back-posterior-deltoids-right",
        "right",
        "M164 101 C175 102 184 112 183 126 C176 133 166 132 158 125 L153 107 Z",
      ),
    ],
    [
      ellipse("hit-back-posterior-deltoids-left", "left", 70, 117, 17, 19),
      ellipse("hit-back-posterior-deltoids-right", "right", 170, 117, 17, 19),
    ],
    3,
  ),
  region(
    "back-lateral-deltoids",
    "back",
    "lateral_deltoids",
    [
      path(
        "art-back-lateral-deltoids-left",
        "left",
        "M59 108 C48 114 45 127 49 140 C56 144 64 140 68 132 L70 111 Z",
      ),
      path(
        "art-back-lateral-deltoids-right",
        "right",
        "M181 108 C192 114 195 127 191 140 C184 144 176 140 172 132 L170 111 Z",
      ),
    ],
    [
      ellipse("hit-back-lateral-deltoids-left", "left", 57, 127, 16, 22),
      ellipse("hit-back-lateral-deltoids-right", "right", 183, 127, 16, 22),
    ],
    2,
  ),
  region(
    "back-triceps",
    "back",
    "triceps",
    [
      path(
        "art-back-triceps-left",
        "left",
        "M48 137 C58 132 67 137 69 149 L64 182 C60 193 50 193 44 183 L42 154 Z",
      ),
      path(
        "art-back-triceps-right",
        "right",
        "M192 137 C182 132 173 137 171 149 L176 182 C180 193 190 193 196 183 L198 154 Z",
      ),
    ],
    [
      ellipse("hit-back-triceps-left", "left", 55, 163, 15, 32),
      ellipse("hit-back-triceps-right", "right", 185, 163, 15, 32),
    ],
  ),
  region(
    "back-forearms",
    "back",
    "forearms",
    [
      path(
        "art-back-forearms-left",
        "left",
        "M43 188 C50 183 59 185 63 191 L55 246 C51 255 42 257 37 249 L35 239 Z",
      ),
      path(
        "art-back-forearms-right",
        "right",
        "M197 188 C190 183 181 185 177 191 L185 246 C189 255 198 257 203 249 L205 239 Z",
      ),
    ],
    [
      path("hit-back-forearms-left", "left", "M51 186 L45 249", 24),
      path("hit-back-forearms-right", "right", "M189 186 L195 249", 24),
    ],
  ),
  region(
    "back-trapezius",
    "back",
    "trapezius",
    [
      path(
        "art-back-trapezius-center",
        "center",
        "M103 75 C111 82 129 82 137 75 L153 111 C145 123 135 135 120 146 C105 135 95 123 87 111 Z",
      ),
    ],
    [ellipse("hit-back-trapezius-center", "center", 120, 111, 36, 39)],
  ),
  region(
    "back-rhomboids",
    "back",
    "rhomboids",
    [
      path(
        "art-back-rhomboids-left",
        "left",
        "M90 119 C99 120 108 123 116 128 L112 165 C102 161 93 155 87 147 Z",
      ),
      path(
        "art-back-rhomboids-right",
        "right",
        "M150 119 C141 120 132 123 124 128 L128 165 C138 161 147 155 153 147 Z",
      ),
    ],
    [
      ellipse("hit-back-rhomboids-left", "left", 103, 143, 19, 28),
      ellipse("hit-back-rhomboids-right", "right", 137, 143, 19, 28),
    ],
    4,
  ),
  region(
    "back-latissimus-dorsi",
    "back",
    "latissimus_dorsi",
    [
      path(
        "art-back-latissimus-dorsi-left",
        "left",
        "M78 128 C90 132 102 141 109 152 L101 216 C87 209 76 194 70 174 Z",
      ),
      path(
        "art-back-latissimus-dorsi-right",
        "right",
        "M162 128 C150 132 138 141 131 152 L139 216 C153 209 164 194 170 174 Z",
      ),
    ],
    [
      ellipse("hit-back-latissimus-dorsi-left", "left", 88, 171, 23, 50),
      ellipse("hit-back-latissimus-dorsi-right", "right", 152, 171, 23, 50),
    ],
  ),
  region(
    "back-spinal-erectors",
    "back",
    "spinal_erectors",
    [
      path(
        "art-back-spinal-erectors-left",
        "left",
        "M108 150 C113 145 118 148 119 157 L116 231 C113 241 107 239 104 229 Z",
      ),
      path(
        "art-back-spinal-erectors-right",
        "right",
        "M132 150 C127 145 122 148 121 157 L124 231 C127 241 133 239 136 229 Z",
      ),
    ],
    [
      path("hit-back-spinal-erectors-left", "left", "M113 156 L111 230", 20),
      path("hit-back-spinal-erectors-right", "right", "M127 156 L129 230", 20),
    ],
    3,
  ),
  region(
    "back-obliques",
    "back",
    "obliques",
    [
      path(
        "art-back-obliques-left",
        "left",
        "M72 180 C78 200 89 215 102 222 L95 243 C82 238 72 226 67 207 Z",
      ),
      path(
        "art-back-obliques-right",
        "right",
        "M168 180 C162 200 151 215 138 222 L145 243 C158 238 168 226 173 207 Z",
      ),
    ],
    [
      ellipse("hit-back-obliques-left", "left", 83, 211, 19, 36),
      ellipse("hit-back-obliques-right", "right", 157, 211, 19, 36),
    ],
  ),
  region(
    "back-gluteals",
    "back",
    "gluteals",
    [
      path(
        "art-back-gluteals-left",
        "left",
        "M80 239 C91 228 107 228 117 241 L115 281 C102 291 86 289 76 277 Z",
      ),
      path(
        "art-back-gluteals-right",
        "right",
        "M160 239 C149 228 133 228 123 241 L125 281 C138 291 154 289 164 277 Z",
      ),
    ],
    [
      ellipse("hit-back-gluteals-left", "left", 98, 260, 26, 34),
      ellipse("hit-back-gluteals-right", "right", 142, 260, 26, 34),
    ],
    2,
  ),
  region(
    "back-hip-abductors",
    "back",
    "hip_abductors",
    [
      path(
        "art-back-hip-abductors-left",
        "left",
        "M76 224 C87 222 95 228 99 239 L89 278 C77 274 68 263 67 248 Z",
      ),
      path(
        "art-back-hip-abductors-right",
        "right",
        "M164 224 C153 222 145 228 141 239 L151 278 C163 274 172 263 173 248 Z",
      ),
    ],
    [
      ellipse("hit-back-hip-abductors-left", "left", 80, 251, 18, 31),
      ellipse("hit-back-hip-abductors-right", "right", 160, 251, 18, 31),
    ],
    3,
  ),
  region(
    "back-hamstrings",
    "back",
    "hamstrings",
    [
      path(
        "art-back-hamstrings-left",
        "left",
        "M79 283 C91 276 106 278 114 290 L109 367 C103 381 90 385 78 372 C72 345 72 309 79 283 Z",
      ),
      path(
        "art-back-hamstrings-right",
        "right",
        "M161 283 C149 276 134 278 126 290 L131 367 C137 381 150 385 162 372 C168 345 168 309 161 283 Z",
      ),
    ],
    [
      ellipse("hit-back-hamstrings-left", "left", 94, 328, 25, 57),
      ellipse("hit-back-hamstrings-right", "right", 146, 328, 25, 57),
    ],
  ),
  region(
    "back-calves",
    "back",
    "calves",
    [
      path(
        "art-back-calves-left",
        "left",
        "M80 385 C91 376 102 383 106 397 L100 446 C96 464 85 470 77 450 C73 430 74 403 80 385 Z",
      ),
      path(
        "art-back-calves-right",
        "right",
        "M160 385 C149 376 138 383 134 397 L140 446 C144 464 155 470 163 450 C167 430 166 403 160 385 Z",
      ),
    ],
    [
      ellipse("hit-back-calves-left", "left", 90, 424, 21, 48),
      ellipse("hit-back-calves-right", "right", 150, 424, 21, 48),
    ],
  ),
] as const satisfies readonly AnatomicalRegionDefinition[];

export const ANATOMY_SURFACES = ["front", "back"] as const;

export const getAnatomicalRegionsForSurface = (surface: AnatomySurface) =>
  ANATOMICAL_REGION_DEFINITIONS.filter(
    (definition) => definition.surface === surface,
  ).sort((left, right) => left.interactionLayer - right.interactionLayer);

export const SELECTABLE_ANATOMY_MUSCLE_KEYS = Array.from(
  new Set(ANATOMICAL_REGION_DEFINITIONS.map(({ muscleKey }) => muscleKey)),
);
