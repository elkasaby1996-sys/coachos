import type { AccountType } from "./account-profiles";

export function canUseBootstrapForProtectedRoute(params: {
  allow: Array<"pt" | "client">;
  accountType: AccountType;
  bootstrapResolved: boolean;
  bootstrapStale: boolean;
  bootstrapUserId: string | null;
  currentUserId: string | null | undefined;
}) {
  if (params.bootstrapResolved) return true;
  if (!params.bootstrapStale) return false;
  if (
    !params.currentUserId ||
    params.bootstrapUserId !== params.currentUserId
  ) {
    return false;
  }
  return (
    (params.accountType === "pt" || params.accountType === "client") &&
    params.allow.includes(params.accountType)
  );
}
