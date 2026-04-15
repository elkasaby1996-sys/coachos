import { describe, expect, it } from "vitest";
import {
  buildPerformanceMarkerSelection,
  resolveAssignedPerformanceMarkerTemplates,
  shouldShowPtPerformanceMarkerAssignment,
} from "../../src/lib/performance-marker-assignments";

const templates = [
  { id: "marker-a" },
  { id: "marker-b" },
  { id: "marker-c" },
];

describe("resolveAssignedPerformanceMarkerTemplates", () => {
  it("falls back to all templates when no assignment rows exist", () => {
    expect(resolveAssignedPerformanceMarkerTemplates(templates, [])).toEqual(
      templates,
    );
  });

  it("returns only assigned templates when PT has chosen a subset", () => {
    expect(
      resolveAssignedPerformanceMarkerTemplates(templates, [
        "marker-b",
        "marker-c",
      ]),
    ).toEqual([{ id: "marker-b" }, { id: "marker-c" }]);
  });
});

describe("buildPerformanceMarkerSelection", () => {
  it("defaults to the full active library when nothing is assigned yet", () => {
    expect(buildPerformanceMarkerSelection(templates, [])).toEqual([
      "marker-a",
      "marker-b",
      "marker-c",
    ]);
  });

  it("preserves only the assigned markers for an existing draft", () => {
    expect(buildPerformanceMarkerSelection(templates, ["marker-c"])).toEqual([
      "marker-c",
    ]);
  });
});

describe("shouldShowPtPerformanceMarkerAssignment", () => {
  it("keeps the assignment UI visible when there is no onboarding-linked baseline yet", () => {
    expect(
      shouldShowPtPerformanceMarkerAssignment({
        onboardingBaselineId: null,
        submittedBaselineId: "submitted-1",
        submittedAt: "2026-04-14T10:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("keeps the assignment UI visible when only historical submissions exist", () => {
    expect(
      shouldShowPtPerformanceMarkerAssignment({
        onboardingBaselineId: "draft-1",
        submittedBaselineId: "submitted-1",
        submittedAt: "2026-04-14T10:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("hides the assignment UI once the onboarding-linked baseline is submitted", () => {
    expect(
      shouldShowPtPerformanceMarkerAssignment({
        onboardingBaselineId: "submitted-1",
        submittedBaselineId: "submitted-1",
        submittedAt: "2026-04-14T10:00:00.000Z",
      }),
    ).toBe(false);
  });
});
