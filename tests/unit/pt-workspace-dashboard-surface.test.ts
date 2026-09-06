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

  it("keeps client attention rows to one priority pill beside the client name", () => {
    expect(dashboardSource).toContain("client.attentionLabel");
    expect(dashboardSource).toContain("Why this client is highlighted");
    expect(dashboardSource).not.toContain("LifecycleBadge");
    expect(dashboardSource).not.toContain("RiskBadge");
    expect(dashboardSource).not.toContain("signalLabel");
    expect(dashboardSource).not.toContain("nextActionLabel");
    expect(dashboardSource).not.toContain("Next:");
  });

  it("uses compact header actions so dashboard card titles align with links", () => {
    expect(dashboardSource).toContain("dashboardCardHeaderActionClass");
    expect(dashboardSource).toContain("!min-h-0");
    expect(dashboardSource).toContain("leading-none");
    expect(dashboardSource).toContain("Open clients");
    expect(dashboardSource).toContain("Open check-ins");
  });
});
