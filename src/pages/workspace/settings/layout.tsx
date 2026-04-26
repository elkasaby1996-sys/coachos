import { useQuery } from "@tanstack/react-query";
import {
  Navigate,
  Outlet,
  useParams,
} from "react-router-dom";
import {
  SettingsPageShell,
  SettingsSectionCard,
  SettingsTabs,
  type SettingsTabLink,
} from "../../../features/settings/components/settings-primitives";
import { useWorkspaceSettingsAccess } from "../../../features/settings/hooks/use-workspace-settings-access";
import { workspaceSettingsTabs } from "../../../features/settings/lib/settings-route-mapping";
import { supabase } from "../../../lib/supabase";
import { type WorkspaceSettingsOutletContext } from "./outlet-context";

type WorkspaceSettingsRow = WorkspaceSettingsOutletContext["workspace"];

export function WorkspaceSettingsLayoutPage() {
  const { workspaceId: routeWorkspaceId } = useParams<{
    workspaceId: string;
  }>();
  const access = useWorkspaceSettingsAccess(routeWorkspaceId);

  const workspaceQuery = useQuery({
    queryKey: ["workspace-settings-shell", routeWorkspaceId],
    enabled: Boolean(routeWorkspaceId && access.isAuthorized),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select(
          "id, name, logo_url, owner_user_id, default_checkin_template_id, created_at, updated_at",
        )
        .eq("id", routeWorkspaceId ?? "")
        .maybeSingle();
      if (error) throw error;

      return (data ?? null) as WorkspaceSettingsRow | null;
    },
  });

  const resolvedWorkspaceId = routeWorkspaceId ?? access.fallbackWorkspaceId;

  if (!resolvedWorkspaceId) {
    return <Navigate to="/no-workspace" replace />;
  }

  if (!access.loading && !access.isAuthorized) {
    if (access.fallbackWorkspaceId) {
      return (
        <Navigate
          to={`/workspace/${access.fallbackWorkspaceId}/settings/general`}
          replace
        />
      );
    }
    return <Navigate to="/no-workspace" replace />;
  }

  const tabs: SettingsTabLink[] = workspaceSettingsTabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    description: tab.description,
    to: `/workspace/${resolvedWorkspaceId}/settings/${tab.path}`,
  }));

  if (access.loading) {
    return (
      <SettingsPageShell tabs={<SettingsTabs tabs={tabs} />}>
        <SettingsSectionCard
          title="Loading"
          description="Checking workspace membership and permissions."
        >
          <p className="text-sm text-muted-foreground">
            Please wait while we load your workspace settings.
          </p>
        </SettingsSectionCard>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      tabs={<SettingsTabs tabs={tabs} />}
      rightRail={
        <SettingsSectionCard
          title="Workspace Scope"
          description="These settings affect only this workspace."
        >
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Workspace ID:{" "}
              <span className="font-mono text-foreground">
                {resolvedWorkspaceId}
              </span>
            </p>
          </div>
        </SettingsSectionCard>
      }
    >
      <Outlet
        context={
          {
            workspaceId: resolvedWorkspaceId,
            canManage: access.canManage,
            isOwner: access.isOwner,
            role: access.role,
            workspace: workspaceQuery.data ?? null,
          } satisfies WorkspaceSettingsOutletContext
        }
      />
    </SettingsPageShell>
  );
}
