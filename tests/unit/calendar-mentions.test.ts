import { describe, expect, it } from "vitest";
import {
  filterMentionUsers,
  getActiveMentionQuery,
  getSelectedMentionIds,
  insertMention,
  type CalendarMentionUser,
} from "../../src/features/calendar/mentions";

const users: CalendarMentionUser[] = [
  { user_id: "user-1", display_name: "Omar Elkasaby", role: "client" },
  { user_id: "user-2", display_name: "Sara Coach", role: "coach" },
];

describe("calendar mentions", () => {
  it("detects the active @ query at the end of notes", () => {
    expect(getActiveMentionQuery("Review prep @om")).toBe("om");
    expect(getActiveMentionQuery("Review @om tomorrow")).toBeNull();
  });

  it("filters mention users by display name", () => {
    expect(filterMentionUsers(users, "sar")).toEqual([users[1]]);
  });

  it("replaces the active query with the selected mention label", () => {
    expect(insertMention("Review prep @om", "Omar Elkasaby")).toBe(
      "Review prep @Omar Elkasaby ",
    );
  });

  it("keeps selected ids and resolves typed exact mentions", () => {
    expect(getSelectedMentionIds(["user-2"], users, "@Omar Elkasaby")).toEqual([
      "user-2",
      "user-1",
    ]);
  });
});
