import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  betaSupportedOAuthProviders,
  isBetaSupportedOAuthProvider,
  stagedOAuthProviders,
} from "../../src/lib/auth-provider-visibility";

const loginSource = readFileSync("src/pages/public/login.tsx", "utf8");
const ptSignupSource = readFileSync("src/pages/public/pt-signup.tsx", "utf8");
const clientSignupSource = readFileSync(
  "src/pages/public/client-signup.tsx",
  "utf8",
);
const inviteSource = readFileSync("src/pages/public/invite.tsx", "utf8");

describe("OAuth provider visibility contract", () => {
  it("keeps Google as the only active beta OAuth provider by default", () => {
    expect(betaSupportedOAuthProviders).toEqual(["google"]);
    expect(stagedOAuthProviders).toEqual(["apple", "facebook"]);
    expect(isBetaSupportedOAuthProvider("google")).toBe(true);
    expect(isBetaSupportedOAuthProvider("apple")).toBe(false);
    expect(isBetaSupportedOAuthProvider("facebook")).toBe(false);
  });

  it("keeps login and signup surfaces aligned with beta-supported providers", () => {
    for (const source of [loginSource, ptSignupSource, clientSignupSource]) {
      expect(source).toMatch(/signInWithOAuth\(\s*"google"/);
      expect(source).not.toContain("onApple=");
      expect(source).not.toContain("onFacebook=");
      expect(source).not.toContain('signInWithOAuth("apple"');
      expect(source).not.toContain('signInWithOAuth("facebook"');
    }
  });

  it("keeps invite OAuth buttons generated from the shared beta provider list", () => {
    expect(inviteSource).toContain("betaSupportedOAuthProviders.map");
    expect(inviteSource).toContain("handleOAuth(provider)");
    expect(inviteSource).toContain("signInWithOAuth(provider, redirectTo)");
    expect(inviteSource).not.toContain('handleOAuth("apple")');
    expect(inviteSource).not.toContain('handleOAuth("facebook")');
    expect(inviteSource).not.toContain('signInWithOAuth("apple"');
    expect(inviteSource).not.toContain('signInWithOAuth("facebook"');
  });

  it("keeps staged Apple and Facebook copy passive during beta", () => {
    expect(inviteSource).toContain(
      "Apple sign-in is not available during beta.",
    );
    expect(inviteSource).toContain(
      "Facebook sign-in is not available during beta.",
    );
    expect(inviteSource).not.toContain("oauth_apple");
    expect(inviteSource).not.toContain("oauth_facebook");
  });

  it("preserves email/password invite acceptance", () => {
    expect(inviteSource).toContain('value="email_password"');
    expect(inviteSource).toContain("handleEmailPassword");
    expect(inviteSource).toContain("signUpWithEmailPassword");
    expect(inviteSource).toContain("Create account");
  });
});
