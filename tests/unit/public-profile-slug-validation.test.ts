import { describe, expect, it } from "vitest";
import {
  RESERVED_PUBLIC_PROFILE_SLUGS,
  validatePublicProfileSlug,
} from "../../src/features/pt-hub/lib/public-profile-slug";

describe("public profile slug validation", () => {
  it("accepts valid human-readable public profile slugs", () => {
    expect(validatePublicProfileSlug("alex-coach").valid).toBe(true);
    expect(validatePublicProfileSlug("coach-123").valid).toBe(true);
    expect(validatePublicProfileSlug("abc").valid).toBe(true);
  });

  it("rejects uppercase, spaces, underscores, and special characters", () => {
    expect(validatePublicProfileSlug("Alex").valid).toBe(false);
    expect(validatePublicProfileSlug("alex coach").valid).toBe(false);
    expect(validatePublicProfileSlug("alex_coach").valid).toBe(false);
    expect(validatePublicProfileSlug("alex.coach").valid).toBe(false);
  });

  it("rejects leading, trailing, and double hyphens", () => {
    expect(validatePublicProfileSlug("-alex").valid).toBe(false);
    expect(validatePublicProfileSlug("alex-").valid).toBe(false);
    expect(validatePublicProfileSlug("alex--coach").valid).toBe(false);
  });

  it("rejects too-short, too-long, and empty slugs for publishing", () => {
    expect(validatePublicProfileSlug("").valid).toBe(false);
    expect(validatePublicProfileSlug("ab").valid).toBe(false);
    expect(validatePublicProfileSlug("a".repeat(41)).valid).toBe(false);
  });

  it("allows empty slugs only when saving an incomplete draft", () => {
    expect(validatePublicProfileSlug("", { allowEmpty: true }).valid).toBe(
      true,
    );
  });

  it("rejects reserved public profile slugs", () => {
    expect(RESERVED_PUBLIC_PROFILE_SLUGS.has("admin")).toBe(true);
    expect(RESERVED_PUBLIC_PROFILE_SLUGS.has("messages")).toBe(true);
    expect(validatePublicProfileSlug("admin").valid).toBe(false);
    expect(validatePublicProfileSlug("marketplace").valid).toBe(false);
  });
});
