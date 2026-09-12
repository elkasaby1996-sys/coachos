export const commercialAccessKeys = {
  owner: (userId: string | undefined) =>
    ["commercial-access", userId, "owner"] as const,
  workspace: (userId: string | undefined, workspaceId: string | null) =>
    ["commercial-access", userId, "workspace", workspaceId] as const,
  client: (userId: string | undefined, clientId: string | null) =>
    ["commercial-access", userId, "client", clientId] as const,
};
