import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const migration = readRepoFile(
  "supabase",
  "migrations",
  "20260704134500_universal_baseline_photo_storage_access.sql",
);

const baselineTransferMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704131500_universal_baseline_transfer_continuity.sql",
);

const baselineBucketMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260328161500_baseline_photo_storage_bucket.sql",
);

const baselinePhotoResolver = readRepoFile("src", "lib", "baseline-photos.ts");
const privateStorageMedia = readRepoFile("src", "lib", "private-storage-media.ts");
const clientBaselinePage = readRepoFile("src", "pages", "client", "baseline.tsx");
const ptClientDetailPage = readRepoFile("src", "pages", "pt", "client-detail.tsx");

describe("universal baseline photo transfer storage contract", () => {
  it("documents baseline photo storage as private blob-backed media", () => {
    expect(baselineBucketMigration).toContain("'baseline_photos'");
    expect(baselineBucketMigration).toContain("false");
    expect(baselinePhotoResolver).toContain("bucket: \"baseline_photos\"");
    expect(privateStorageMedia).toContain(".download(params.storagePath)");
    expect(privateStorageMedia).toContain("URL.createObjectURL(data)");
    expect(baselinePhotoResolver).not.toContain(".getPublicUrl(");
    expect(baselinePhotoResolver).not.toContain(".createSignedUrl(");
  });

  it("keeps copied baseline photo rows pointed at valid private storage references", () => {
    expect(baselineTransferMigration).toContain("insert into public.baseline_photos");
    expect(baselineTransferMigration).toContain("p_target_client_id");
    expect(baselineTransferMigration).toContain("bp.storage_path");
    expect(baselineTransferMigration).toContain(
      "on conflict (baseline_id, photo_type) do update",
    );
    expect(baselineTransferMigration).not.toContain("insert into storage.objects");
  });

  it("allows active target client or target workspace coach to download copied universal photo objects", () => {
    expect(migration).toContain(
      'drop policy if exists "baseline_photos_objects_select" on storage.objects',
    );
    expect(migration).toContain("create policy \"baseline_photos_objects_select\"");
    expect(migration).toContain("bp.storage_path = storage.objects.name");
    expect(migration).toContain("target_be.id = bp.baseline_id");
    expect(migration).toContain("target_c.id = bp.client_id");
    expect(migration).toContain("target_c.user_id = (select auth.uid())");
    expect(migration).toContain("wm.workspace_id = target_be.workspace_id");
    expect(migration).toContain("coalesce(target_c.relationship_status, 'active') = 'active'");
  });

  it("does not require the source transferred_out relationship for active target rendering", () => {
    expect(migration).not.toContain("source_c.relationship_status");
    expect(migration).not.toContain("source_be.workspace_id");
    expect(migration).toContain("bp.storage_path = storage.objects.name");
  });

  it("does not make private baseline photos public or reusable public URLs", () => {
    expect(migration).not.toContain("set public = true");
    expect(migration).not.toContain("getPublicUrl");
    expect(clientBaselinePage).toContain("resolveBaselinePhotoRows");
    expect(ptClientDetailPage).toContain("resolveBaselinePhotoRows");
    expect(clientBaselinePage).not.toContain(".getPublicUrl(");
    expect(ptClientDetailPage).not.toContain(".getPublicUrl(");
  });

  it("does not copy workspace-specific check-in, progress, message, or log photos", () => {
    for (const table of [
      "checkin_photos",
      "checkins",
      "messages",
      "conversations",
      "workout_sessions",
      "workout_set_logs",
      "nutrition_day_logs",
      "habit_logs",
    ]) {
      expect(migration).not.toContain(`insert into public.${table}`);
      expect(migration).not.toContain(`update public.${table}`);
      expect(baselineTransferMigration).not.toContain(`insert into public.${table}`);
      expect(baselineTransferMigration).not.toContain(`update public.${table}`);
    }
  });

  it("keeps unauthorized workspaces from reading copied universal photo objects", () => {
    expect(migration).toContain("wm.user_id = (select auth.uid())");
    expect(migration).toContain("wm.role::text like 'pt_%'");
    expect(migration).toContain("wm.workspace_id = target_be.workspace_id");
    expect(migration).not.toContain("or true");
    expect(migration).not.toContain("to public");
  });
});
