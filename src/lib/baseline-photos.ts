import {
  createPrivateStorageObjectUrl,
  type PrivateStorageMediaAsset,
} from "./private-storage-media";

export type BaselinePhotoAsset = PrivateStorageMediaAsset & {
  photo_type: string | null;
};

export async function resolveBaselinePhotoRows<T extends BaselinePhotoAsset>(
  rows: T[],
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = row.storage_path?.trim() ?? "";
      if (!storagePath) {
        return row;
      }

      const objectUrl = await createPrivateStorageObjectUrl({
        bucket: "baseline_photos",
        storagePath,
      });
      if (!objectUrl) {
        return row;
      }

      return {
        ...row,
        url: objectUrl,
      };
    }),
  );
}
