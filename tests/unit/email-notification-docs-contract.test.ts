import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const docs = readFileSync("docs/auth-notifications.md", "utf8");

describe("email notification configuration docs", () => {
  it("documents provider-managed and app-managed email classes", () => {
    expect(docs).toContain("Provider-managed auth emails");
    expect(docs).toContain("auth.confirm_signup");
    expect(docs).toContain("auth.reset_password");
    expect(docs).toContain("auth.email_change_confirmation");
    expect(docs).toContain("auth.security_alert");
    expect(docs).toContain("App-managed product email templates");
  });

  it("documents sender, redirects, secrets, and webhook follow-ups", () => {
    expect(docs).toContain("Sender identity");
    expect(docs).toContain("Local");
    expect(docs).toContain("Staging");
    expect(docs).toContain("Production");
    expect(docs).toContain("Do not commit provider secrets");
    expect(docs).toContain("Webhook and bounce handling");
  });
});
