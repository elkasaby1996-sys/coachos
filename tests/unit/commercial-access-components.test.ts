import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CommercialAccessBanner } from "../../src/features/commercial-access/commercial-access-banner";
import { SubscriptionRecoveryScreen } from "../../src/features/commercial-access/subscription-recovery-screen";
import type { AccessMode } from "../../src/features/commercial-access/contracts";
const banner = (mode: AccessMode, owner = true, reason?: string) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(CommercialAccessBanner, { mode, owner, reason }),
    ),
  );
describe("commercial recovery presentation", () => {
  it("does not add a banner to full access", () =>
    expect(banner("full")).toBe(""));
  it.each(["grace", "trial_recovery"])(
    "retains existing delivery guidance for %s",
    (reason) => {
      const html = banner("existing_delivery_only", true, reason);
      expect(html).toContain("Existing client delivery remains available");
      expect(html).toContain("Review Billing");
    },
  );
  it("warns past-due owners while retaining full access", () =>
    expect(banner("full", true, "past_due")).toContain(
      "Your current access is still available",
    ));
  it("gives read-only owners reducing and export guidance", () =>
    expect(banner("read_only")).toContain("reduce commitments"));
  it("gives teams only generic owner-contact guidance", () => {
    const html = banner("read_only", false);
    expect(html).toContain("Contact its owner");
    expect(html).not.toContain("Review Billing");
    expect(html).not.toMatch(/payment|price|plan|provider/);
  });
  it("distinguishes data-quality recovery from expiry", () => {
    const html = banner("read_only", true, "owner_recovery_required");
    expect(html).toContain("could not confirm");
    expect(html).toContain("/contact");
    expect(html).not.toContain("expired");
  });
  it("retains owner Billing and security in recovery", () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SubscriptionRecoveryScreen),
      ),
    );
    expect(html).toContain("Billing and recovery");
    expect(html).toContain("Account security");
    expect(html).toContain("Privacy and export");
  });
  it("does not turn an unavailable access service into expiration", () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SubscriptionRecoveryScreen, { error: true }),
      ),
    );
    expect(html).toContain("Access could not be checked");
    expect(html).toContain("Retry access check");
    expect(html).not.toContain("expired");
  });
});
