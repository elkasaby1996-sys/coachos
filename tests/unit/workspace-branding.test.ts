import { describe, expect, it } from "vitest";
import {
  getAccessibleAccent,
  getInviteSenderName,
  getWorkspaceBrandingStyle,
  isAccentColor,
  isLogoUrl,
} from "../../src/features/workspace-branding/branding";
import { buildWorkspaceTeamInviteEmail } from "../../src/features/workspace-team/invite-api";

describe("workspace branding", () => {
  it("accepts hex colours and rejects CSS injection", () => {
    expect(isAccentColor("#Ab12fE")).toBe(true);
    for (const value of ["red", "#fff", "#gggggg", "#123456; color:red", ""])
      expect(isAccentColor(value)).toBe(false);
    expect(getWorkspaceBrandingStyle(null)).toEqual({});
    expect(getWorkspaceBrandingStyle("invalid")).toEqual({});
  });
  it("keeps button labels readable across very light, dark and saturated colours", () => {
    for (const color of [
      "#ffffff",
      "#000000",
      "#ffff00",
      "#ff0000",
      "#0000ff",
      "#007f86",
    ]) {
      for (const dark of [false, true]) {
        const accent = getAccessibleAccent(color, dark);
        expect(accent.contrast).toBeGreaterThanOrEqual(4.5);
        expect(accent.channels).not.toMatch(/NaN|Infinity/);
      }
    }
  });
  it("only permits web image URLs", () => {
    expect(isLogoUrl("https://example.test/logo.png")).toBe(true);
    expect(isLogoUrl("http://127.0.0.1:54321/storage/logo.png")).toBe(true);
    expect(isLogoUrl("")).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml,test",
      "file:///test",
      "not a url",
    ])
      expect(isLogoUrl(url)).toBe(false);
  });
  it("uses workspace-specific sender identity with a no-reply delivery mode", () => {
    expect(
      getInviteSenderName({
        name: "Studio",
        invite_sender_name: " Coach Alex ",
      }),
    ).toBe("Coach Alex");
    expect(
      getInviteSenderName({ name: "Studio", invite_sender_name: " " }),
    ).toBe("Studio");
    const email = buildWorkspaceTeamInviteEmail({
      to: "Person@example.test",
      workspaceName: "Studio",
      ownerName: "Owner",
      senderName: "Studio Coaching",
      role: "coach",
      acceptUrl: "https://example.test/invite",
      expiresAt: "2026-10-01",
    });
    expect(email.senderName).toBe("Studio Coaching");
    expect(email.senderMode).toBe("platform_no_reply");
    expect(email.subject).toBe("Studio Coaching invited you to join Studio");
    expect(email.text).toContain("Studio Coaching invited you");
  });
});
