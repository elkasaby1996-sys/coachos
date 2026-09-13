import payload from "./public-catalogue-v2.generated";
import { deepFreeze, publicCommercialCatalogueV2Schema } from "./catalogue-v2";

/** Generated from the local RPC, then reviewed; never fetched during public rendering. */
export const PUBLIC_CATALOGUE_V2 = deepFreeze(
  publicCommercialCatalogueV2Schema.parse(payload),
);
