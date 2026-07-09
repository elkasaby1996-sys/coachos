import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "home.tsx"),
  "utf8",
);

describe("client home message preview wiring", () => {
  it("renders the unified client home shell instead of falling back to the standalone lead dashboard", () => {
    expect(homePage).toContain("<ClientWorkspaceHomePage />");
    expect(homePage).not.toContain(`{hasWorkspaceMembership ? (
        <ClientWorkspaceHomePage />
      ) : (
        <ClientLeadDashboard />
      )}`);
  });

  it("keeps the old messages preview card out of the home dashboard", () => {
    expect(homePage).not.toContain("home-section-messages");
    expect(homePage).not.toContain("Messages and inbox");
    expect(homePage).not.toContain("buildClientInboxThreadParam");
    expect(homePage).not.toContain("dedupeLeadThreadSummaries");
  });
});
