import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useParams } from "react-router-dom";
import {
  SettingsPageShell,
  SettingsSectionCard,
  SettingsTabs,
  type SettingsTabLink,
} from "../../../features/settings/components/settings-primitives";
import { useWorkspaceSettingsAccess } from "../../../features/settings/hooks/use-workspace-settings-access";
import { workspaceSettingsTabs } from "../../../features/settings/lib/settings-route-mapping";
import { routes, type WorkspaceSettingsTab } from "../../../lib/routes";
import { supabase } from "../../../lib/supabase";
import {
  getCompactWorkspaceId,
  getWorkspaceRouteSlug,
  resolveWorkspaceRouteParam,
} from "../../../lib/workspace-route-resolution";
import { type WorkspaceSettingsOutletContext } from "./outlet-context";

type WorkspaceSettingsRow = WorkspaceSettingsOutletContext["workspace"];

export function WorkspaceSettingsLayoutPage() {
  const { workspaceId: routeWorkspaceId } = useParams<{
    workspaceId: string;
  }>();
  const { workspaceSlug: routeWorkspaceSlug } = useParams<{
    workspaceSlug: string;
  }>();
  const slugWorkspaceQuery = useQuery({
    queryKey: ["workspace-settings-slug", routeWorkspaceSlug],
    enabled: Boolean(routeWorkspaceSlug && !routeWorkspaceId),
    queryFn: async () => {
      return await resolveWorkspaceRouteParam(routeWorkspaceSlug);
    },
  });
  const isResolvingRouteWorkspace = Boolean(
    routeWorkspaceSlug && !routeWorkspaceId && slugWorkspaceQuery.isLoading,
  );
  const resolvedRouteWorkspaceId =
    routeWorkspaceId ?? slugWorkspaceQuery.data?.id;
  const access = useWorkspaceSettingsAccess(resolvedRouteWorkspaceId);

  const workspaceQuery = useQuery({
    queryKey: ["workspace-settings-shell", resolvedRouteWorkspaceId],
    enabled: Boolean(resolvedRouteWorkspaceId && access.isAuthorized),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select(
          "id, name, slug, logo_url, owner_user_id, default_checkin_template_id, timezone, unit_preference, week_start_day, client_welcome_message, created_at, updated_at",
        )
        .eq("id", resolvedRouteWorkspaceId ?? "")
        .maybeSingle();
      if (error) throw error;

      return (data ?? null) as WorkspaceSettingsRow | null;
    },
  });

  const resolvedWorkspaceId =
    resolvedRouteWorkspaceId ?? access.fallbackWorkspaceId;

  if (isResolvingRouteWorkspace || access.loading) {
    return (
      <SettingsPageShell tabs={<SettingsTabs tabs={[]} />}>
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

  if (!resolvedWorkspaceId) {
    return <Navigate to="/no-workspace" replace />;
  }

  if (!access.loading && !access.isAuthorized) {
    if (access.fallbackWorkspaceId) {
      return (
        <Navigate
          to={routes.workspaceSettings(
            getCompactWorkspaceId(access.fallbackWorkspaceId),
            "general",
          )}
          replace
        />
      );
    }
    return <Navigate to="/no-workspace" replace />;
  }

  const resolvedWorkspaceRouteSlug = workspaceQuery.data
    ? getWorkspaceRouteSlug({
        id: workspaceQuery.data.id,
        slug: workspaceQuery.data.slug ?? null,
      })
    : slugWorkspaceQuery.data
      ? getWorkspaceRouteSlug(slugWorkspaceQuery.data)
      : (routeWorkspaceSlug ?? getCompactWorkspaceId(resolvedWorkspaceId));

  const tabs: SettingsTabLink[] = workspaceSettingsTabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    description: tab.description,
    to: routes.workspaceSettings(
      resolvedWorkspaceRouteSlug,
      tab.path as WorkspaceSettingsTab,
    ),
  }));

  return (
    <SettingsPageShell tabs={<SettingsTabs tabs={tabs} />}>
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
