import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ptHubLib = readFileSync("src/features/pt-hub/lib/pt-hub.ts", "utf8");
const ptHubTypes = readFileSync("src/features/pt-hub/types.ts", "utf8");
const workspaceCard = readFileSync(
  "src/features/pt-hub/components/pt-hub-workspace-card.tsx",
  "utf8",
);
const workspacesPage = readFileSync("src/pages/pt-hub/workspaces.tsx", "utf8");
const switcherMenu = readFileSync(
  "src/components/common/workspace-switcher-menu.tsx",
  "utf8",
);
const ptLayout = readFileSync("src/components/layouts/pt-layout.tsx", "utf8");
const ptHubLayout = readFileSync(
  "src/components/layouts/pt-hub-layout.tsx",
  "utf8",
);
const appRoutes = readFileSync("src/routes/app.tsx", "utf8");
const appStyles = readFileSync("src/styles/style.css", "utf8");

describe("PT Hub shared workspace contract", () => {
  it("models owned and shared workspace relations in the PT Hub type", () => {
    expect(ptHubTypes).toContain(
      'export type PTWorkspaceRelation = "owned" | "shared"',
    );
    expect(ptHubTypes).toContain("ownerName: string | null");
    expect(ptHubTypes).toContain("assignedClientCount: number | null");
    expect(ptHubTypes).toContain(
      "clientAccessMode: PTWorkspaceClientAccessMode",
    );
  });

  it("queries owned workspaces and active shared memberships only", () => {
    expect(ptHubLib).toContain('.eq("owner_user_id", userId)');
    expect(ptHubLib).toContain('.from("workspace_members")');
    expect(ptHubLib).toContain('.eq("status", "active")');
    expect(ptHubLib).toContain('normalizeWorkspaceRole(row.role) !== "owner"');
    expect(ptHubLib).not.toContain("workspace_member_invites");
  });

  it("deduplicates owned workspaces over member rows", () => {
    expect(ptHubLib).toContain(
      "const isOwned = workspace.owner_user_id === userId",
    );
    expect(ptHubLib).toContain('const relation = isOwned ? "owned" : "shared"');
    expect(ptHubLib).toContain("const role = isOwned");
    expect(ptHubLib).toContain('? "owner"');
  });

  it("renders the shared workspace role label and access summaries", () => {
    expect(workspaceCard).toContain("Shared workspace ·");
    expect(workspaceCard).toContain("Owned by");
    expect(workspaceCard).toContain("All clients");
    expect(workspaceCard).toContain("No clients assigned");
    expect(workspaceCard).toContain("assigned clients");
  });

  it("does not duplicate workspace relation and role as card tags", () => {
    expect(workspaceCard).not.toContain("components/ui/badge");
    expect(workspaceCard).not.toContain("Shared workspace\" : \"Owned");
    expect(workspaceCard).not.toContain('<Badge variant="muted"');
  });

  it("highlights accepted invite redirects on PT Hub workspaces", () => {
    expect(workspacesPage).toContain("acceptedWorkspace");
    expect(workspacesPage).toContain("Workspace added to your PT Hub");
    expect(workspacesPage).toContain(
      "highlighted={workspace.id === acceptedWorkspaceId}",
    );
  });

  it("opens workspace cards through canonical slug routes while preserving legacy entry redirects", () => {
    expect(workspacesPage).toContain(
      "routes.workspaceOverview(workspace.slug)",
    );
    expect(appRoutes).toContain('path="/workspace/:workspaceId"');
    expect(appRoutes).toContain("LegacyWorkspaceEntryRedirect");
    expect(appRoutes).toContain('path="/w/:workspaceSlug"');
  });

  it("shows shared role labels in both workspace switchers", () => {
    expect(switcherMenu).toContain("meta={workspace.meta}");
    expect(ptLayout).toContain("Shared workspace ·");
    expect(ptHubLayout).toContain("Shared workspace ·");
    expect(ptLayout).toContain("usePtHubWorkspaces");
    expect(ptHubLayout).toContain("usePtHubWorkspaces");
  });

  it("keeps the workspace switcher menu on the header surface color system", () => {
    expect(switcherMenu).toContain("app-workspace-switcher-menu w-72");
    expect(appStyles).toContain(".app-workspace-switcher-menu");
    expect(appStyles).toContain("--menu-surface-bg");
    expect(appStyles).toContain("oklch(var(--bg-surface-elevated) / 0.86)");
  });
});
