export const semanticTones = [
  "success",
  "info",
  "warning",
  "danger",
  "neutral",
] as const;

export type SemanticTone = (typeof semanticTones)[number];
export type SemanticToneLike = SemanticTone | "positive" | "negative";

export const semanticToneClassNames: Record<
  SemanticTone,
  {
    badge: string;
    marker: string;
    text: string;
    surface: string;
  }
> = {
  success: {
    badge: "border-success/22 bg-success/12 text-success",
    marker: "bg-success",
    text: "text-success",
    surface: "border-success/22 bg-success/12 text-success",
  },
  info: {
    badge: "border-info/22 bg-info/12 text-info",
    marker: "bg-info",
    text: "text-info",
    surface: "border-info/22 bg-info/12 text-info",
  },
  warning: {
    badge: "border-warning/22 bg-warning/12 text-warning",
    marker: "bg-warning",
    text: "text-warning",
    surface: "border-warning/22 bg-warning/12 text-warning",
  },
  danger: {
    badge: "border-danger/22 bg-danger/12 text-danger",
    marker: "bg-danger",
    text: "text-danger",
    surface: "border-danger/22 bg-danger/12 text-danger",
  },
  neutral: {
    badge: "border-neutral/22 bg-neutral/12 text-neutral",
    marker: "bg-neutral",
    text: "text-neutral",
    surface: "border-neutral/22 bg-neutral/12 text-neutral",
  },
};

const exactSemanticToneMap: Record<string, SemanticTone> = {
  published: "success",
  "published and discoverable": "success",
  "all clear": "success",
  "no blockers": "success",
  accepted: "success",
  completed: "success",
  healthy: "success",
  clear: "success",
  "billing is connected": "success",
  connected: "success",
  "in progress": "info",
  live: "info",
  recent: "info",
  "new this month": "info",
  pending: "warning",
  "awaiting response": "warning",
  "billing is still manual": "warning",
  manual: "warning",
  "not connected": "warning",
  "onboarding incomplete": "warning",
  "needs attention": "warning",
  "waiting review": "warning",
  "ready to publish": "warning",
  draft: "warning",
  unpublished: "warning",
  "not created": "warning",
  incomplete: "warning",
  "setup in progress": "warning",
  "at risk": "danger",
  "risk signals": "danger",
  overdue: "danger",
  blocked: "danger",
  inactive: "neutral",
  unknown: "neutral",
  archived: "neutral",
  placeholder: "neutral",
};

const keywordToneGroups: Array<[SemanticTone, string[]]> = [
  ["danger", ["at risk", "risk signal", "overdue", "blocked"]],
  [
    "warning",
    [
      "awaiting response",
      "pending",
      "manual",
      "not connected",
      "incomplete",
      "needs attention",
      "waiting review",
      "draft",
      "unpublished",
      "setup",
    ],
  ],
  [
    "success",
    [
      "published",
      "all clear",
      "no blockers",
      "accepted",
      "healthy",
      "billing is connected",
    ],
  ],
  ["info", ["in progress", "live", "recent"]],
  ["neutral", ["inactive", "unknown", "archived", "placeholder"]],
];

function normalizeStatusToken(status: string) {
  return status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function getSemanticToneClasses(
  tone: SemanticToneLike | null | undefined,
) {
  if (tone === "positive") return semanticToneClassNames.info;
  if (tone === "negative") return semanticToneClassNames.danger;
  return semanticToneClassNames[tone ?? "neutral"];
}

export function getSemanticBadgeVariant(
  tone: string | SemanticToneLike | null | undefined,
): SemanticTone {
  if (!tone) return "neutral";
  if (tone === "positive") return "info";
  if (tone === "negative") return "danger";
  return getSemanticToneForStatus(tone, "neutral");
}

export function getSemanticToneForStatus(
  status: string | null | undefined,
  fallback: SemanticTone = "neutral",
): SemanticTone {
  if (!status) return fallback;

  const normalized = normalizeStatusToken(status);
  const exactMatch = exactSemanticToneMap[normalized];
  if (exactMatch) return exactMatch;

  for (const [tone, keywords] of keywordToneGroups) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return tone;
    }
  }

  return fallback;
}
