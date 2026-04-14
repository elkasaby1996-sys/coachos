import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "home.tsx"),
  "utf8",
);

describe("client home message preview wiring", () => {
  it("uses unified inbox thread params for workspace and lead preview links", () => {
    expect(homePage).toContain("buildClientInboxThreadParam");
    expect(homePage).toContain("/app/messages?thread=");
  });

  it("dedupes lead preview items before rendering", () => {
    expect(homePage).toContain("dedupeLeadThreadSummaries");
  });
});
