import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientDetailPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "client-detail.tsx"),
  "utf8",
);

describe("coach check-in settings feedback", () => {
  it("detects a submitted or reviewed check-in for today before saving settings", () => {
    expect(clientDetailPage).toContain("hasSubmittedCheckinForDate");
    expect(clientDetailPage).toContain("week_ending_saturday === todayKey");
    expect(clientDetailPage).toContain("submitted_at || row.reviewed_at");
    expect(clientDetailPage).toContain(".from(\"checkins\")");
    expect(clientDetailPage).toContain(".eq(\"week_ending_saturday\", todayKey)");
  });

  it("shows future-only feedback when today's submitted check-in is preserved", () => {
    expect(clientDetailPage).toContain(
      "This client already submitted today's check-in.",
    );
    expect(clientDetailPage).toContain(
      "Your changes will apply to future check-ins only.",
    );
  });

  it("keeps normal success feedback for settings updates without a submitted current check-in", () => {
    expect(clientDetailPage).toContain(
      "Check-in cadence updated. Future check-ins will use the new settings.",
    );
  });
});
