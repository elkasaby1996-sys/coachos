import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertPaymentMethodFixtureTarget } from "../e2e/utils/payment-method-fixture-target";

describe("payment-method disposable fixture target", () => {
  it.each(["127.0.0.1", "localhost"])(
    "accepts opted-in smoke stack on %s",
    (host) => {
      expect(() =>
        assertPaymentMethodFixtureTarget({
          E2E_SUPABASE_API_URL: `http://${host}:54321`,
          REPSYNC_E2E_DISPOSABLE_LOCAL: "1",
        }),
      ).not.toThrow();
    },
  );
  it.each([undefined, "", "true", "0"])(
    "rejects default port without exact opt-in %s",
    (flag) => {
      expect(() =>
        assertPaymentMethodFixtureTarget({
          E2E_SUPABASE_API_URL: "http://127.0.0.1:54321",
          REPSYNC_E2E_DISPOSABLE_LOCAL: flag,
          CI: "true",
        }),
      ).toThrow();
    },
  );
  it.each([
    "https://127.0.0.1:54321",
    "http://remote.example:54321",
    "http://127.0.0.1.example:54321",
    "http://127.0.0.1:54322",
    "http://user:password@127.0.0.1:54321",
    "http://127.0.0.1:54321/path",
    "http://127.0.0.1:54321?target=remote",
    "http://127.0.0.1:54321#fragment",
    "",
  ])("rejects unsafe endpoint %s even with opt-in", (url) => {
    expect(() =>
      assertPaymentMethodFixtureTarget({
        E2E_SUPABASE_API_URL: url,
        REPSYNC_E2E_DISPOSABLE_LOCAL: "1",
      }),
    ).toThrow();
  });
  it.each([undefined, "1"])(
    "preserves existing isolated stack selection %s",
    (flag) => {
      const port = flag === "1" ? "58431" : "57431";
      expect(() =>
        assertPaymentMethodFixtureTarget({
          E2E_SUPABASE_API_URL: `http://127.0.0.1:${port}`,
          PAY04_DISPOSABLE_LOCAL: flag,
        }),
      ).not.toThrow();
    },
  );
  it("smoke workflow explicitly binds the locally provisioned stack", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const smoke = workflow
      .split("- name: Run default four-worker smoke gate")[1]
      .split("- name: Redact")[0];
    expect(smoke).toContain('REPSYNC_E2E_DISPOSABLE_LOCAL: "1"');
    expect(smoke).toContain(
      "E2E_SUPABASE_API_URL: ${{ env.LOCAL_SUPABASE_URL }}",
    );
    expect(smoke).toContain("run: npm run test:e2e:smoke");
  });
});
