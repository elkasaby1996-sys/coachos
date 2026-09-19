import type {
  createVerifiedEvidenceBoundaryV2,
  VerifiedCatalogueV1,
} from "./billing-verified-receipts-v2.ts";

/** Uncomposed server-only port. SQL independently validates the serialized facts.
 * Database service credentials are trusted, as in BILLING-PROOF-01. */
export function createCatalogueEvidenceWriterV1(
  boundary: ReturnType<typeof createVerifiedEvidenceBoundaryV2>,
  database: {
    rpc(
      name: "record_verified_paddle_catalogue_v1",
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: unknown }>;
  },
) {
  return Object.freeze({
    async record(receipt: VerifiedCatalogueV1) {
      const args = boundary.catalogueArguments(receipt);
      try {
        const result = await database.rpc(
          "record_verified_paddle_catalogue_v1",
          args,
        );
        if (!result.error) return result.data;
      } catch {
        /* Never expose connection details. */
      }
      throw new Error("BILLING_CATALOGUE_PERSISTENCE_FAILED");
    },
  });
}
