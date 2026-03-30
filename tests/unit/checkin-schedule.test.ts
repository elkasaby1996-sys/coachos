import { describe, expect, it } from "vitest";
import {
  addMonthsClampedToDateString,
  getCheckinDueDateForOccurrence,
  getNextCheckinDueDate,
  listCheckinDueDatesInRange,
  normalizeCheckinDueDate,
} from "../../src/lib/checkin-schedule";

describe("checkin schedule helpers", () => {
  it("preserves the exact assigned due date as the schedule anchor", () => {
    expect(normalizeCheckinDueDate("2026-03-25")).toBe("2026-03-25");
    expect(normalizeCheckinDueDate("2026-03-28")).toBe("2026-03-28");
  });

  it("calculates weekly due dates from the cadence anchor", () => {
    expect(getCheckinDueDateForOccurrence("2026-03-25", "weekly", 0)).toBe(
      "2026-03-25",
    );
    expect(getCheckinDueDateForOccurrence("2026-03-25", "weekly", 1)).toBe(
      "2026-04-01",
    );
  });

  it("calculates biweekly due dates from the cadence anchor", () => {
    expect(getCheckinDueDateForOccurrence("2026-03-25", "biweekly", 0)).toBe(
      "2026-03-25",
    );
    expect(getCheckinDueDateForOccurrence("2026-03-25", "biweekly", 1)).toBe(
      "2026-04-08",
    );
  });

  it("clamps monthly anchors without shifting them to Saturdays", () => {
    expect(addMonthsClampedToDateString("2026-01-31", 1)).toBe("2026-02-28");
    expect(getCheckinDueDateForOccurrence("2026-01-31", "monthly", 0)).toBe(
      "2026-01-31",
    );
    expect(getCheckinDueDateForOccurrence("2026-01-31", "monthly", 1)).toBe(
      "2026-02-28",
    );
    expect(getCheckinDueDateForOccurrence("2026-01-31", "monthly", 2)).toBe(
      "2026-03-31",
    );
  });

  it("returns the next due date on or after the requested day", () => {
    expect(getNextCheckinDueDate("2026-03-25", "weekly", "2026-03-25")).toBe(
      "2026-03-25",
    );
    expect(getNextCheckinDueDate("2026-03-25", "weekly", "2026-03-29")).toBe(
      "2026-04-01",
    );
    expect(getNextCheckinDueDate("2026-01-31", "monthly", "2026-03-01")).toBe(
      "2026-03-31",
    );
  });

  it("lists due dates in-range without drifting from cadence", () => {
    expect(
      listCheckinDueDatesInRange(
        "2026-03-25",
        "biweekly",
        "2026-03-01",
        "2026-04-30",
      ),
    ).toEqual(["2026-03-25", "2026-04-08", "2026-04-22"]);
  });
});
