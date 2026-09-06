import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260702123000_public_pt_profile_slug_validation.sql",
  "utf8",
);
const ptHub = readFileSync("src/features/pt-hub/lib/pt-hub.ts", "utf8");
const profileEditor = readFileSync(
  "src/features/pt-hub/components/pt-hub-profile-editor.tsx",
  "utf8",
);

describe("public profile slug SQL contract", () => {
  it("enforces slug format, length, reserved words, and uniqueness in the database", () => {
    expect(migration).toContain("pt_hub_profiles_slug_format_check");
    expect(migration).toContain("length(slug) between 3 and 40");
    expect(migration).toContain("^[a-z0-9]+(?:-[a-z0-9]+)*$");
    expect(migration).toContain("'admin'");
    expect(migration).toContain("'messages'");
    expect(migration).toContain("pt_hub_profiles_slug_uidx");
    expect(migration).toContain("on public.pt_hub_profiles (lower(slug))");
  });

  it("checks slug availability without treating the current owner as a duplicate", () => {
    expect(migration).toContain(
      "create or replace function public.check_pt_profile_slug_availability",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("profile.user_id <> v_user_id");
    expect(migration).toContain("'taken'");
    expect(ptHub).toContain("checkPtProfileSlugAvailability");
    expect(ptHub).toContain("check_pt_profile_slug_availability");
  });

  it("blocks publishing with invalid slugs without restoring the ready-to-list gate", () => {
    expect(migration).toContain(
      "create or replace function public.set_pt_profile_publication",
    );
    expect(migration).toContain("Valid public URL slug");
    expect(migration).toContain("Public URL slug is already taken");
    expect(migration).not.toContain(
      "Profile visibility must be set to Ready to list",
    );
  });

  it("surfaces slug validation and availability in the profile editor", () => {
    expect(profileEditor).toContain("validatePublicProfileSlug");
    expect(profileEditor).toContain("usePtProfileSlugAvailability");
    expect(profileEditor).toContain("PUBLIC_PROFILE_SLUG_MAX_LENGTH");
    expect(profileEditor).toContain("This public slug is available.");
    expect(profileEditor).toContain(
      "Changing your public URL may break links you already shared.",
    );
  });
});
