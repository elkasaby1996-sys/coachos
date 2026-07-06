import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(
  resolve(process.cwd(), "src/pages/pt/dashboard.tsx"),
  "utf8",
);

describe("PT workspace dashboard surface", () => {
  it("omits the recent messages card from the overview dashboard", () => {
    expect(dashboardSource).not.toContain('title="Recent Messages"');
    expect(dashboardSource).not.toContain("No messages yet");
    expect(dashboardSource).not.toContain("messageRows");
    expect(dashboardSource).not.toContain("setMessages");
  });
});
