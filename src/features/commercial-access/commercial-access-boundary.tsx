import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useWorkspace } from "../../lib/use-workspace";
import {
  useCommercialAccess,
  useWorkspaceCommercialAccess,
} from "./use-commercial-access";
import { CommercialAccessBanner } from "./commercial-access-banner";
import { SubscriptionRecoveryScreen } from "./subscription-recovery-screen";
export function CommercialAccessBoundary({
  children,
  scope,
}: {
  children: ReactNode;
  scope: "owner" | "workspace";
}) {
  const { pathname } = useLocation();
  const { workspaceId } = useWorkspace();
  const ownerQuery = useCommercialAccess(scope === "owner");
  const workspaceQuery = useWorkspaceCommercialAccess(
    scope === "workspace" ? workspaceId : null,
  );
  const query = scope === "owner" ? ownerQuery : workspaceQuery;
  const recoveryRoute =
    scope === "owner" && /^\/pt-hub\/settings(?:\/|$)/.test(pathname);
  if (query.isPending && !recoveryRoute)
    return <p role="status">Checking account access…</p>;
  if (query.isError && !recoveryRoute)
    return (
      <SubscriptionRecoveryScreen
        owner={scope === "owner"}
        error
        onRetry={() => void query.refetch()}
      />
    );
  const data = query.data;
  if (!data && !recoveryRoute) return null;
  const bootstrapRoute =
    scope === "owner" &&
    data?.accessMode === "onboarding" &&
    pathname === "/pt-hub/workspaces";
  if (
    data &&
    ["none", "onboarding"].includes(data.accessMode) &&
    !recoveryRoute &&
    !bootstrapRoute
  )
    return <SubscriptionRecoveryScreen owner={data.canManageBilling} />;
  const businessRoute =
    scope === "owner"
      ? /^\/pt-hub\/(profile|packages|leads|settings\/integrations)(?:\/|$)/.test(
          pathname,
        )
      : /\/(settings|leads)(?:\/|$)/.test(pathname);
  const disabled =
    !!data &&
    !bootstrapRoute &&
    (!recoveryRoute || businessRoute) &&
    (data.accessMode === "read_only" ||
      data.accessMode === "none" ||
      (businessRoute && data.accessMode !== "full"));
  return (
    <>
      {data ? (
        <CommercialAccessBanner
          mode={data.accessMode}
          owner={data.canManageBilling}
          reason={"reason" in data ? data.reason : undefined}
        />
      ) : null}
      {/* Keep recovery children mounted while the access request resolves. */}
      <fieldset disabled={disabled} className="min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </>
  );
}
