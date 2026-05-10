import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("workspace route resolution contract", () => {
  it("supports readable slugs plus compact workspace-id fallback links", () => {
    const resolver = read("src/lib/workspace-route-resolution.ts");
    const slugRoutes = read("src/routes/slug-route-resolvers.tsx");
    const settingsLayout = read("src/pages/workspace/settings/layout.tsx");
    const ptHub = read("src/features/pt-hub/lib/pt-hub.ts");

    expect(resolver).toContain("getCompactWorkspaceId");
    expect(resolver).toContain("workspaceMatchesRouteParam");
    expect(resolver).toContain("resolveWorkspaceRouteParam");
    expect(resolver).toContain('.eq("slug", normalizedParam)');
    expect(resolver).toContain("getCompactWorkspaceId(workspace.id)");
    expect(slugRoutes).toContain("resolveWorkspaceRouteParam(workspaceSlug)");
    expect(settingsLayout).toContain(
      "resolveWorkspaceRouteParam(routeWorkspaceSlug)",
    );
    expect(ptHub).toContain("getWorkspaceRouteSlug(workspace)");
  });

  it("gives not-found route screens app-styled recovery actions", () => {
    const slugRoutes = read("src/routes/slug-route-resolvers.tsx");

    expect(slugRoutes).toContain("Go back");
    expect(slugRoutes).toContain("navigate(-1)");
    expect(slugRoutes).toContain("PT Hub");
    expect(slugRoutes).toContain("bg-card/82");
  });
});
