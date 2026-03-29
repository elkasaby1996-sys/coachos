import { supabase } from "./supabase";

export type CheckinPhotoAsset = {
  url: string | null;
  storage_path: string | null;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

export async function resolveCheckinPhotoRows<T extends CheckinPhotoAsset>(
  rows: T[],
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = row.storage_path?.trim() ?? "";
      if (!storagePath) {
        return row;
      }

      const { data, error } = await supabase.storage
        .from("checkin-photos")
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
