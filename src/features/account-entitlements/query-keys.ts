import type { QueryClient } from "@tanstack/react-query";

export const accountEntitlementKeys = {
  all: ["account-entitlements"] as const,
  owner: (userId: string | undefined) =>
    ["account-entitlements", "owner", userId] as const,
  workspace: (
    userId: string | undefined,
    workspaceId: string | null | undefined,
  ) => ["account-entitlements", "workspace", userId, workspaceId] as const,
};
/** Also use after future subscription mutations; invalidate both owner/workspace projections. */
export function invalidateAccountEntitlements(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: accountEntitlementKeys.all,
  });
}
