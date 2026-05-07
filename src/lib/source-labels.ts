export type UnifiedSourceKind = "assigned" | "personal";

type SourceLabelParams = {
  workspaceId: string | null | undefined;
  workspaceName?: string | null;
};

export function classifyUnifiedSourceKind(
  params: SourceLabelParams,
): UnifiedSourceKind {
  return params.workspaceId ? "assigned" : "personal";
}

export function buildUnifiedSourceLabel(params: SourceLabelParams) {
  const sourceKind = classifyUnifiedSourceKind(params);
  if (sourceKind === "personal") return "Personal";

  const normalizedName = params.workspaceName?.trim() ?? "";
  if (!normalizedName) return "Coach";
  if (/^coach\s+/i.test(normalizedName)) return normalizedName;
  return `Coach ${normalizedName}`;
}

export function matchesUnifiedSourceFilter(
  sourceKind: UnifiedSourceKind,
  filter: "all" | "assigned" | "personal",
) {
  if (filter === "all") return true;
  return sourceKind === filter;
}
