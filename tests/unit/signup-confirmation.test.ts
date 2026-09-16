import { describe, expect, it } from "vitest";
import {
  getSignupConfirmationCallbackPath,
  getSignupConfirmationIntent,
  parseSignupConfirmationToken,
} from "../../src/lib/signup-confirmation";

describe("signup confirmation credential and routing", () => {
  it("AUTH-CONFIRM-001: accepts opaque fragment credentials, including full URLs", () => {
    for (const prefix of ["", "https://app.example/confirm-signup"]) {
      expect(
        parseSignupConfirmationToken(
          `${prefix}#token_hash=opaque%2Bfixture%2Fvalue`,
        ),
      ).toBe("opaque+fixture/value");
    }
  });

  it.each([
    "",
    "#",
    "#token_hash=",
    "#token_hash=%20",
    "?token_hash=fixture",
    "#token_hash=a&token_hash=b",
  ])(
    "AUTH-CONFIRM-002: rejects missing, empty, query-only or ambiguous credentials: %s",
    (input) => expect(parseSignupConfirmationToken(input)).toBeNull(),
  );

  it("AUTH-CONFIRM-003/004: rejects oversized input without echoing it", () => {
    const credential = "synthetic-fixture".repeat(4096);
    const result = parseSignupConfirmationToken(`#token_hash=${credential}`);
    expect(result).toBeNull();
    expect(JSON.stringify(result)).not.toContain(credential);
    expect(
      parseSignupConfirmationToken(`#token_hash=${"x".repeat(4084)}`),
    ).toHaveLength(4084);
  });

  it.each([
    [
      "pt",
      "/auth/callback?type=signup&intent=pt&next=/pt/onboarding/workspace",
    ],
    [
      "client",
      "/auth/callback?type=signup&intent=client&next=/client/onboarding/account",
    ],
  ])(
    "AUTH-CONFIRM-005/006: verified %s intent uses its fixed path",
    (account_type, path) => {
      expect(
        getSignupConfirmationCallbackPath(
          getSignupConfirmationIntent({ account_type }),
        ),
      ).toBe(path);
    },
  );

  it.each([
    undefined,
    null,
    {},
    { account_type: "https://evil.example" },
    { account_type: "PT" },
    { account_type: ["pt"] },
  ])("AUTH-CONFIRM-007: unknown metadata has no next destination", (metadata) =>
    expect(
      getSignupConfirmationCallbackPath(getSignupConfirmationIntent(metadata)),
    ).toBe("/auth/callback?type=signup"),
  );

  it.each(["https://evil.example", "//evil.example"])(
    "AUTH-CONFIRM-008/009: URL destination %s cannot influence metadata routing",
    (target) => {
      const source = `/confirm-signup?next=${target}&redirect=${target}&returnTo=${target}&intent=pt#token_hash=fixture&type=recovery&next=${target}`;
      expect(parseSignupConfirmationToken(source)).toBe("fixture");
      expect(
        getSignupConfirmationCallbackPath(
          getSignupConfirmationIntent({ account_type: "client" }),
        ),
      ).toBe(
        "/auth/callback?type=signup&intent=client&next=/client/onboarding/account",
      );
    },
  );
});
