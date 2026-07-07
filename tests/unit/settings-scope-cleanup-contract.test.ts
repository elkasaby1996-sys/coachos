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
const settingsPrimitives = readSource(
  "src",
  "features",
  "settings",
  "components",
  "settings-primitives.tsx",
);

describe("settings scope cleanup contract", () => {
  it("keeps workspace brand folded into general settings", () => {
    expect(routeMapping).not.toContain('id: "brand"');
    expect(lazyPages).not.toContain("WorkspaceSettingsBrandTab");
    expect(workspaceGeneral).toContain("Workspace logo");
    expect(workspaceGeneral).toContain("logo_url");
  });

  it("redirects legacy workspace brand settings links to general", () => {
    expect(appRoutes).toContain('path="brand"');
    expect(appRoutes).toContain('to="../general"');
    expect(appRoutes).not.toContain("<WorkspaceSettingsBrandTab />");
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

  it("keeps settings field labels aligned to their input controls", () => {
    expect(settingsPrimitives).toContain(
      "lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]",
    );
    expect(settingsPrimitives).toContain(
      'className="flex min-h-[2.75rem] items-center"',
    );
    expect(settingsPrimitives).toContain('className="min-w-0 space-y-3"');
  });

  it("keeps workspace automations free of global notification channel controls", () => {
    expect(workspaceAutomations).toContain("Missed check-in reminders");
    expect(workspaceAutomations).toContain("Onboarding reminders");
    expect(workspaceAutomations).not.toContain("email_enabled");
    expect(workspaceAutomations).not.toContain("push_enabled");
    expect(workspaceAutomations).not.toContain("product_updates");
  });
});
