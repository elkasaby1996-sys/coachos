export type SelectableClientProfile = {
  id: string;
  workspace_id: string | null;
  relationship_status?: string | null;
  created_at?: string | null;
};

function isActiveWorkspaceRelationship(row: SelectableClientProfile) {
  return (
    Boolean(row.workspace_id) && (row.relationship_status ?? "active") === "active"
  );
}

const getCreatedAtRank = (row: SelectableClientProfile) => {
  if (!row.created_at) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(row.created_at).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

export function selectActiveClientProfile<T extends SelectableClientProfile>(
  rows: T[] | null | undefined,
  activeClientId: string | null | undefined,
): T | null {
  const profiles = rows ?? [];
  if (profiles.length === 0) return null;

  if (activeClientId) {
    const active = profiles.find((row) => row.id === activeClientId);
    if (active) return active;
  }

  const workspaceProfiles = profiles
    .filter(isActiveWorkspaceRelationship)
    .sort((a, b) => getCreatedAtRank(a) - getCreatedAtRank(b));
  if (workspaceProfiles[0]) return workspaceProfiles[0];

  return [...profiles].sort(
    (a, b) => getCreatedAtRank(a) - getCreatedAtRank(b),
  )[0]!;
}
