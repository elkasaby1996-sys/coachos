// Original RepSync geometry that refines broad upstream regions or adds
// canonical regions that react-muscle-highlighter does not provide.

export type RepSyncAnatomyOverlay = {
  readonly id: string;
  readonly surface: "front" | "back";
  readonly muscleKey:
    | "anterior_deltoids"
    | "lateral_deltoids"
    | "posterior_deltoids"
    | "latissimus_dorsi"
    | "rhomboids"
    | "spinal_erectors"
    | "hip_flexors"
    | "hip_abductors";
  readonly interactionLayer: number;
  readonly paths: {
    readonly left?: readonly string[];
    readonly right?: readonly string[];
  };
  readonly hitPaths?: {
    readonly left?: readonly string[];
    readonly right?: readonly string[];
  };
};

export const REPSYNC_ANATOMY_OVERLAYS = [
  {
    id: "front-anterior-deltoids",
    surface: "front",
    muscleKey: "anterior_deltoids",
    interactionLayer: 4,
    paths: {
      left: [
        "M246 326 C258 312 274 306 290 311 C281 325 275 342 273 362 C260 358 251 346 246 326 Z",
      ],
      right: [
        "M478 326 C466 312 450 306 434 311 C443 325 449 342 451 362 C464 358 473 346 478 326 Z",
      ],
    },
  },
  {
    id: "front-lateral-deltoids",
    surface: "front",
    muscleKey: "lateral_deltoids",
    interactionLayer: 3,
    paths: {
      left: [
        "M218 336 C225 315 244 302 263 301 C252 319 247 340 247 363 C237 376 225 382 214 375 C211 361 212 347 218 336 Z",
      ],
      right: [
        "M506 336 C499 315 480 302 461 301 C472 319 477 340 477 363 C487 376 499 382 510 375 C513 361 512 347 506 336 Z",
      ],
    },
  },
  {
    id: "front-hip-flexors",
    surface: "front",
    muscleKey: "hip_flexors",
    interactionLayer: 4,
    paths: {
      left: [
        "M326 626 C337 624 347 632 354 644 L350 688 C339 683 329 671 322 653 C319 641 320 632 326 626 Z",
      ],
      right: [
        "M398 626 C387 624 377 632 370 644 L374 688 C385 683 395 671 402 653 C405 641 404 632 398 626 Z",
      ],
    },
    hitPaths: {
      left: [
        "M319 619 C335 618 350 628 359 643 L353 704 C336 697 322 680 315 655 C312 638 314 626 319 619 Z",
      ],
      right: [
        "M405 619 C389 618 374 628 365 643 L371 704 C388 697 402 680 409 655 C412 638 410 626 405 619 Z",
      ],
    },
  },
  {
    id: "front-hip-abductors",
    surface: "front",
    muscleKey: "hip_abductors",
    interactionLayer: 5,
    paths: {
      left: [
        "M268 628 C280 620 293 621 303 630 C296 642 291 657 288 676 C280 684 268 682 259 671 C257 653 260 638 268 628 Z",
      ],
      right: [
        "M456 628 C444 620 431 621 421 630 C428 642 433 657 436 676 C444 684 456 682 465 671 C467 653 464 638 456 628 Z",
      ],
    },
    hitPaths: {
      left: [
        "M263 619 C280 613 299 618 311 631 C301 652 294 674 291 699 C274 702 259 692 250 674 C250 650 254 630 263 619 Z",
      ],
      right: [
        "M461 619 C444 613 425 618 413 631 C423 652 430 674 433 699 C450 702 465 692 474 674 C474 650 470 630 461 619 Z",
      ],
    },
  },
  {
    id: "back-posterior-deltoids",
    surface: "back",
    muscleKey: "posterior_deltoids",
    interactionLayer: 5,
    paths: {
      left: [
        "M952 318 C967 311 985 317 998 331 C985 340 974 355 968 375 C954 373 943 362 940 347 C942 335 946 326 952 318 Z",
      ],
      right: [
        "M1216 318 C1201 311 1183 317 1170 331 C1183 340 1194 355 1200 375 C1214 373 1225 362 1228 347 C1226 335 1222 326 1216 318 Z",
      ],
    },
  },
  {
    id: "back-lateral-deltoids",
    surface: "back",
    muscleKey: "lateral_deltoids",
    interactionLayer: 4,
    paths: {
      left: [
        "M922 333 C929 315 945 304 961 305 C950 324 946 346 947 369 C937 382 925 388 914 380 C910 363 913 346 922 333 Z",
      ],
      right: [
        "M1246 333 C1239 315 1223 304 1207 305 C1218 324 1222 346 1221 369 C1231 382 1243 388 1254 380 C1258 363 1255 346 1246 333 Z",
      ],
    },
  },
  {
    id: "back-rhomboids",
    surface: "back",
    muscleKey: "rhomboids",
    interactionLayer: 6,
    paths: {
      left: [
        "M1015 366 C1035 369 1054 380 1075 398 L1069 468 C1048 455 1029 440 1010 417 Z",
      ],
      right: [
        "M1153 366 C1133 369 1114 380 1093 398 L1099 468 C1120 455 1139 440 1158 417 Z",
      ],
    },
  },
  {
    id: "back-latissimus-dorsi",
    surface: "back",
    muscleKey: "latissimus_dorsi",
    interactionLayer: 3,
    paths: {
      left: [
        "M1001 411 C1018 420 1038 438 1052 463 C1044 500 1031 542 1012 584 C994 558 985 523 982 478 C978 451 984 429 1001 411 Z",
      ],
      right: [
        "M1167 411 C1150 420 1130 438 1116 463 C1124 500 1137 542 1156 584 C1174 558 1183 523 1186 478 C1190 451 1184 429 1167 411 Z",
      ],
    },
  },
  {
    id: "back-spinal-erectors",
    surface: "back",
    muscleKey: "spinal_erectors",
    interactionLayer: 7,
    paths: {
      left: [
        "M1058 490 C1067 482 1075 489 1076 506 L1073 632 C1068 648 1059 646 1053 629 Z",
      ],
      right: [
        "M1110 490 C1101 482 1093 489 1092 506 L1095 632 C1100 648 1109 646 1115 629 Z",
      ],
    },
  },
  {
    id: "back-hip-abductors",
    surface: "back",
    muscleKey: "hip_abductors",
    interactionLayer: 8,
    paths: {
      left: [
        "M982 630 C997 620 1018 622 1032 638 C1025 649 1018 662 1014 678 C1003 686 988 684 976 676 C970 658 973 641 982 630 Z",
      ],
      right: [
        "M1186 630 C1171 620 1150 622 1136 638 C1143 649 1150 662 1154 678 C1165 686 1180 684 1192 676 C1198 658 1195 641 1186 630 Z",
      ],
    },
    hitPaths: {
      left: [
        "M976 620 C998 611 1023 617 1039 636 C1030 654 1022 676 1018 699 C998 704 979 696 966 682 C961 657 965 635 976 620 Z",
      ],
      right: [
        "M1192 620 C1170 611 1145 617 1129 636 C1138 654 1146 676 1150 699 C1170 704 1189 696 1202 682 C1207 657 1203 635 1192 620 Z",
      ],
    },
  },
] as const satisfies readonly RepSyncAnatomyOverlay[];
