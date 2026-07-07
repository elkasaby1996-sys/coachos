import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

const ptLayout = readSource("src", "components", "layouts", "pt-layout.tsx");
const checkinsPage = readSource("src", "pages", "pt", "checkins.tsx");
const routes = readSource("src", "routes", "app.tsx");

describe("PT check-in templates navigation", () => {
  it("exposes check-in templates from the Build sidebar section", () => {
    const buildSectionStart = ptLayout.indexOf('label: "Build"');
    const controlSectionStart = ptLayout.indexOf('label: "Control"');
    const buildSection = ptLayout.slice(buildSectionStart, controlSectionStart);

    expect(buildSection).toContain('label: "Check-in Templates"');
    expect(buildSection).toContain('to: "/pt/checkins/templates"');
    expect(buildSection).toContain("icon: ClipboardCheck");
    expect(routes).toContain('path="checkins/templates"');
  });

  it("keeps the check-in queue free of duplicate template management actions", () => {
    expect(checkinsPage).not.toContain("Manage templates");
    expect(checkinsPage).not.toContain('navigate("/pt/checkins/templates")');
  });
});
