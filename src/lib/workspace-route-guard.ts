export type WorkspaceRouteGuardDecision = "loading" | "redirect" | "render";

export function getWorkspaceRouteGuardDecision(params: {
  routeLoading: boolean;
  accessLoading: boolean;
  routeWorkspaceId: string | null | undefined;
  accessWorkspaceId: string | null | undefined;
  routeError: unknown;
  accessError: unknown;
}): WorkspaceRouteGuardDecision {
  if (params.routeLoading) return "loading";
  if (params.routeError || !params.routeWorkspaceId) return "redirect";
  if (params.accessLoading) return "loading";
  if (params.accessError) return "redirect";
  if (params.accessWorkspaceId !== params.routeWorkspaceId) return "redirect";
  return "render";
}
