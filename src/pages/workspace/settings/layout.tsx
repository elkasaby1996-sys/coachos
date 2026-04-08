import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useOutletContext, useParams } from "react-router-dom";
import {
  SettingsHeader,
  SettingsPageShell,
  SettingsSectionCard,
  SettingsTabs,
  type SettingsTabLink,
} from "../../../features/settings/components/settings-primitives";
import { useWorkspaceSettingsAccess } from "../../../features/settings/hooks/use-workspace-settings-access";
import { workspaceSettingsTabs } from "../../../features/settings/lib/settings-route-mapping";
import { supabase } from "../../../lib/supabase";

type WorkspaceSettingsRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
  owner_user_id: string | null;
  default_checkin_template_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WorkspaceSettingsOutletContext = {
  workspaceId: string;
  canManage: boolean;
  isOwner: boolean;
  role: string | null;
  workspace: WorkspaceSettingsRow | null;
};

export function useWorkspaceSettingsOutletContext() {
  return useOutletContext<WorkspaceSettingsOutletContext>();
}

export function WorkspaceSettingsLayoutPage() {
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId: string }>();
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
      <SettingsPageShell
        header={
          <SettingsHeader
            scope="Workspace"
            title="Workspace Settings"
            description="Verifying workspace access and loading settings..."
          />
        }
        tabs={<SettingsTabs tabs={tabs} />}
      >
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
      header={
        <SettingsHeader
          scope="Workspace"
          title={workspaceQuery.data?.name?.trim() || "Workspace Settings"}
          description="Manage how this workspace operates, appears to clients, and handles team workflows."
        />
      }
      tabs={<SettingsTabs tabs={tabs} />}
      rightRail={
        <SettingsSectionCard
          title="Workspace Scope"
          description="These settings affect only this workspace."
        >
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Workspace ID:{" "}
              <span className="font-mono text-foreground">{resolvedWorkspaceId}</span>
            </p>
            <p>
              Your role:{" "}
              <span className="text-foreground">{access.role ?? "Unknown"}</span>
            </p>
            <p>
              Access level:{" "}
              <span className="text-foreground">
                {access.canManage ? "Can manage settings" : "Read-only"}
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
