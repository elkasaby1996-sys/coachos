import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

const appRoutes = readSource("src", "routes", "app.tsx");
const lazyPages = readSource("src", "routes", "lazy-pages.ts");
const routeMapping = readSource(
  "src",
  "features",
  "settings",
  "lib",
  "settings-route-mapping.ts",
);
const ptAccount = readSource(
  "src",
  "pages",
  "pt-hub",
  "settings",
  "tabs",
  "account.tsx",
);
const ptNotifications = readSource(
  "src",
  "pages",
  "pt-hub",
  "settings",
  "tabs",
  "notifications.tsx",
);
const ptSecurity = readSource(
  "src",
  "pages",
  "pt-hub",
  "settings",
  "tabs",
  "security.tsx",
);
const workspaceGeneral = readSource(
  "src",
  "pages",
  "workspace",
  "settings",
  "tabs",
  "general.tsx",
);
const workspaceAutomations = readSource(
  "src",
  "pages",
  "workspace",
  "settings",
  "tabs",
  "automations.tsx",
);
const workspaceBrand = readSource(
  "src",
  "pages",
  "workspace",
  "settings",
  "tabs",
  "brand.tsx",
);

describe("settings scope cleanup contract", () => {
  it("keeps workspace brand as a first-class workspace settings tab", () => {
    expect(routeMapping).toContain('id: "brand"');
    expect(lazyPages).toContain("WorkspaceSettingsBrandTab");
    expect(appRoutes).toContain(
      'path="brand" element={<WorkspaceSettingsBrandTab />}',
    );
  });

  it("keeps workspace brand saves scoped to workspace brand fields only", () => {
    expect(workspaceBrand).toContain('.from("workspaces")');
    expect(workspaceBrand).toContain("logo_url");
    expect(workspaceBrand).not.toContain("pt_hub_settings");
    expect(workspaceBrand).not.toContain("notification_preferences");
    expect(workspaceBrand).not.toContain("supabase.auth");
    expect(workspaceBrand).not.toContain("subscription");
  });

  it("keeps PT Hub account free of public profile visibility and workspace branding edits", () => {
    expect(ptAccount).not.toContain("profileVisibility");
    expect(ptAccount).not.toContain("logo_url");
    expect(ptAccount).not.toContain("Workspace logo");
    expect(ptAccount).not.toContain("workspaceName");
  });

  it("keeps PT Hub notifications global and outside workspace automation rules", () => {
    expect(ptNotifications).toContain("useNotificationPreferences");
    expect(ptNotifications).toContain("weekly_digest");
    expect(ptNotifications).toContain("product_updates");
    expect(ptNotifications).not.toContain("inactivity");
    expect(ptNotifications).not.toContain("Onboarding reminders");
    expect(ptNotifications).not.toContain("workspaceId");
  });

  it("keeps PT Hub security outside workspace team permissions", () => {
    expect(ptSecurity).toContain("supabase.auth.updateUser");
    expect(ptSecurity).not.toContain("workspace_members");
    expect(ptSecurity).not.toContain("Invite team member");
  });

  it("keeps workspace general free of account billing and auth controls", () => {
    expect(workspaceGeneral).toContain("Workspace display name");
    expect(workspaceGeneral).not.toContain("subscription");
    expect(workspaceGeneral).not.toContain("password");
    expect(workspaceGeneral).not.toContain("Account email");
  });

  it("keeps workspace automations free of global notification channel controls", () => {
    expect(workspaceAutomations).toContain("Missed check-in reminders");
    expect(workspaceAutomations).toContain("Onboarding reminders");
    expect(workspaceAutomations).not.toContain("email_enabled");
    expect(workspaceAutomations).not.toContain("push_enabled");
    expect(workspaceAutomations).not.toContain("product_updates");
  });
});
