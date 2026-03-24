import type { QueryClient } from "@tanstack/react-query";

type WorkspaceLikeRecord = {
  id?: unknown;
  name?: unknown;
};

function isWorkspaceRecord(value: unknown): value is WorkspaceLikeRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as WorkspaceLikeRecord;
  return (
    typeof record.id === "string" ||
    record.id === null ||
    typeof record.name === "string" ||
    record.name === null
  );
}

function isWorkspaceScopedQueryKey(
  queryKey: readonly unknown[],
  workspaceId: string,
) {
  if (!queryKey.includes(workspaceId)) return false;
  return queryKey.some(
    (part) => typeof part === "string" && part.includes("workspace"),
  );
}

export async function refreshWorkspaceNameAcrossApp(
  queryClient: QueryClient,
  workspaceId: string,
  workspaceName: string,
) {
  queryClient.setQueriesData(
    {
      predicate: (query) =>
        isWorkspaceScopedQueryKey(query.queryKey, workspaceId),
    },
    (oldData) => {
      if (!oldData) return oldData;
      if (Array.isArray(oldData)) return oldData;
      if (!isWorkspaceRecord(oldData)) return oldData;
      return { ...oldData, name: workspaceName };
    },
  );

  await queryClient.invalidateQueries({
    predicate: (query) =>
      isWorkspaceScopedQueryKey(query.queryKey, workspaceId),
  });
}
