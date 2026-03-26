import { supabase } from "./supabase";

export type BaselinePhotoAsset = {
  photo_type: string | null;
  url: string | null;
  storage_path: string | null;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

export async function resolveBaselinePhotoRows<T extends BaselinePhotoAsset>(
  rows: T[],
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = row.storage_path?.trim() ?? "";
      if (!storagePath) {
        return row;
      }

      const { data, error } = await supabase.storage
        .from("baseline_photos")
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

      if (error || !data?.signedUrl) {
        return row;
      }

      return {
        ...row,
        url: data.signedUrl,
      };
    }),
  );
}
