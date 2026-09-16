// @vitest-environment jsdom
import type { User } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensurePtProfile: vi.fn(),
  syncPtAccountIdentity: vi.fn(),
  ensureClientProfile: vi.fn(),
  persistPlan: vi.fn(),
  persistSignupIntent: vi.fn(),
  persistPendingInviteToken: vi.fn(),
}));
vi.mock("../../src/lib/account-profiles", () => ({
  ...mocks,
  getSignupIntentFallback: () => "unknown",
  getPendingInviteToken: () => null,
  getUserDisplayName: () => "Metadata Name",
  getUserAvatarUrl: () => "https://example.invalid/avatar.png",
}));
vi.mock(
  "../../src/features/account-entitlements/persist-requested-plan",
  () => ({
    persistPendingRequestedPaidPlan: mocks.persistPlan,
  }),
);
import { provisionCallbackProfile } from "../../src/lib/auth-callback";

const user = { id: "fixture-user", email: "coach@example.invalid" } as User;
const queryClient = new QueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe("callback identity-only provisioning", () => {
  it("synchronizes the exact PT identity fields and still persists canonical plan intent", async () => {
    localStorage.setItem("coachos_pt_signup_full_name", "Fixture Coach");
    localStorage.setItem("coachos_pt_signup_phone", "fixture-phone");
    localStorage.setItem("coachos_pt_signup_country", "Fixture Country");
    localStorage.setItem("coachos_pt_signup_city", "Fixture City");
    await provisionCallbackProfile({
      user,
      intent: "pt",
      inviteToken: null,
      queryClient,
    });
    expect(mocks.ensurePtProfile).toHaveBeenCalledExactlyOnceWith({
      userId: user.id,
      fullName: "Fixture Coach",
    });
    expect(mocks.syncPtAccountIdentity).toHaveBeenCalledExactlyOnceWith({
      userId: user.id,
      fullName: "Fixture Coach",
      contactEmail: user.email,
      supportEmail: user.email,
      phone: "fixture-phone",
      country: "Fixture Country",
      city: "Fixture City",
    });
    expect(mocks.persistPlan).toHaveBeenCalledExactlyOnceWith(queryClient);
    expect(mocks.persistSignupIntent).toHaveBeenCalledExactlyOnceWith("pt");
    expect(mocks.ensureClientProfile).not.toHaveBeenCalled();
  });

  it("retains metadata-name and missing contact-field fallbacks", async () => {
    await provisionCallbackProfile({
      user: { ...user, email: undefined },
      intent: "pt",
      inviteToken: null,
    });
    expect(mocks.syncPtAccountIdentity).toHaveBeenCalledExactlyOnceWith({
      userId: user.id,
      fullName: "Metadata Name",
      contactEmail: null,
      supportEmail: null,
      phone: null,
      country: null,
      city: null,
    });
    expect(mocks.persistPlan).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it.each(["ensurePtProfile", "syncPtAccountIdentity"] as const)(
    "does not swallow %s failures",
    async (operation) => {
      const failure = new Error("fixture provisioning failure");
      mocks[operation].mockRejectedValueOnce(failure);
      await expect(
        provisionCallbackProfile({ user, intent: "pt", inviteToken: null }),
      ).rejects.toBe(failure);
    },
  );

  it.each([null, "fixture-invite"])(
    "preserves client provisioning with invite %s",
    async (inviteToken) => {
      localStorage.setItem("coachos_client_signup_name", "Fixture Client");
      await provisionCallbackProfile({
        user,
        intent: "client",
        inviteToken,
        queryClient,
      });
      expect(mocks.ensureClientProfile).toHaveBeenCalledExactlyOnceWith({
        userId: user.id,
        fullName: "Fixture Client",
        avatarUrl: "https://example.invalid/avatar.png",
        email: user.email,
      });
      expect(mocks.persistSignupIntent).toHaveBeenCalledExactlyOnceWith(
        "client",
      );
      if (inviteToken)
        expect(mocks.persistPendingInviteToken).toHaveBeenCalledExactlyOnceWith(
          inviteToken,
        );
      else expect(mocks.persistPendingInviteToken).not.toHaveBeenCalled();
      expect(mocks.syncPtAccountIdentity).not.toHaveBeenCalled();
      expect(mocks.ensurePtProfile).not.toHaveBeenCalled();
      expect(mocks.persistPlan).not.toHaveBeenCalled();
    },
  );
});
