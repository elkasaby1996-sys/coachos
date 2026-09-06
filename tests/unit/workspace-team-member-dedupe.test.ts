import { describe, expect, it } from "vitest";
import {
  dedupeWorkspaceTeamMembers,
  type WorkspaceTeamMemberRow,
} from "../../src/features/workspace-team/team-settings";

function makeMember(
  overrides: Partial<WorkspaceTeamMemberRow> = {},
): WorkspaceTeamMemberRow {
  return {
    id: "member-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    displayName: "Coach A",
    email: "coacha@test.com",
    role: "coach",
    status: "active",
    clientAccessMode: "all_clients",
    sourceInviteId: null,
    invitedByUserId: null,
    joinedAt: "2026-06-16T00:00:00.000Z",
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
    assignedClientCount: null,
    assignedClientIds: null,
    ...overrides,
  };
}

describe("workspace team member dedupe", () => {
  it("prefers the synthetic owner row over a synced owner membership row", () => {
    const members = dedupeWorkspaceTeamMembers([
      makeMember({
        id: null,
        role: "owner",
        userId: "owner-user",
        displayName: "coacha@test.com",
      }),
      makeMember({
        id: "workspace-member-owner",
        role: "owner",
        userId: "owner-user",
        displayName: "Coach A",
      }),
    ]);

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      id: null,
      userId: "owner-user",
      role: "owner",
    });
  });

  it("keeps one active row per non-owner user", () => {
    const members = dedupeWorkspaceTeamMembers([
      makeMember({ id: "removed-row", status: "removed" }),
      makeMember({ id: "active-row", status: "active" }),
    ]);

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      id: "active-row",
      status: "active",
    });
  });
});
