import {
  getMuscleMetadata,
  type MuscleKey,
} from "../../../../lib/exercise-muscle-taxonomy";
import type {
  AnatomicalRegionDefinition,
  AnatomyShape,
  AnatomySurface,
} from "../anatomy-registry";

// Original front/back PNGs supplied by the user on 2026-09-05, copied unchanged.
// All coordinates below are in their native 1024 × 1536 image space. The
// former vendored illustration has different proportions and is not reused.
export const getImageSurfaceArtwork = (surface: AnatomySurface) => ({
  href: `/assets/anatomy/male-${surface}.png`,
  viewBox: "0 0 1024 1536",
  width: 1024,
  height: 1536,
});

// Paths use absolute M/L/C/Q coordinate pairs only. Reflecting about x=512
// preserves the supplied illustration's bilateral anatomy without transforms
// that could put the interactive layer in a different coordinate space.
const mirror = (path: string) =>
  path.replace(
    /(\d+) (\d+)/g,
    (_, x: string, y: string) => `${1024 - Number(x)} ${y}`,
  );

function region(
  surface: AnatomySurface,
  slug: string,
  muscleKey: MuscleKey,
  left: string,
): AnatomicalRegionDefinition {
  const id = `${surface}-${slug}`;
  const shapes = (kind: "art" | "hit"): AnatomyShape[] => [
    { id: `${kind}-${id}-left`, kind: "path", side: "left", d: left },
    { id: `${kind}-${id}-right`, kind: "path", side: "right", d: mirror(left) },
  ];
  return {
    id,
    surface,
    muscleKey,
    label: getMuscleMetadata(muscleKey).label,
    interactionLayer: 1,
    artwork: shapes("art"),
    hitAreas: shapes("hit"),
  };
}

