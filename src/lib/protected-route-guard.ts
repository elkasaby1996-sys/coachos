import { matchPath } from "react-router-dom";
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

// Match the existing router: a trailing slash is valid, descendants are not.
export function isPreWorkspacePtRouteAllowed(pathname: string) {
  return Boolean(
    matchPath({ path: "/pt-hub/settings/billing", end: true }, pathname),
  );
}

function getClientAccountOnboardingPath(inviteToken: string | null) {
  if (!inviteToken) return "/client/onboarding/account";
  return `/client/onboarding/account?invite=${encodeURIComponent(inviteToken)}`;
}

export function getProtectedRedirect(params: {
  pathname: string;
  allow: Array<"pt" | "client">;
  accountType: "pt" | "client" | "unknown";
  hasWorkspaceMembership: boolean;
  ptWorkspaceComplete: boolean;
  hasPtIdentity: boolean;
  ptProfileComplete: boolean;
  clientAccountComplete: boolean;
  clientWorkspaceOnboardingHardGateRequired: boolean;
  pendingInviteToken: string | null;
}) {
  if (params.accountType === "pt") {
    const preWorkspaceBilling =
      params.allow.includes("pt") &&
      params.hasPtIdentity &&
      isPreWorkspacePtRouteAllowed(params.pathname);
    if (!params.ptWorkspaceComplete && !preWorkspaceBilling) {
      return "/pt/onboarding/workspace";
    }
    if (!params.allow.includes("pt")) {
      return "/pt-hub";
    }
    return null;
  }

  if (params.accountType === "client") {
    if (!params.clientAccountComplete) {
      return getClientAccountOnboardingPath(params.pendingInviteToken);
    }
    if (!params.hasWorkspaceMembership) {
      if (
        params.allow.includes("client") &&
        (params.pathname.startsWith("/app/") ||
          params.pathname.startsWith("/app/messages") ||
          params.pathname.startsWith("/app/settings"))
      ) {
        return null;
      }
      return "/app/home";
    }
    if (
      params.clientWorkspaceOnboardingHardGateRequired &&
      !params.pathname.startsWith("/app/onboarding") &&
      !params.pathname.startsWith("/app/home")
    ) {
      return "/app/onboarding";
    }
    if (!params.allow.includes("client")) {
      return "/app/home";
    }
    return null;
  }

  return "/no-workspace";
}
