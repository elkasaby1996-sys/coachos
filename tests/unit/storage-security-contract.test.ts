import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(...parts: string[]) {
  return readFileSync(resolve(process.cwd(), ...parts), "utf8");
}

const checkinBucketMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260329195500_add_checkin_photos_bucket.sql",
);
const baselineBucketMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260328161500_baseline_photo_storage_bucket.sql",
);
const medicalBucketMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260402110000_add_client_medical_records.sql",
);
const ptProfileBucketMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260405201500_add_pt_profile_media_bucket.sql",
);
const ptProfileSelectMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260511100000_restore_pt_profile_media_select_policy.sql",
);

const clientCheckinPage = readRepoFile("src", "pages", "client", "checkin.tsx");
const clientBaselinePage = readRepoFile(
  "src",
  "pages",
  "client",
  "baseline.tsx",
);
const checkinPhotoResolver = readRepoFile("src", "lib", "checkin-photos.ts");
const baselinePhotoResolver = readRepoFile("src", "lib", "baseline-photos.ts");
const privateStorageMedia = readRepoFile(
  "src",
  "lib",
  "private-storage-media.ts",
);
const clientMedicalPage = readRepoFile("src", "pages", "client", "medical.tsx");
const clientProfilePage = readRepoFile("src", "pages", "client", "profile.tsx");
const ptClientDetailPage = readRepoFile("src", "pages", "pt", "client-detail.tsx");
const ptMedicalTab = readRepoFile(
  "src",
  "pages",
  "pt",
  "client-detail-tabs",
  "pt-client-medical-tab.tsx",
);
const ptProfileMediaHelper = readRepoFile(
  "src",
  "features",
  "pt-hub",
  "lib",
  "pt-profile-media.ts",
);

const privateStorageSources = [
  ["client check-in page", clientCheckinPage],
  ["client baseline page", clientBaselinePage],
  ["check-in photo resolver", checkinPhotoResolver],
  ["baseline photo resolver", baselinePhotoResolver],
  ["client medical page", clientMedicalPage],
  ["PT medical tab", ptMedicalTab],
] as const;

const storageClassification = [
  {
    bucket: "pt_profile_media",
    content: "Marketplace/public coach profile photos, banners, transformations",
    visibility: "public",
    currentState: "public=true",
    access: "getPublicUrl/public object URL",
    policies: "public select; owner-scoped insert/update/delete",
    risk: "low when limited to public profile media",
  },
  {
    bucket: "checkin-photos",
    content: "Client check-in body/progress photos",
    visibility: "private",
    currentState: "public=false",
    access: "authenticated download-to-blob object URLs",
    policies: "client draft owner manage; authorized PT read",
    risk: "high sensitivity, low residual risk with blob rendering",
  },
  {
    bucket: "baseline_photos",
    content: "Client onboarding/baseline progress photos",
    visibility: "private",
    currentState: "public=false",
    access: "authenticated download-to-blob object URLs",
    policies: "client upload/manage; client or workspace PT read",
    risk: "high sensitivity, low residual risk with blob rendering",
  },
  {
    bucket: "client-photos",
    content: "Legacy client profile photo upload path",
    visibility: "private/disabled",
    currentState: "no managed current bucket migration",
    access: "upload disabled; existing photo_url values still render",
    policies: "not managed by current migrations",
    risk: "medium until a private signed-avatar design is added",
  },
  {
    bucket: "medical_documents",
    content: "Client medical documents and lab files",
    visibility: "private",
    currentState: "public=false",
    access: "authenticated short-lived signed URLs",
    policies: "client or workspace PT access",
    risk: "high sensitivity, low residual risk with signed URLs",
  },
] as const;

