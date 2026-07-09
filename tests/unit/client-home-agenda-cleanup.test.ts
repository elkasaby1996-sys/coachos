import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "home.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const agendaStart = homeSource.indexOf('id="home-section-next-up"');
const agendaEnd = homeSource.indexOf('id="home-section-checklist"');
const agendaSource = homeSource.slice(agendaStart, agendaEnd);

describe("client home agenda cleanup", () => {
  it("does not render source or workout type tags in today's agenda", () => {
    expect(agendaSource).toContain("Today&apos;s agenda");
    expect(agendaSource).toContain("Today&apos;s workout");
    expect(agendaSource).toContain("{summaryTrainingTitle}");
    expect(agendaSource).not.toContain("todaySourceLabel");
    expect(agendaSource).not.toContain("todayTemplateInfo.workoutType");
  });
});
