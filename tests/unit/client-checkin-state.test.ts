import { describe, expect, it } from "vitest";
import { resolveClientCheckinPageState } from "../../src/lib/client-checkin-state";

describe("client check-in page state", () => {
  it("returns no-assignment only when no effective template applies", () => {
    expect(
      resolveClientCheckinPageState({
        hasEffectiveTemplate: false,
        checkinStartDate: null,
        checkinFrequency: "weekly",
        today: "2026-07-03",
        currentCheckin: null,
      }),
    ).toEqual({
      kind: "no-assignment",
      nextDueDate: null,
      operationalState: null,
    });
  });

  it("treats an assigned template with a future date and no row as assigned but not open", () => {
    expect(
      resolveClientCheckinPageState({
        hasEffectiveTemplate: true,
        checkinStartDate: "2026-07-24",
        checkinFrequency: "weekly",
        today: "2026-07-03",
        currentCheckin: null,
      }),
    ).toEqual({
      kind: "assigned-not-open",
      nextDueDate: "2026-07-24",
      operationalState: null,
    });
  });

  it("prevents false no-assignment when a template exists but no start date has materialized rows", () => {
    expect(
      resolveClientCheckinPageState({
        hasEffectiveTemplate: true,
        checkinStartDate: null,
        checkinFrequency: "weekly",
        today: "2026-07-03",
        currentCheckin: null,
      }).kind,
    ).toBe("assigned-not-open");
  });

  it("maps due check-ins to the open state", () => {
    expect(
      resolveClientCheckinPageState({
        hasEffectiveTemplate: true,
        checkinStartDate: "2026-07-03",
        checkinFrequency: "weekly",
        today: "2026-07-03",
        currentCheckin: {
          week_ending_saturday: "2026-07-03",
          submitted_at: null,
          reviewed_at: null,
        },
      }),
    ).toEqual({
      kind: "open",
      nextDueDate: "2026-07-03",
      operationalState: "due",
    });
  });

  it("preserves submitted state", () => {
    expect(
      resolveClientCheckinPageState({
        hasEffectiveTemplate: true,
        checkinStartDate: "2026-07-03",
        checkinFrequency: "weekly",
        today: "2026-07-03",
        currentCheckin: {
          week_ending_saturday: "2026-07-03",
          submitted_at: "2026-07-03T12:00:00Z",
          reviewed_at: null,
        },
      }),
    ).toMatchObject({
      kind: "submitted",
      operationalState: "submitted",
    });
  });
});
