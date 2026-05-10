import { describe, expect, it } from "vitest";
import {
  WORKSPACE_TEAM_INVITE_API_ROUTES,
  buildWorkspaceTeamInviteEmail,
  buildWorkspaceTeamInviteUrl,
  getWorkspaceTeamInviteErrorCode,
} from "../../src/features/workspace-team/invite-api";

describe("workspace team invite API contracts", () => {
  it("documents the requested API route surface", () => {
    expect(WORKSPACE_TEAM_INVITE_API_ROUTES).toEqual({
      create: "/api/workspaces/:workspaceId/team/invites",
      preview: "/api/team-invites/:token",
      accept: "/api/team-invites/:token/accept",
      resend: "/api/workspaces/:workspaceId/team/invites/:inviteId/resend",
      revoke: "/api/workspaces/:workspaceId/team/invites/:inviteId/revoke",
    });
  });

  it("builds invite URLs without hashing or logging the raw token", () => {
    expect(
      buildWorkspaceTeamInviteUrl({
        baseUrl: "https://app.repsync.com/",
        token: "raw-token",
      }),
    ).toBe("https://app.repsync.com/team-invites/raw-token");
  });

  it("builds the provider-ready invite email content", () => {
    const email = buildWorkspaceTeamInviteEmail({
      to: " Sarah@Example.COM ",
      workspaceName: "LUS Coaching",
      ownerName: "Ahmed",
      role: "coach",
      acceptUrl: "https://app.repsync.com/team-invites/raw-token",
      expiresAt: "2026-05-23T00:00:00Z",
    });

    expect(email.to).toBe("sarah@example.com");
    expect(email.subject).toContain("LUS Coaching");
    expect(email.text).toContain("/team-invites/raw-token");
    expect(email.text).toContain(
      "You must sign in or create a RepSync account with sarah@example.com to accept.",
    );
  });

  it("extracts stable invite API error codes from Supabase RPC errors", () => {
    expect(getWorkspaceTeamInviteErrorCode({ hint: "INVITE_EXPIRED" })).toBe(
      "INVITE_EXPIRED",
    );
    expect(
      getWorkspaceTeamInviteErrorCode({
        message: "DUPLICATE_PENDING_INVITE",
      }),
    ).toBe("DUPLICATE_PENDING_INVITE");
    expect(getWorkspaceTeamInviteErrorCode({ message: "Something else" })).toBe(
      null,
    );
  });
});
