import { describe, expect, it } from "vitest";
import {
  getCheckinOperationalState,
  getCheckinReviewState,
  getPrimaryClientCheckin,
  isCheckinUpcomingWithinDays,
} from "../../src/lib/checkin-review";

describe("checkin review helpers", () => {
  const today = "2026-03-29";

  it("derives due-state transitions from submission and review metadata", () => {
    expect(
      getCheckinOperationalState(
        {
          week_ending_saturday: "2026-04-05",
          submitted_at: null,
          reviewed_at: null,
        },
        today,
      ),
    ).toBe("upcoming");

    expect(
      getCheckinOperationalState(
        {
          week_ending_saturday: "2026-03-29",
          submitted_at: null,
          reviewed_at: null,
        },
        today,
      ),
    ).toBe("due");

    expect(
      getCheckinOperationalState(
        {
          week_ending_saturday: "2026-03-28",
          submitted_at: null,
          reviewed_at: null,
        },
        today,
      ),
    ).toBe("overdue");

    expect(
      getCheckinOperationalState(
        {
          week_ending_saturday: "2026-03-28",
          submitted_at: "2026-03-28T10:00:00Z",
          reviewed_at: null,
        },
        today,
      ),
    ).toBe("submitted");

    expect(
      getCheckinOperationalState(
        {
          week_ending_saturday: "2026-03-28",
          submitted_at: "2026-03-28T10:00:00Z",
          reviewed_at: "2026-03-29T08:00:00Z",
        },
        today,
      ),
    ).toBe("reviewed");
  });

  it("keeps the PT review-state helper backward-compatible with upcoming rows", () => {
    expect(
      getCheckinReviewState(
        {
          week_ending_saturday: "2026-04-05",
          submitted_at: null,
          reviewed_at: null,
        },
        today,
      ),
    ).toBe("due");
  });

  it("detects upcoming rows inside a reminder window", () => {
    expect(
      isCheckinUpcomingWithinDays(
        {
          week_ending_saturday: "2026-04-01",
          submitted_at: null,
          reviewed_at: null,
        },
        today,
        3,
      ),
    ).toBe(true);

    expect(
      isCheckinUpcomingWithinDays(
        {
          week_ending_saturday: "2026-04-05",
          submitted_at: null,
          reviewed_at: null,
        },
        today,
        3,
      ),
    ).toBe(false);
  });

  it("prioritizes overdue, then due, then latest closed, then next upcoming rows for the client surface", () => {
    expect(
      getPrimaryClientCheckin(
        [
          {
            week_ending_saturday: "2026-04-05",
            submitted_at: null,
            reviewed_at: null,
          },
          {
            week_ending_saturday: "2026-03-28",
            submitted_at: null,
            reviewed_at: null,
          },
        ],
        today,
      )?.week_ending_saturday,
    ).toBe("2026-03-28");

    expect(
      getPrimaryClientCheckin(
        [
          {
            week_ending_saturday: "2026-03-22",
            submitted_at: "2026-03-22T12:00:00Z",
            reviewed_at: null,
          },
          {
            week_ending_saturday: "2026-04-05",
            submitted_at: null,
            reviewed_at: null,
          },
        ],
        today,
      )?.week_ending_saturday,
    ).toBe("2026-03-22");
  });
});
