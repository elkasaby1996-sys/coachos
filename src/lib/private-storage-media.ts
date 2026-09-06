import { supabase } from "./supabase";

export type PrivateStorageMediaAsset = {
  url: string | null;
  storage_path: string | null;
};

export async function createPrivateStorageObjectUrl(params: {
  bucket: string;
  storagePath: string;
}) {
  const { data, error } = await supabase.storage
    .from(params.bucket)
    .download(params.storagePath);

  if (error || !data) {
    return null;
  }

  return URL.createObjectURL(data);
}

export function revokePrivateObjectUrl(url: string | null | undefined) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function revokePrivateObjectUrls(
  rows: Array<PrivateStorageMediaAsset> | null | undefined,
) {
  rows?.forEach((row) => revokePrivateObjectUrl(row.url));
}
