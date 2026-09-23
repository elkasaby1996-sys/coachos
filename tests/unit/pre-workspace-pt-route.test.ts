import { describe, expect, it } from "vitest";
import {
  getProtectedRedirect,
  isPreWorkspacePtRouteAllowed,
} from "../../src/lib/protected-route-guard";
const pt = {
  pathname: "/pt-hub/settings/billing",
  allow: ["pt"] as Array<"pt" | "client">,
  accountType: "pt" as const,
  hasPtIdentity: true,
  hasWorkspaceMembership: false,
  ptWorkspaceComplete: false,
  ptProfileComplete: false,
  clientAccountComplete: false,
  clientWorkspaceOnboardingHardGateRequired: false,
  pendingInviteToken: null,
};
describe("pre-workspace PT route policy", () => {
  it.each([
    "/pt-hub/settings/billing",
    "/pt-hub/settings/billing/",
    "/pt-hub/settings/billing?anything=yes",
    "/pt-hub/settings/billing/?anything=yes#section",
  ])("allows Billing through the router pathname: %s", (url) => {
    const pathname = new URL(url, "http://localhost").pathname;
    expect(isPreWorkspacePtRouteAllowed(pathname)).toBe(true);
    expect(getProtectedRedirect({ ...pt, pathname })).toBeNull();
  });
  it.each([
    "/pt-hub",
    "/pt-hub/clients",
    "/pt-hub/workspaces",
    "/pt-hub/analytics",
    "/pt-hub/settings",
    "/pt-hub/settings/account",
    "/pt-hub/settings/security",
    "/pt-hub/settings/billing/history",
    "/pt-hub/settings/billing-other",
  ])("preserves the workspace gate for %s", (pathname) => {
    expect(isPreWorkspacePtRouteAllowed(pathname)).toBe(false);
    expect(getProtectedRedirect({ ...pt, pathname })).toBe(
      "/pt/onboarding/workspace",
    );
  });
  it.each([
    "/pt-hub",
    "/pt-hub/clients",
    "/pt-hub/workspaces",
    "/pt-hub/settings/account",
    "/pt-hub/settings/security",
    "/pt-hub/settings/billing",
  ])("preserves completed PT access: %s", (pathname) => {
    expect(
      getProtectedRedirect({ ...pt, pathname, ptWorkspaceComplete: true }),
    ).toBeNull();
  });
  it("requires a normal same-user PT identity, not just a route-inferred account type", () => {
    expect(getProtectedRedirect({ ...pt, hasPtIdentity: false })).toBe(
      "/pt/onboarding/workspace",
    );
  });
  it("does not exempt a route that disallows PTs", () => {
    expect(getProtectedRedirect({ ...pt, allow: ["client"] })).toBe(
      "/pt/onboarding/workspace",
    );
  });
  it.each([false, true])(
    "does not admit clients (workspace=%s)",
    (hasWorkspaceMembership) => {
      expect(
        getProtectedRedirect({
          ...pt,
          accountType: "client",
          hasWorkspaceMembership,
          clientAccountComplete: true,
        }),
      ).toBe("/app/home");
    },
  );
  it("retains client account onboarding", () => {
    expect(getProtectedRedirect({ ...pt, accountType: "client" })).toBe(
      "/client/onboarding/account",
    );
  });
  it("does not admit unknown identities", () => {
    expect(
      getProtectedRedirect({
        ...pt,
        accountType: "unknown",
        hasPtIdentity: false,
      }),
    ).toBe("/no-workspace");
  });
});
