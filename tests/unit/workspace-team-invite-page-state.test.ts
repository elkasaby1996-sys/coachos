import { describe, expect, it } from "vitest";
import {
  deriveInvitePageState,
  type InvitePageStateInput,
} from "../../src/features/workspace-team/invite-page-state";
import type { TeamInvitePreview } from "../../src/features/workspace-team/contracts";

const pendingPreview: TeamInvitePreview = {
  inviteId: "invite-1",
  workspaceId: "workspace-1",
  workspaceName: "LUS Coaching",
  invitedEmail: "sarah@example.com",
  role: "coach",
  clientAccessMode: "assigned_clients_only",
  status: "pending",
  expiresAt: "2026-05-23T00:00:00.000Z",
  requiresAuth: true,
};

function getState(input: Partial<InvitePageStateInput>) {
  return deriveInvitePageState({
    preview: pendingPreview,
    authLoading: false,
    previewLoading: false,
    previewError: false,
    ...input,
  });
}

describe("workspace team invite page state", () => {
  it("shows auth actions for a signed-out pending invite", () => {
    expect(getState({ currentEmail: null })).toBe("pending_signed_out");
  });

  it("shows accept action for a matching signed-in user", () => {
    expect(
      getState({ currentEmail: "sarah@example.com", emailVerified: true }),
    ).toBe("pending_matching_account");
  });

  it("matches invited email case-insensitively", () => {
    expect(
      getState({ currentEmail: "Sarah@Example.COM", emailVerified: true }),
    ).toBe("pending_matching_account");
  });

  it("blocks the wrong signed-in account", () => {
    expect(
      getState({ currentEmail: "ahmed@example.com", emailVerified: true }),
    ).toBe("pending_wrong_account");
  });

  it("keeps accept hidden while the signed-in email is unverified", () => {
    expect(
      getState({ currentEmail: "sarah@example.com", emailVerified: false }),
    ).toBe("pending_unverified_email");
  });

  it("maps terminal invite statuses", () => {
    expect(
      getState({ preview: { ...pendingPreview, status: "expired" } }),
    ).toBe("expired");
    expect(
      getState({ preview: { ...pendingPreview, status: "revoked" } }),
    ).toBe("revoked");
    expect(
      getState({ preview: { ...pendingPreview, status: "accepted" } }),
    ).toBe("already_accepted");
  });

  it("keeps API mismatch responses in the wrong-account state", () => {
    expect(
      getState({
        currentEmail: "sarah@example.com",
        emailVerified: true,
        acceptErrorCode: "INVITE_EMAIL_MISMATCH",
      }),
    ).toBe("pending_wrong_account");
  });

  it("uses accepting state only after the invite and account are valid", () => {
    expect(
      getState({
        currentEmail: "sarah@example.com",
        emailVerified: true,
        accepting: true,
      }),
    ).toBe("accepting");
  });
});