// The outlines follow the visible muscle bellies. Deep muscles (hip flexors
// and rhomboids) use their surface projection; this is an exercise selector,
// not a layered medical atlas. Narrow targets also remain reachable by list.
export const IMAGE_ANATOMICAL_REGIONS: readonly AnatomicalRegionDefinition[] = [
  region(
    "front",
    "chest",
    "pectorals",
    "M499 298 C463 274 412 288 367 346 C376 383 392 416 431 430 C477 442 505 416 507 370 C508 338 508 310 499 298 Z",
  ),
  region(
    "front",
    "anterior-deltoids",
    "anterior_deltoids",
    "M405 278 C369 276 346 298 330 333 L319 379 C338 370 353 357 366 342 C379 317 392 295 405 278 Z",
  ),
  region(
    "front",
    "lateral-deltoids",
    "lateral_deltoids",
    "M375 273 C336 270 309 291 299 328 C291 351 291 384 299 403 L316 380 C317 338 336 294 375 273 Z",
  ),
  region(
    "front",
    "biceps",
    "biceps",
    "M345 374 C366 411 362 455 345 498 C334 525 313 536 300 521 C292 494 300 447 314 414 Z",
  ),
  region(
    "front",
    "forearm",
    "forearms",
    "M289 505 C272 525 254 558 242 600 L208 720 L230 735 C251 694 282 661 301 620 C319 583 329 557 331 537 L306 550 Z",
  ),
  region(
    "front",
    "abs",
    "rectus_abdominis",
    "M486 426 C464 429 443 442 444 467 L442 525 C443 581 452 647 477 690 C486 706 496 714 506 711 L507 436 Q497 422 486 426 Z",
  ),
  region(
    "front",
    "obliques",
    "obliques",
    "M375 417 C394 433 413 444 435 446 L435 480 C424 519 442 578 441 628 C425 627 407 613 400 596 C395 547 376 503 375 467 Z",
  ),
  region(
    "front",
    "hip-flexors",
    "hip_flexors",
    "M409 628 C431 642 444 675 456 713 L480 787 L462 778 C444 724 421 685 407 658 Z",
  ),
  region(
    "front",
    "hip-abductors",
    "hip_abductors",
    "M395 630 L405 658 C389 695 382 733 375 778 L364 827 C358 770 366 693 381 651 Z",
  ),
  region(
    "front",
    "quadriceps",
    "quadriceps",
    "M395 686 C411 709 416 750 424 795 C435 852 459 895 470 932 C478 956 467 981 449 985 C422 979 412 942 412 919 C401 947 397 956 387 956 C374 940 367 900 369 863 C370 800 379 745 395 686 Z",
  ),
  region(
    "front",
    "adductors",
    "adductors",
    "M456 742 L478 769 L502 762 C505 811 493 858 482 899 L472 937 C458 902 445 861 440 817 Z",
  ),
  region(
    "front",
    "tibialis",
    "tibialis_anterior",
    "M414 1055 C424 1091 426 1143 424 1189 L409 1349 L395 1373 C397 1306 383 1230 391 1168 C395 1126 405 1085 414 1055 Z",
  ),
  region(
    "back",
    "trapezius",
    "trapezius",
    "M472 181 C458 228 423 256 374 277 C420 282 438 304 444 342 C461 388 487 426 505 443 L505 269 C494 231 479 199 472 181 Z",
  ),
  region(
    "back",
    "posterior-deltoids",
    "posterior_deltoids",
    "M371 289 C344 288 316 311 307 342 L302 379 C329 375 356 357 381 336 L410 315 Z",
  ),
  region(
    "back",
    "lateral-deltoids",
    "lateral_deltoids",
    "M352 284 C315 287 293 315 287 349 C283 370 286 390 292 405 L302 382 C299 335 321 299 352 284 Z",
  ),
  region(
    "back",
    "triceps",
    "triceps",
    "M329 382 C350 402 369 425 364 456 C359 480 341 511 318 534 L296 540 C303 504 307 466 312 431 Z",
  ),
  region(
    "back",
    "forearm",
    "forearms",
    "M279 526 C259 554 242 597 228 645 L207 726 L230 733 C247 688 282 656 298 616 C310 588 316 560 309 548 L287 571 Z",
  ),
  region(
    "back",
    "latissimus-dorsi",
    "latissimus_dorsi",
    "M377 406 C404 420 421 414 440 400 C450 443 476 459 478 484 C465 518 443 567 430 591 C400 578 384 545 383 507 L367 453 Z",
  ),
  region(
    "back",
    "rhomboids",
    "rhomboids",
    "M435 338 C429 359 432 385 441 408 L478 447 L499 459 L503 445 C479 422 454 381 443 349 Z",
  ),
  region(
    "back",
    "spinal-erectors",
    "spinal_erectors",
    "M489 453 L504 470 L505 671 C488 651 467 627 447 616 C457 571 478 516 489 453 Z",
  ),
  region(
    "back",
    "gluteal",
    "gluteals",
    "M422 632 C450 632 478 651 493 679 C505 702 508 743 496 770 C470 792 424 801 399 783 C373 763 386 711 394 681 C400 657 407 641 422 632 Z",
  ),
  region(
    "back",
    "hip-abductors",
    "hip_abductors",
    "M391 615 C407 609 425 613 442 623 C418 621 396 639 388 673 L378 717 L367 708 C371 665 376 632 391 615 Z",
  ),
  region(
    "back",
    "hamstring",
    "hamstrings",
    "M394 794 C420 805 466 796 490 785 C493 839 481 914 461 975 L445 1007 L426 979 C413 984 402 1000 384 1019 C383 977 361 926 357 879 C354 842 364 815 376 791 Z",
  ),
  region(
    "back",
    "calves",
    "calves",
    "M387 1034 C401 1054 408 1094 405 1133 C404 1166 392 1197 378 1204 C359 1208 347 1182 349 1151 C351 1106 367 1062 387 1034 Z M431 1037 C447 1068 462 1119 461 1164 C461 1194 448 1215 434 1213 C418 1205 411 1173 411 1134 C412 1098 420 1063 431 1037 Z",
  ),
];
