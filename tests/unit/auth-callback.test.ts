import { describe, expect, it } from "vitest";
import {
  getAuthCallbackHashSession,
  getCallbackFallbackPath,
  parseAuthCallbackUrl,
} from "../../src/lib/auth-callback";

describe("auth callback parsing", () => {
  it("classifies recovery callbacks without exposing tokens", () => {
    const parsed = parseAuthCallbackUrl(
      "https://app.example.com/auth/callback?type=recovery&code=secret-code&next=/auth/reset-password",
    );

    expect(parsed.kind).toBe("recovery");
    expect(parsed.hasCode).toBe(true);
    expect(parsed.nextPath).toBe("/auth/reset-password");
  });

  it("keeps reset-password next paths available even when providers omit type", () => {
    const parsed = parseAuthCallbackUrl(
      "https://app.example.com/auth/callback?code=secret-code&next=/auth/reset-password",
    );

    expect(parsed.kind).toBe("unknown");
    expect(parsed.hasCode).toBe(true);
    expect(parsed.nextPath).toBe("/auth/reset-password");
  });

  it("extracts hash-token sessions from implicit recovery links", () => {
    const session = getAuthCallbackHashSession(
      "https://app.example.com/auth/callback?type=recovery&next=/auth/reset-password#access_token=access-secret&refresh_token=refresh-secret&type=recovery",
    );

    expect(session).toEqual({
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
    });
  });

  it("rejects open redirect targets", () => {
    const parsed = parseAuthCallbackUrl(
      "https://app.example.com/auth/callback?type=oauth&next=https://evil.example.com",
    );

    expect(parsed.nextPath).toBeNull();
  });

  it("routes invite callbacks back to invite acceptance", () => {
    expect(
      getCallbackFallbackPath({
        kind: "invite",
        intent: "client",
        inviteToken: "invite-123",
      }),
    ).toBe("/invite/invite-123");
  });
});
