import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import type { ClientProfileRow, PtProfileRow } from "../../src/lib/account-profiles";
import {
  buildSessionAuthValue,
  buildStaleBootstrapFallbackState,
  getAuthenticatedRedirectPath,
  getBootstrapPath,
  resolveBootstrapFromLookupResults,
  type AuthBootstrapState,
  type LookupResult,
} from "../../src/lib/auth";

function createPtProfile(overrides: Partial<PtProfileRow> = {}): PtProfileRow {
  return {
    id: "pt-profile-1",
    user_id: "user-1",
    workspace_id: "workspace-1",
    display_name: "Coach Alex",
    full_name: "Alex Coach",
    phone: null,
    avatar_url: null,
    coach_business_name: null,
    headline: "Online strength coach",
    bio: null,
    location_country: null,
    location_city: null,
    languages: null,
    specialties: null,
    starting_price: null,
    onboarding_completed_at: "2026-04-01T12:00:00.000Z",
    created_at: "2026-04-01T12:00:00.000Z",
    updated_at: "2026-04-01T12:00:00.000Z",
    ...overrides,
  };
}

function createClientProfile(
  overrides: Partial<ClientProfileRow> = {},
): ClientProfileRow {
  return {
    id: "client-1",
    workspace_id: "workspace-1",
    user_id: "user-1",
    status: "active",
    display_name: "Taylor Client",
    full_name: "Taylor Client",
    phone: "+966500000000",
    email: "taylor@example.com",
    avatar_url: null,
    photo_url: null,
    date_of_birth: "1995-01-01",
    dob: null,
    sex: "female",
    gender: null,
    height_value: 170,
    height_unit: "cm",
    height_cm: null,
    weight_value_current: 70,
    weight_unit: "kg",
    current_weight: null,
    unit_preference: null,
    location: null,
    location_country: null,
    timezone: null,
    goal: null,
    injuries: null,
    limitations: null,
    equipment: null,
    days_per_week: null,
    gym_name: null,
    training_type: null,
    account_onboarding_completed_at: "2026-04-01T12:00:00.000Z",
    created_at: "2026-04-01T12:00:00.000Z",
    ...overrides,
  };
}

function createPtStableState(
  overrides: Partial<AuthBootstrapState> = {},
): AuthBootstrapState {
  return {
    accountType: "pt",
    role: "pt",
    hasWorkspaceMembership: true,
    ptWorkspaceComplete: true,
    ptProfileComplete: true,
    clientAccountComplete: false,
    clientWorkspaceOnboardingHardGateRequired: false,
    pendingInviteToken: null,
    activeWorkspaceId: "workspace-1",
    activeClientId: null,
    ptProfile: createPtProfile(),
    clientProfile: null,
    bootstrapPath: "/pt-hub",
    ...overrides,
  };
}

describe("auth/bootstrap regression coverage", () => {
  it("preserves the last stable PT bootstrap state when bootstrap becomes stale", () => {
    const fallback = createPtStableState();

    const staleState = buildStaleBootstrapFallbackState({
      fallback,
      pathname: "/pt-hub/profile/preview",
    });

    expect(staleState.accountType).toBe("pt");
    expect(staleState.role).toBe("pt");
    expect(staleState.hasWorkspaceMembership).toBe(true);
    expect(staleState.activeWorkspaceId).toBe("workspace-1");
    expect(staleState.ptProfile?.full_name).toBe("Alex Coach");
    expect(staleState.bootstrapPath).toBe("/pt-hub");
  });

  it("treats timeout and error results as unresolved instead of confirmed empty state", () => {
    const timeoutResolution = resolveBootstrapFromLookupResults({
      pathname: "/pt-hub",
      previousStable: createPtStableState(),
      storedWorkspaceId: "workspace-1",
      signupIntent: "unknown",
      pendingInviteToken: null,
      membershipResult: {
        status: "timeout",
        error: new Error("Workspace membership lookup timed out (3s)."),
      },
      ptProfileResult: null,
      clientResult: null,
    });

    expect(timeoutResolution.status).toBe("unresolved");

    const profileErrorResolution = resolveBootstrapFromLookupResults({
      pathname: "/app/home",
      previousStable: null,
      storedWorkspaceId: null,
      signupIntent: "unknown",
      pendingInviteToken: null,
      membershipResult: { status: "empty" },
      ptProfileResult: { status: "error", error: new Error("PT profile failed") },
      clientResult: {
        status: "empty",
      } as LookupResult<ClientProfileRow[]>,
    });

    expect(profileErrorResolution.status).toBe("unresolved");
  });

  it("keeps session authentication independent from unresolved bootstrap state", () => {
    const session = {
      access_token: "token",
      refresh_token: "refresh",
      user: { id: "user-1", email: "coach@example.com" },
    } as Session;

    const authValue = buildSessionAuthValue({
      session,
      authLoading: false,
      authError: new Error("Bootstrap is still refreshing"),
    });

    expect(authValue.session).toBe(session);
    expect(authValue.user?.email).toBe("coach@example.com");
    expect(authValue.isAuthenticated).toBe(true);
    expect(authValue.authLoading).toBe(false);
  });

  it("only routes to /no-workspace after confirmed empty state", () => {
    const resolvedEmpty = resolveBootstrapFromLookupResults({
      pathname: "/",
      previousStable: null,
      storedWorkspaceId: null,
      signupIntent: "unknown",
      pendingInviteToken: null,
      membershipResult: { status: "empty" },
      ptProfileResult: { status: "empty" },
      clientResult: { status: "empty" },
    });

    expect(resolvedEmpty.status).toBe("resolved");
    if (resolvedEmpty.status !== "resolved") {
      throw new Error("Expected resolved empty bootstrap state.");
    }
    expect(resolvedEmpty.state.accountType).toBe("unknown");
    expect(getAuthenticatedRedirectPath(resolvedEmpty.state)).toBe("/no-workspace");
  });

  it("keeps the direct invite flow owned by the invite route", () => {
    const state = {
      accountType: "client",
      role: "client",
      hasWorkspaceMembership: false,
      ptWorkspaceComplete: false,
      ptProfileComplete: false,
      clientAccountComplete: false,
      clientWorkspaceOnboardingHardGateRequired: false,
      pendingInviteToken: "invite-token-123",
      activeWorkspaceId: null,
      activeClientId: createClientProfile().id,
      ptProfile: null,
      clientProfile: createClientProfile(),
    } as const;

    expect(getBootstrapPath(state, "/invite/invite-token-123")).toBeNull();
    expect(getAuthenticatedRedirectPath(state)).toBe(
      "/client/onboarding/account?invite=invite-token-123",
    );
  });
});
