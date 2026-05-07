import { supabase } from "../../../lib/supabase";

export const PT_PROFILE_MEDIA_BUCKET = "pt_profile_media";
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_MEDIA_FILE_BYTES = 10 * 1024 * 1024;

export type PtProfileMediaKind =
  | "profile-photo"
  | "banner"
  | "transformation-before"
  | "transformation-after";

function sanitizeFileExtension(file: File) {
  const derived = file.name.split(".").pop()?.trim().toLowerCase();
  if (!derived) return "jpg";
  return derived.replace(/[^a-z0-9]/g, "") || "jpg";
}

function buildStoragePath(params: {
  userId: string;
  kind: PtProfileMediaKind;
  extension: string;
  transformationId?: string;
}) {
  if (params.kind === "profile-photo") {
    return `${params.userId}/profile/profile-photo.${params.extension}`;
  }

  if (params.kind === "banner") {
    return `${params.userId}/profile/banner.${params.extension}`;
  }

  if (!params.transformationId) {
    throw new Error("Transformation uploads require a transformation ID.");
  }

  const filename =
    params.kind === "transformation-before" ? "before" : "after";
  return `${params.userId}/transformations/${params.transformationId}/${filename}.${params.extension}`;
}

export async function uploadPtProfileMedia(params: {
  userId: string;
  file: File;
  kind: PtProfileMediaKind;
  transformationId?: string;
}) {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(params.file.type)) {
    throw new Error("Please upload a JPG, PNG, or WebP image.");
  }

  if (params.file.size > MAX_MEDIA_FILE_BYTES) {
    throw new Error("Please upload an image smaller than 10 MB.");
  }

  const extension = sanitizeFileExtension(params.file);
  const storagePath = buildStoragePath({
    userId: params.userId,
    kind: params.kind,
    extension,
    transformationId: params.transformationId,
  });

  const { error: uploadError } = await supabase.storage
    .from(PT_PROFILE_MEDIA_BUCKET)
    .upload(storagePath, params.file, {
      upsert: true,
      cacheControl: "3600",
      contentType: params.file.type,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from(PT_PROFILE_MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  return {
    publicUrl: data.publicUrl,
    storagePath,
  };
}
