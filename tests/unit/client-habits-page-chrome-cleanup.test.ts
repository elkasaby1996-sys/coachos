import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const habitsSource = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "habits.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const headerStart = habitsSource.indexOf("<PortalPageHeader");
const firstSectionStart = habitsSource.indexOf("<SectionCard", headerStart);
const headerSource = habitsSource.slice(headerStart, firstSectionStart);

describe("client habits page chrome cleanup", () => {
  it("does not render the editability status pill in the page header", () => {
    expect(headerSource).toContain('title="Habits"');
    expect(headerSource).toContain("selectedDate || todayStr");
    expect(headerSource).not.toContain("actions=");
    expect(headerSource).not.toContain("Open for edits");
    expect(headerSource).not.toContain("Locked");
  });
});
