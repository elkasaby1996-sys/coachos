import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

const appRoutes = readSource("src", "routes", "app.tsx");
const authProviderAdapter = readSource("src", "providers", "AuthProvider.tsx");
const slugRouteResolvers = readSource("src", "routes", "slug-route-resolvers.tsx");

describe("protected route rendering hardening", () => {
  it("keeps protected route children hidden while bootstrap authorization is not usable", () => {
    expect(appRoutes).toContain("function RequireRole");
    expect(appRoutes).toContain("canUseBootstrapForProtectedRoute");
    expect(appRoutes).toContain("!canUseBootstrap");
    expect(appRoutes).toContain("<FullPageLoader />");
    expect(appRoutes).not.toContain(
      "hasStableBootstrap && bootstrapStale ? (\n          <>{children}</>",
    );
  });

  it("exposes only same-user cached bootstrap roles through the legacy auth adapter", () => {
    expect(authProviderAdapter).toContain("hasSameUserCachedBootstrap");
    expect(authProviderAdapter).toContain(
      "bootstrapResolved || hasSameUserCachedBootstrap ? role : null",
    );
    expect(authProviderAdapter).not.toContain(
      "bootstrapResolved || bootstrapStale ? role : null",
    );
  });

  it("keeps workspace outlets hidden until route workspace access is allowed", () => {
    expect(slugRouteResolvers).toContain("workspace_access_context");
    expect(slugRouteResolvers).toContain("workspaceAccessQuery.isLoading");
    expect(slugRouteResolvers).toContain("workspaceAccessAllowed");
    expect(slugRouteResolvers).toContain("<Navigate to={routes.ptHub()} replace />");
    expect(slugRouteResolvers).toContain(
      "workspaceAccessAllowed && workspaceQuery.data?.id",
    );
  });
});
