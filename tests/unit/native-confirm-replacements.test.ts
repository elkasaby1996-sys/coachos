import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const betaCriticalFiles = [
  "src/pages/pt/client-detail.tsx",
  "src/pages/pt/client-detail-tabs/pt-client-notes-tab.tsx",
  "src/pages/pt/calendar.tsx",
  "src/pages/pt/nutrition.tsx",
  "src/pages/pt/programs.tsx",
  "src/pages/pt/settings-baseline.tsx",
];

describe("native confirm replacements", () => {
  it("keeps beta-critical PT destructive actions on app dialogs", () => {
    for (const file of betaCriticalFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");

      expect(source, file).not.toContain("window.confirm");
      expect(source, file).not.toMatch(/\bconfirm\s*\(/);
    }
  });
});
