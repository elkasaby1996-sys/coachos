import { supabase } from "./supabase";
import {
  appendSearchParams,
  routes,
  type WorkspaceSettingsTab,
} from "./routes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceRouteRow = {
  id: string;
  slug: string | null;
};

export function getCompactWorkspaceId(workspaceId: string) {
  return workspaceId.split("-").join("").slice(0, 12).toLowerCase();
}

export function getWorkspaceRouteSlug(workspace: WorkspaceRouteRow) {
  return workspace.slug?.trim() || getCompactWorkspaceId(workspace.id);
}

export function buildLegacyWorkspaceEntryRedirectPath(
  workspace: WorkspaceRouteRow,
  search = "",
) {
  return appendSearchParams(
    routes.workspaceOverview(getWorkspaceRouteSlug(workspace)),
    search,
  );
}

export function buildLegacyWorkspaceSettingsRedirectPath(params: {
  workspace: WorkspaceRouteRow;
  tab?: string | null;
  search?: string;
}) {
  const nextTab = params.tab || "general";
  const canonicalTab = (
    nextTab === "danger" ? "danger-zone" : nextTab
  ) as WorkspaceSettingsTab;

  return appendSearchParams(
    routes.workspaceSettings(
      getWorkspaceRouteSlug(params.workspace),
      canonicalTab,
    ),
    params.search ?? "",
  );
}

export function workspaceMatchesRouteParam(
  workspace: WorkspaceRouteRow,
  routeParam: string | null | undefined,
) {
  const normalizedParam = routeParam?.trim().toLowerCase() ?? "";
  if (!normalizedParam) return false;

  return (
    workspace.slug?.trim().toLowerCase() === normalizedParam ||
    workspace.id.toLowerCase() === normalizedParam ||
    getCompactWorkspaceId(workspace.id) === normalizedParam
  );
}

export async function resolveWorkspaceRouteParam(
  routeParam: string | null | undefined,
) {
  const normalizedParam = routeParam?.trim().toLowerCase() ?? "";
  if (!normalizedParam) return null;

  if (UUID_PATTERN.test(normalizedParam)) {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, slug")
      .eq("id", normalizedParam)
      .maybeSingle<WorkspaceRouteRow>();
    if (error) throw error;
    if (data) return data;
  }

  const { data: slugMatch, error: slugError } = await supabase
    .from("workspaces")
    .select("id, slug")
    .eq("slug", normalizedParam)
    .maybeSingle<WorkspaceRouteRow>();
  if (slugError) throw slugError;
  if (slugMatch) return slugMatch;

  const { data: accessibleWorkspaces, error: accessibleWorkspacesError } =
    await supabase
      .from("workspaces")
      .select("id, slug")
      .limit(500)
      .returns<WorkspaceRouteRow[]>();

  if (accessibleWorkspacesError) throw accessibleWorkspacesError;

  return (
    (accessibleWorkspaces ?? []).find((workspace) =>
      workspaceMatchesRouteParam(workspace, normalizedParam),
    ) ?? null
  );
}
