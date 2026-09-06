import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("PT Hub shell headers", () => {
  it("does not render removed route subtitles", () => {
    const hubLayout = readSource("src/components/layouts/pt-hub-layout.tsx");
    const i18nSource = readSource("src/lib/i18n.tsx");

    for (const removedSubtitle of [
      "Run your coaching business from one dashboard.",
      "Update the public trainer page clients will see.",
      "See every client across your coaching spaces.",
      "Open, create, and manage your coaching spaces.",
      "Check billing, invoices, and revenue at a glance.",
      "Track inquiries, conversions, and client growth.",
    ]) {
      expect(hubLayout).not.toContain(removedSubtitle);
      expect(i18nSource).not.toContain(removedSubtitle);
    }
  });
});
