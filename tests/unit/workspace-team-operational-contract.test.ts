import { describe, expect, it } from "vitest";
import {
  buildWorkspaceTeamInviteEmail,
  WORKSPACE_TEAM_INVITE_RATE_LIMITS,
  WORKSPACE_TEAM_SAFE_LOG_FIELDS,
} from "../../src/features/workspace-team";

describe("workspace team operational contracts", () => {
  it("keeps invite email copy account-gated and free of client names", () => {
    const email = buildWorkspaceTeamInviteEmail({
      to: "coach@example.com",
      workspaceName: "LUS Coaching",
      ownerName: "Ahmed",
      role: "assistant_coach",
      acceptUrl: "https://app.repsync.com/team-invites/raw-token",
      expiresAt: "2026-05-23T00:00:00Z",
    });

    expect(email.subject).toContain("LUS Coaching");
    expect(email.text).toContain("assistant_coach");
    expect(email.text).toContain(
      "This invite expires on 2026-05-23T00:00:00Z.",
    );
    expect(email.text).toContain(
      "You must sign in or create a RepSync account with coach@example.com to accept.",
    );
    expect(email.text).not.toContain("client");
  });

  it("documents targeted client-side cooldowns for high-repeat team actions", () => {
    expect(WORKSPACE_TEAM_INVITE_RATE_LIMITS.createInviteMs).toBeGreaterThan(0);
    expect(WORKSPACE_TEAM_INVITE_RATE_LIMITS.resendInviteMs).toBeGreaterThan(0);
    expect(
      WORKSPACE_TEAM_INVITE_RATE_LIMITS.wrongAccountAttemptMs,
    ).toBeGreaterThan(0);
  });

  it("documents fields that must never be emitted to operational logs", () => {
    expect(WORKSPACE_TEAM_SAFE_LOG_FIELDS.blocked).toEqual(
      expect.arrayContaining([
        "token",
        "rawToken",
        "acceptUrl",
        "token_hash",
        "privateMessageBody",
        "paymentData",
      ]),
    );
  });
});
