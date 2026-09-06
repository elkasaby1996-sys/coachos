export type PtHubSettingsTab =
  | "account"
  | "notifications"
  | "preferences"
  | "security"
  | "billing"
  | "integrations";

export type WorkspaceSettingsTab =
  | "general"
  | "client-experience"
  | "team"
  | "defaults"
  | "automations"
  | "integrations"
  | "danger-zone";

export const routes = {
  ptHub: () => "/pt-hub",
  ptHubSettings: (tab: PtHubSettingsTab = "account") =>
    `/pt-hub/settings/${tab}`,

  workspaceOverview: (workspaceSlug: string) => `/w/${workspaceSlug}/overview`,
  workspaceLeads: (workspaceSlug: string) => `/w/${workspaceSlug}/leads`,
  workspaceClients: (workspaceSlug: string) => `/w/${workspaceSlug}/clients`,
  clientDetail: (workspaceSlug: string, clientUrlKey: string) =>
    `/w/${workspaceSlug}/clients/${clientUrlKey}`,
  workspaceCheckIns: (workspaceSlug: string) => `/w/${workspaceSlug}/check-ins`,
  workspaceAnalytics: (workspaceSlug: string) =>
    `/w/${workspaceSlug}/analytics`,
  workspaceSettings: (
    workspaceSlug: string,
    tab: WorkspaceSettingsTab = "general",
  ) => `/w/${workspaceSlug}/settings/${tab}`,

  publicProfile: (ptSlug: string) => `/p/${ptSlug}`,
  publicApply: (ptSlug: string) => `/p/${ptSlug}/apply`,
  publicBook: (ptSlug: string) => `/p/${ptSlug}/book`,
};

export function appendSearchParams(path: string, search: string) {
  if (!search || search === "?") return path;
  return `${path}${search.startsWith("?") ? search : `?${search}`}`;
}
