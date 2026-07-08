import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const clientSurfaceSources = {
  home: readRepoFile("src", "pages", "client", "home.tsx"),
  checkin: readRepoFile("src", "pages", "client", "checkin.tsx"),
  baseline: readRepoFile("src", "pages", "client", "baseline.tsx"),
  messages: readRepoFile("src", "pages", "client", "messages.tsx"),
  onboarding: readRepoFile(
    "src",
    "pages",
    "client",
    "client-account-onboarding.tsx",
  ),
  layout: readRepoFile("src", "components", "layouts", "client-layout.tsx"),
  reminders: readRepoFile("src", "components", "common", "client-reminders.tsx"),
  portalUi: readRepoFile(
    "src",
    "components",
    "client",
    "portal",
    "portal-ui.tsx",
  ),
  nutrition: readRepoFile("src", "pages", "client", "nutrition.tsx"),
};

const combinedClientSurfaceSource = Object.values(clientSurfaceSources).join("\n");

describe("client portal tag minimization", () => {
  it("keeps removed-only client home copy safe and relationship-neutral", () => {
    expect(clientSurfaceSources.home).toContain(
      "You do not currently have an active coaching workspace.",
    );
    expect(clientSurfaceSources.home).not.toContain("Removed");
    expect(clientSurfaceSources.home).not.toContain("Transferred out");
  });

  it("uses client-facing copy for missing workout, nutrition, and check-in assignments", () => {
    expect(clientSurfaceSources.home).toContain(
      "Your coach has not assigned a workout plan yet.",
    );
    expect(combinedClientSurfaceSource).toContain(
      "Your coach has not assigned a nutrition plan yet.",
    );
    expect(clientSurfaceSources.checkin).toContain(
      "Your coach has not assigned a check-in schedule yet.",
    );

    expect(combinedClientSurfaceSource).not.toContain("Nutrition plan pending");
    expect(clientSurfaceSources.home).not.toContain("No workouts queued");
    expect(clientSurfaceSources.checkin).not.toContain(
      "Your coach hasn’t assigned a check-in yet.",
    );
    expect(clientSurfaceSources.checkin).not.toContain("No active assignments yet");
  });

  it("does not expose coach-only risk, lifecycle, or relationship labels", () => {
    for (const label of [
      "At risk",
      "Churned",
      "Removed",
      "Transferred out",
      "No recent reply",
      "Low adherence trend",
      "Inactive client",
      "Manual risk",
      "lifecycle_state",
      "relationship_status",
      "risk_flags",
    ]) {
      expect(combinedClientSurfaceSource).not.toContain(label);
    }
  });

  it("keeps useful client task statuses visible", () => {
    expect(clientSurfaceSources.checkin).toContain("Check-in overdue");
    expect(clientSurfaceSources.checkin).toContain("Check-in submitted");
    expect(clientSurfaceSources.checkin).toContain("Check-in reviewed");
    expect(clientSurfaceSources.home).toContain("Scheduled");
    expect(clientSurfaceSources.home).toContain("Completed");
    expect(clientSurfaceSources.home).toContain("Rest day");
  });

  it("keeps client home focused on workout preview, nutrition, and the promoted calendar", () => {
    const agendaStart = clientSurfaceSources.home.indexOf(
      'id="home-section-next-up"',
    );
    const agendaEnd = clientSurfaceSources.home.indexOf(
      'id="home-section-checklist"',
    );
    const agendaSource = clientSurfaceSources.home.slice(
      agendaStart,
      agendaEnd,
    );

    expect(agendaSource).toContain("Today&apos;s agenda");
    expect(clientSurfaceSources.home).toContain("Today&apos;s workout");
    expect(clientSurfaceSources.home).toContain("Today&apos;s nutrition");
    expect(clientSurfaceSources.home.indexOf("Calendar")).toBeLessThan(
      clientSurfaceSources.home.indexOf("home-section-next-up"),
    );

    expect(clientSurfaceSources.home).not.toContain("Today&apos;s focus");
    expect(clientSurfaceSources.home).not.toContain(
      "Today&apos;s workout and nutrition snapshot.",
    );
    expect(clientSurfaceSources.home).not.toContain(
      "Steps + nutrition still count.",
    );
    expect(clientSurfaceSources.home).not.toContain("weeklyStats");
    expect(clientSurfaceSources.home).toContain("Quick habit log");
    expect(clientSurfaceSources.home).toContain("Save quick log");
    expect(clientSurfaceSources.home).toContain("home-habit-steps");
    expect(clientSurfaceSources.home).toContain("Mini habit log");
    expect(clientSurfaceSources.home).not.toContain(
      "Tap each daily basic as it is done.",
    );
    expect(clientSurfaceSources.home).not.toContain("handleChecklistToggle");
    expect(clientSurfaceSources.home).not.toContain("checklistCards");
    expect(clientSurfaceSources.home).not.toContain("home-section-messages");
    expect(clientSurfaceSources.home).not.toContain("home-section-find-coach");
    expect(clientSurfaceSources.home).not.toContain("Messages and inbox");
    expect(clientSurfaceSources.home).not.toContain(
      "Discovery and application status in one place.",
    );
    expect(agendaSource).not.toContain("summaryTrainingBadgeLabel");
    expect(agendaSource).not.toContain("primaryAction");
    expect(agendaSource).not.toContain("Message your coach");
    expect(clientSurfaceSources.layout).toContain("consistencyStreak");
    expect(clientSurfaceSources.layout).toContain("client-shell-habit-logs");
  });
});
