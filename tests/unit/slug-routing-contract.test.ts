import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appRoutes = readFileSync("src/routes/app.tsx", "utf8");
const workspaceSettingsLayout = readFileSync(
  "src/pages/workspace/settings/layout.tsx",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260509210000_slug_based_routes.sql",
  "utf8",
);
const ptHub = readFileSync("src/features/pt-hub/lib/pt-hub.ts", "utf8");
const ptClientsPage = readFileSync("src/pages/pt/clients.tsx", "utf8");

describe("slug based routing contract", () => {
  it("adds canonical public, workspace, settings, and client routes", () => {
    expect(appRoutes).toContain('path="/p/:ptSlug"');
    expect(appRoutes).toContain('path="/p/:ptSlug/apply"');
    expect(appRoutes).toContain('path="/p/:ptSlug/book"');
    expect(appRoutes).toContain('path="/w/:workspaceSlug"');
    expect(appRoutes).toContain('path="settings"');
    expect(appRoutes).toContain('path="clients/:clientUrlKey"');
  });

  it("keeps legacy routes as resolvers rather than deleting old bookmarks", () => {
    expect(appRoutes).toContain("LegacyWorkspaceSettingsRedirect");
    expect(appRoutes).toContain("LegacyClientRedirect");
    expect(appRoutes).toContain("LegacyPublicProfileRedirect");
    expect(appRoutes).toContain("/workspace/:workspaceId");
    expect(appRoutes).toContain("/coach/:slug");
  });

  it("resolves workspace settings by slug but exposes internal workspace IDs to settings tabs", () => {
    expect(workspaceSettingsLayout).toContain("workspaceSlug");
    expect(workspaceSettingsLayout).toContain(".eq(\"slug\", routeWorkspaceSlug");
    expect(workspaceSettingsLayout).toContain("workspaceId: resolvedWorkspaceId");
  });

  it("adds route lookup columns and privacy-preserving client url keys", () => {
    expect(migration).toContain("alter table public.workspaces");
    expect(migration).toContain("add column if not exists slug text");
    expect(migration).toContain("alter table public.clients");
    expect(migration).toContain("add column if not exists url_key text");
    expect(migration).toContain("c-");
    expect(migration).toContain("clients_workspace_url_key_uidx");
    expect(migration).not.toMatch(/url_key[^\n]+display_name/i);
  });

  it("updates primary app links to route builders for shared workspace and client URLs", () => {
    expect(ptHub).toContain("slug");
    expect(ptClientsPage).toContain("routes.clientDetail");
    expect(ptClientsPage).toContain("client.urlKey");
  });
});