describe("storage security classification", () => {
  it("documents every managed storage bucket's intended visibility", () => {
    expect(storageClassification).toMatchInlineSnapshot(`
      [
        {
          "access": "getPublicUrl/public object URL",
          "bucket": "pt_profile_media",
          "content": "Marketplace/public coach profile photos, banners, transformations",
          "currentState": "public=true",
          "policies": "public select; owner-scoped insert/update/delete",
          "risk": "low when limited to public profile media",
          "visibility": "public",
        },
        {
          "access": "authenticated download-to-blob object URLs",
          "bucket": "checkin-photos",
          "content": "Client check-in body/progress photos",
          "currentState": "public=false",
          "policies": "client draft owner manage; authorized PT read",
          "risk": "high sensitivity, low residual risk with blob rendering",
          "visibility": "private",
        },
        {
          "access": "authenticated download-to-blob object URLs",
          "bucket": "baseline_photos",
          "content": "Client onboarding/baseline progress photos",
          "currentState": "public=false",
          "policies": "client upload/manage; client or workspace PT read",
          "risk": "high sensitivity, low residual risk with blob rendering",
          "visibility": "private",
        },
        {
          "access": "upload disabled; existing photo_url values still render",
          "bucket": "client-photos",
          "content": "Legacy client profile photo upload path",
          "currentState": "no managed current bucket migration",
          "policies": "not managed by current migrations",
          "risk": "medium until a private signed-avatar design is added",
          "visibility": "private/disabled",
        },
        {
          "access": "authenticated short-lived signed URLs",
          "bucket": "medical_documents",
          "content": "Client medical documents and lab files",
          "currentState": "public=false",
          "policies": "client or workspace PT access",
          "risk": "high sensitivity, low residual risk with signed URLs",
          "visibility": "private",
        },
      ]
    `);
  });

  it("keeps only public coach profile media configured as a public bucket", () => {
    expect(ptProfileBucketMigration).toContain("'pt_profile_media'");
    expect(ptProfileBucketMigration).toContain("true");
    expect(ptProfileSelectMigration).toContain("to public");
    expect(ptProfileSelectMigration).toContain("bucket_id = 'pt_profile_media'");
    expect(ptProfileMediaHelper).toContain(".getPublicUrl(storagePath)");
  });

  it("keeps sensitive client buckets private at the storage bucket layer", () => {
    expect(checkinBucketMigration).toContain("'checkin-photos'");
    expect(checkinBucketMigration).toContain("false");
    expect(baselineBucketMigration).toContain("'baseline_photos'");
    expect(baselineBucketMigration).toContain("false");
    expect(medicalBucketMigration).toContain("'medical_documents'");
    expect(medicalBucketMigration).toContain("false");
  });

  it.each(privateStorageSources)(
    "%s does not use public URLs for private storage objects",
    (_name, source) => {
      expect(source).not.toContain(".getPublicUrl(");
    },
  );

  it("uses authenticated blob URLs for private client photo display", () => {
    expect(clientCheckinPage).toContain("resolveCheckinPhotoRows");
    expect(clientBaselinePage).toContain("createPrivateStorageObjectUrl");
    expect(checkinPhotoResolver).toContain("createPrivateStorageObjectUrl");
    expect(baselinePhotoResolver).toContain("createPrivateStorageObjectUrl");
    expect(privateStorageMedia).toContain(".download(params.storagePath)");
    expect(privateStorageMedia).toContain("URL.createObjectURL(data)");
    expect(privateStorageMedia).toContain("URL.revokeObjectURL(url)");
    expect(clientCheckinPage).not.toContain(".createSignedUrl(");
    expect(clientBaselinePage).not.toContain(".createSignedUrl(");
    expect(checkinPhotoResolver).not.toContain(".createSignedUrl(");
    expect(baselinePhotoResolver).not.toContain(".createSignedUrl(");
  });

  it("revokes private image object URLs on cleanup", () => {
    expect(clientCheckinPage).toContain("revokePrivateObjectUrls");
    expect(clientBaselinePage).toContain("revokePrivateObjectUrls");
    expect(clientBaselinePage).toContain("revokePrivateObjectUrl");
    expect(ptClientDetailPage).toContain("revokePrivateObjectUrls");
  });

  it("persists private image storage paths instead of rendered object URLs", () => {
    expect(clientCheckinPage).toContain("let storedUrl = state.existingStoragePath");
    expect(clientCheckinPage).toContain("storedUrl = storagePath");
    expect(clientBaselinePage).toContain("upsertPhotoRow(");
    expect(clientBaselinePage).toContain("filePath,\n      filePath,");
  });

  it("keeps medical documents as explicit short-lived downloads", () => {
    expect(clientMedicalPage).toContain(
      ".createSignedUrl(documentRow.storage_path",
    );
    expect(ptMedicalTab).toContain(".createSignedUrl(documentRow.storage_path");
  });

  it("does not upload client profile photos to an unmanaged public-url bucket", () => {
    expect(clientProfilePage).toContain(
      "Client photo uploads are not enabled yet.",
    );
    expect(clientProfilePage).not.toContain('from("client-photos")');
    expect(clientProfilePage).not.toContain(".getPublicUrl(");
  });
});
