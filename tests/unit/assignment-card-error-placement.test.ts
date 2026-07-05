import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientDetailPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "client-detail.tsx"),
  "utf8",
);

const sliceBetween = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  expect(startIndex, `missing ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex, `missing ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe("assignment card error placement", () => {
  it("maps completed workout replacement failures to clear coach-facing copy", () => {
    expect(clientDetailPage).toContain(
      'return "Completed workouts cannot be replaced.";',
    );
    expect(clientDetailPage).toContain(
      "Cannot replace a completed workout day",
    );
    expect(clientDetailPage).toContain(
      "Cannot override a completed workout day",
    );
  });

  it("uses the same local assignment error mapper for one-off assignments and overrides", () => {
    const assignHandler = sliceBetween(
      clientDetailPage,
      "const handleAssignWorkout = async () =>",
      "const handleApplyProgram = async () =>",
    );
    const overrideHandler = sliceBetween(
      clientDetailPage,
      "const handleSaveOverride = async () =>",
      "const handleStatusUpdate = async",
    );

    expect(assignHandler).toContain("getAssignmentActionErrorMessage(error)");
    expect(overrideHandler).toContain("getAssignmentActionErrorMessage(error)");
    expect(overrideHandler).not.toContain(
      "setOverrideError(`${details.code}: ${details.message}`)",
    );
  });

  it("renders assignment failures inside the schedule workout card", () => {
    const planTab = sliceBetween(
      clientDetailPage,
      "function PtClientPlanTab({",
      "function PtClientNutritionTab(",
    );
    const scheduleCard = sliceBetween(
      planTab,
      "<CardTitle>Schedule workout</CardTitle>",
      'title="Schedule (next 14 days)"',
    );

    expect(planTab).toContain("assignMessage,");
    expect(planTab).toContain("assignMessage: string | null;");
    expect(scheduleCard).toContain("assignMessage ? (");
    expect(scheduleCard).toContain('assignStatus === "error"');
    expect(scheduleCard).toContain("border-destructive/30");
  });
});
