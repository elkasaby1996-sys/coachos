import { describe, expect, it } from "vitest";
import {
  clearInviteJoinParams,
  deriveInviteJoinContext,
} from "../../src/features/lead-chat/lib/invite-join-context";

describe("invite join context", () => {
  it("keeps modal closed when workspace membership is missing", () => {
    const context = deriveInviteJoinContext({
      searchParams: new URLSearchParams("invite_joined=1&joined_workspace_name=Peak"),
      hasWorkspaceMembership: false,
    });

    expect(context.shouldShowModal).toBe(false);
    expect(context.workspaceName).toBe("Peak");
  });

  it("uses safe defaults when invite metadata is missing", () => {
    const context = deriveInviteJoinContext({
      searchParams: new URLSearchParams("invite_joined=1"),
      hasWorkspaceMembership: true,
    });

    expect(context.shouldShowModal).toBe(true);
    expect(context.workspaceName).toBe("your coaching workspace");
    expect(context.message).toMatch(/assigned you to a workspace/i);
  });

  it("prioritizes PT display name when present", () => {
    const context = deriveInviteJoinContext({
      searchParams: new URLSearchParams(
        "invite_joined=1&joined_workspace_id=workspace-1&joined_pt_name=Coach%20Nora",
      ),
      hasWorkspaceMembership: true,
    });

    expect(context.message).toBe(
      "You can now continue with Coach Nora from your dashboard.",
    );
  });

  it("clears only invite-join params and preserves unrelated query state", () => {
    const next = clearInviteJoinParams(
      new URLSearchParams(
        "invite_joined=1&joined_workspace_id=workspace-1&joined_workspace_name=Peak&joined_pt_name=Coach&tab=messages",
      ),
    );

    expect(next.get("invite_joined")).toBeNull();
    expect(next.get("joined_workspace_id")).toBeNull();
    expect(next.get("joined_workspace_name")).toBeNull();
    expect(next.get("joined_pt_name")).toBeNull();
    expect(next.get("tab")).toBe("messages");
  });
});
