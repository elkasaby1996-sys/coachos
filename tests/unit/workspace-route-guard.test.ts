import { describe, expect, it } from "vitest";
import { getWorkspaceRouteGuardDecision } from "../../src/lib/workspace-route-guard";

describe("workspace route guard", () => {
  it("keeps a removed assistant out of the old workspace shell", () => {
    expect(
      getWorkspaceRouteGuardDecision({
        routeLoading: false,
        accessLoading: false,
        routeWorkspaceId: "workspace-old",
        accessWorkspaceId: null,
        routeError: null,
        accessError: null,
      }),
    ).toBe("redirect");
  });

  it("keeps a coach out of a non-owned non-member workspace shell", () => {
    expect(
      getWorkspaceRouteGuardDecision({
        routeLoading: false,
        accessLoading: false,
        routeWorkspaceId: "workspace-coach-b",
        accessWorkspaceId: "workspace-coach-a",
        routeError: null,
        accessError: null,
      }),
    ).toBe("redirect");
  });

  it("allows a valid workspace member to open the workspace shell", () => {
    expect(
      getWorkspaceRouteGuardDecision({
        routeLoading: false,
        accessLoading: false,
        routeWorkspaceId: "workspace-shared",
        accessWorkspaceId: "workspace-shared",
        routeError: null,
        accessError: null,
      }),
    ).toBe("render");
  });

  it("keeps the neutral loader up while workspace access is pending", () => {
    expect(
      getWorkspaceRouteGuardDecision({
        routeLoading: false,
        accessLoading: true,
        routeWorkspaceId: "workspace-shared",
        accessWorkspaceId: null,
        routeError: null,
        accessError: null,
      }),
    ).toBe("loading");
  });
});
