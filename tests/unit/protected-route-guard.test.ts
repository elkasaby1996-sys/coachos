import { describe, expect, it } from "vitest";
import { canUseBootstrapForProtectedRoute } from "../../src/lib/protected-route-guard";

describe("protected route guard", () => {
  it("does not render coach routes during first unresolved client bootstrap", () => {
    expect(
      canUseBootstrapForProtectedRoute({
        allow: ["pt"],
        accountType: "unknown",
        bootstrapResolved: false,
        bootstrapStale: false,
        bootstrapUserId: null,
        currentUserId: "client-user",
      }),
    ).toBe(false);
  });

  it("renders coach routes from verified same-user cached bootstrap while fresh bootstrap is pending", () => {
    expect(
      canUseBootstrapForProtectedRoute({
        allow: ["pt"],
        accountType: "pt",
        bootstrapResolved: false,
        bootstrapStale: true,
        bootstrapUserId: "coach-user",
        currentUserId: "coach-user",
      }),
    ).toBe(true);
  });

  it("does not render protected routes from stale bootstrap belonging to a previous user", () => {
    expect(
      canUseBootstrapForProtectedRoute({
        allow: ["pt"],
        accountType: "pt",
        bootstrapResolved: false,
        bootstrapStale: true,
        bootstrapUserId: "old-coach-user",
        currentUserId: "client-user",
      }),
    ).toBe(false);
  });

  it("does not render when the cached role does not match the protected route", () => {
    expect(
      canUseBootstrapForProtectedRoute({
        allow: ["pt"],
        accountType: "client",
        bootstrapResolved: false,
        bootstrapStale: true,
        bootstrapUserId: "client-user",
        currentUserId: "client-user",
      }),
    ).toBe(false);
  });
});
