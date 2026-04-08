export type SettingsScope = "pt-hub" | "workspace";

export type SettingsTabConfig = {
  id: string;
  label: string;
  description: string;
  path: string;
  scope: SettingsScope;
};

export const ptHubSettingsTabs: SettingsTabConfig[] = [
  {
    id: "account",
    label: "Account",
    description: "Identity and business account settings.",
    path: "account",
    scope: "pt-hub",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Control PT Hub alerting preferences.",
    path: "notifications",
    scope: "pt-hub",
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "Theme and personal app defaults.",
    path: "preferences",
    scope: "pt-hub",
  },
  {
    id: "security",
    label: "Security",
    description: "Password and account protection.",
    path: "security",
    scope: "pt-hub",
  },
  {
    id: "billing",
    label: "Billing",
    description: "Plan and billing overview.",
    path: "billing",
    scope: "pt-hub",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Connected services and future integrations.",
    path: "integrations",
    scope: "pt-hub",
  },
];

export const workspaceSettingsTabs: SettingsTabConfig[] = [
  {
    id: "general",
    label: "General",
    description: "Core workspace operating details.",
    path: "general",
    scope: "workspace",
  },
  {
    id: "brand",
    label: "Brand",
    description: "Client-facing workspace branding.",
    path: "brand",
    scope: "workspace",
  },
  {
    id: "client-experience",
    label: "Client Experience",
    description: "Onboarding and module behavior.",
    path: "client-experience",
    scope: "workspace",
  },
  {
    id: "team",
    label: "Team",
    description: "Members, roles, and invites.",
    path: "team",
    scope: "workspace",
  },
  {
    id: "defaults",
    label: "Defaults",
    description: "Template and default workflow behavior.",
    path: "defaults",
    scope: "workspace",
  },
  {
    id: "automations",
    label: "Automations",
    description: "Reminder and risk automation settings.",
    path: "automations",
    scope: "workspace",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Workspace-level integrations.",
    path: "integrations",
    scope: "workspace",
  },
  {
    id: "danger",
    label: "Danger Zone",
    description: "Destructive workspace actions.",
    path: "danger",
    scope: "workspace",
  },
];

export type LegacySettingsSection =
  | "workspace"
  | "public-profile"
  | "account"
  | "billing"
  | "appearance"
  | "defaults"
  | "danger";

export function buildWorkspaceSettingsPath(params: {
  workspaceId: string;
  tab: string;
}) {
  return `/workspace/${params.workspaceId}/settings/${params.tab}`;
}

export function buildPtHubSettingsPath(tab: string) {
  return `/pt-hub/settings/${tab}`;
}

export function mapLegacySettingsRoute(params: {
  section: string | undefined;
  workspaceId: string | null;
}) {
  const section = (params.section ?? "workspace") as LegacySettingsSection;

  switch (section) {
    case "public-profile":
      return "/pt-hub/profile";
    case "account":
      return buildPtHubSettingsPath("account");
    case "billing":
      return buildPtHubSettingsPath("billing");
    case "appearance":
      return buildPtHubSettingsPath("preferences");
    case "workspace":
    case "defaults":
    case "danger": {
      if (!params.workspaceId) return "/no-workspace";
      const tab =
        section === "workspace"
          ? "general"
          : section === "defaults"
            ? "defaults"
            : "danger";
      return buildWorkspaceSettingsPath({ workspaceId: params.workspaceId, tab });
    }
    default:
      if (!params.workspaceId) return "/no-workspace";
      return buildWorkspaceSettingsPath({
        workspaceId: params.workspaceId,
        tab: "general",
      });
  }
}
