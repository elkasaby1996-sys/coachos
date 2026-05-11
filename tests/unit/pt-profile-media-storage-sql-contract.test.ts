import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("PT profile media storage SQL contract", () => {
  const migration = readMigration(
    "20260511100000_restore_pt_profile_media_select_policy.sql",
  );

  it("keeps public PT profile media readable for Storage upload returning rows", () => {
    expect(migration).toContain(
      'drop policy if exists "pt_profile_media_public_select" on storage.objects',
    );
    expect(migration).toContain(
      'create policy "pt_profile_media_public_select"',
    );
    expect(migration).toContain("on storage.objects");
    expect(migration).toContain("for select");
    expect(migration).toContain("to public");
    expect(migration).toContain("bucket_id = 'pt_profile_media'");
  });
});
