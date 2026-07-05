import {
  createPrivateStorageObjectUrl,
  type PrivateStorageMediaAsset,
} from "./private-storage-media";

export type CheckinPhotoAsset = PrivateStorageMediaAsset;

export async function resolveCheckinPhotoRows<T extends CheckinPhotoAsset>(
  rows: T[],
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = row.storage_path?.trim() ?? "";
      if (!storagePath) {
        return row;
      }

      const objectUrl = await createPrivateStorageObjectUrl({
        bucket: "checkin-photos",
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
