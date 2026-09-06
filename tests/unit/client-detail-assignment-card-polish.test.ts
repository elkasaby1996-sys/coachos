import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientDetailPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "client-detail.tsx"),
  "utf8",
);

describe("client detail assignment card polish", () => {
  it("uses local assignment card primitives for delivery cards", () => {
    expect(clientDetailPage).toContain("function AssignmentCardHeader");
    expect(clientDetailPage).toContain("function AssignmentMetaRow");
    expect(clientDetailPage).toContain("function AssignmentActionRow");
    expect(clientDetailPage).toContain("function AssignmentReadOnlyNotice");
  });

  it("surfaces snapshot copy near workout, program, and nutrition assignment controls", () => {
    expect(clientDetailPage).toContain("ASSIGNMENT_SNAPSHOT_WARNING_TITLE");
    expect(clientDetailPage).toContain("ASSIGNMENT_SNAPSHOT_NOTICE");
    expect(clientDetailPage).toContain("Template source");
    expect(clientDetailPage).toContain(
      "Template edits affect future assignments only.",
    );
    expect(clientDetailPage).toContain("Current nutrition assignment");
    expect(clientDetailPage).toContain("Assign nutrition program");
  });

  it("keeps the schedule workout card concise without idle status chrome", () => {
    const scheduleWorkoutStart = clientDetailPage.indexOf(
      'title="Schedule workout"',
    );
    expect(scheduleWorkoutStart).toBeGreaterThanOrEqual(0);
    const scheduleWorkoutEnd = clientDetailPage.indexOf(
      'title="Schedule (next 14 days)"',
      scheduleWorkoutStart,
    );
    expect(scheduleWorkoutEnd).toBeGreaterThan(scheduleWorkoutStart);
    const scheduleWorkoutCard = clientDetailPage.slice(
      scheduleWorkoutStart,
      scheduleWorkoutEnd,
    );

    expect(scheduleWorkoutCard).toContain(
      'description="Assign or replace one workout for a specific date."',
    );
    expect(scheduleWorkoutCard).not.toContain("one effective workout");
    expect(scheduleWorkoutCard).not.toContain("status={");
    expect(scheduleWorkoutCard).not.toContain('status="idle"');
  });

  it("uses cadence settings language for check-in assignment cards", () => {
    expect(clientDetailPage).toContain(
      "Check-ins use cadence settings. Future check-ins",
    );
    expect(clientDetailPage).toContain(
      "follow the selected template, frequency, and start",
    );
    expect(clientDetailPage).toContain("Current check-in assignment");
    expect(clientDetailPage).toContain("Edit check-in settings");
  });

  it("keeps the check-in template form free of override/debug summary chrome", () => {
    const checkinTemplateStart = clientDetailPage.indexOf(
      'title="Check-in template"',
    );
    expect(checkinTemplateStart).toBeGreaterThanOrEqual(0);
    const checkinTemplateEnd = clientDetailPage.indexOf(
      "<PtClientCheckinsTab",
      checkinTemplateStart,
    );
    expect(checkinTemplateEnd).toBeGreaterThan(checkinTemplateStart);
    const checkinTemplateCard = clientDetailPage.slice(
      checkinTemplateStart,
      checkinTemplateEnd,
    );

    expect(checkinTemplateCard).not.toContain("checkinTemplateStatusMap");
    expect(checkinTemplateCard).not.toContain("Resolution:");
    expect(checkinTemplateCard).not.toContain("Client override");
    expect(checkinTemplateCard).not.toContain("Using:");
  });

  it("keeps the check-ins queue header concise", () => {
    expect(clientDetailPage).not.toContain(
      "Review queue with urgency, submission timing, and next actions for",
    );
    expect(clientDetailPage).not.toContain(
      "Check-ins use client cadence settings. Template changes apply to future generated check-ins.",
    );
  });

  it("keeps ended client relationships read-only for assignment surfaces", () => {
    expect(clientDetailPage).toContain(
      "This client relationship is no longer active. History is preserved for reference.",
    );
    expect(clientDetailPage).toContain(
      '"Assignment history is preserved for reference."',
    );
    expect(clientDetailPage).toContain(
      "historical={isHistoricalClientRelationship}",
    );
    expect(clientDetailPage).toContain(
      "canEditClients={canMutateActiveClient}",
    );
    expect(clientDetailPage).toContain("!canEditClients");
    expect(clientDetailPage).toContain("!isHistoricalClientRelationship");
  });

  it("keeps destructive assignment actions in subdued action rows", () => {
    expect(clientDetailPage).toContain("<AssignmentActionRow danger>");
    expect(clientDetailPage).toContain("Unassign program");
    expect(clientDetailPage).toContain("Remove assignment");
    expect(clientDetailPage).toContain(
      "Completed workout history is preserved",
    );
    expect(clientDetailPage).toContain("Historical records are preserved");
  });
});
