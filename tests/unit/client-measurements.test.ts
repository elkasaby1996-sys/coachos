import { describe, expect, it } from "vitest";
import {
  convertWeight,
  parseOptionalAmount,
  sumRecorded,
} from "../../src/lib/client-measurements";
import {
  completedTraining,
  type TrainingSet,
} from "../../src/lib/completed-training";
describe("recorded client measurements", () => {
  it("keeps a mixed-unit trend physically equivalent", () => {
    expect(convertWeight(67.9, "kg", "lb")).toBeCloseTo(149.694, 2);
    expect(convertWeight(150, "lb", "kg")).toBeCloseTo(68.0389, 3);
    expect(convertWeight(10, null, "kg")).toBeNull();
    expect(convertWeight(null, "kg", "lb")).toBeNull();
  });
  it("distinguishes blank intake from deliberate zero and never substitutes targets", () => {
    expect(parseOptionalAmount(" ")).toBeNull();
    expect(parseOptionalAmount("0")).toBe(0);
    expect(parseOptionalAmount("-1")).toBeNull();
    expect(parseOptionalAmount("2.5")).toBe(2.5);
    expect(sumRecorded([null, undefined])).toBeNull();
    expect(sumRecorded([null, 0])).toBe(0);
    expect(sumRecorded([null, 35])).toBe(35);
  });
});
const set: TrainingSet = {
  sessionId: "a",
  exerciseId: "lift",
  name: "Lift",
  completedAt: "2026-09-01T12:00:00Z",
  completed: true,
  weight: 100,
  unit: "kg",
  reps: 5,
};
describe("finished session comparisons", () => {
  it("omits unfinished sets and does not manufacture a change from one session", () => {
    const result = completedTraining(
      [set, { ...set, completed: false, weight: 200 }],
      "kg",
      "2026-09-01",
      "2026-09-08",
    );
    expect(result.loadSeries[0]?.volume).toBe(500);
    expect(result.changes).toEqual([]);
  });
  it("compares session totals with consistent units and date ranges", () => {
    const second = {
      ...set,
      sessionId: "b",
      completedAt: "2026-09-08T12:00:00Z",
      weight: 220.46226218,
      unit: "lb",
    };
    const result = completedTraining(
      [set, set, second, second],
      "kg",
      "2026-09-01",
      "2026-09-08",
    );
    expect(result.changes[0]?.volumeDelta).toBeCloseTo(0);
    expect(result.loadSeries[1]?.volume).toBeCloseTo(1000);
    expect(
      completedTraining([set, second], "kg", "2026-09-02", "2026-09-08")
        .changes,
    ).toEqual([]);
  });
  it("preserves unknown load and explicit zero", () => {
    expect(
      completedTraining(
        [{ ...set, unit: null }],
        "kg",
        "2026-09-01",
        "2026-09-08",
      ).loadSeries[0]?.volume,
    ).toBeNull();
    expect(
      completedTraining(
        [{ ...set, weight: 0 }],
        "kg",
        "2026-09-01",
        "2026-09-08",
      ).loadSeries[0]?.volume,
    ).toBe(0);
  });
});
