import type {
  createVerifiedEvidenceBoundaryV2,
  VerifiedEventV2,
  VerifiedSubscriptionV2,
  VerifiedTransactionV2,
} from "./billing-verified-receipts-v2.ts";

type Boundary = ReturnType<typeof createVerifiedEvidenceBoundaryV2>;
export type EvidenceRpcName =
  | "record_verified_billing_event_v2"
  | "record_verified_billing_subscription_v2"
  | "record_verified_billing_transaction_v2";
export interface EvidencePersistenceV2 {
  rpc(
    name: EvidenceRpcName,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

/** Core-owned SQL serialization. No generic public record(observation) method;
 * no service credentials here; production billing runtime does not compose it. */
export function createEvidenceWriterV2(
  boundary: Boundary,
  database: EvidencePersistenceV2,
) {
  async function write(name: EvidenceRpcName, args: Record<string, unknown>) {
    try {
      const result = await database.rpc(name, args);
      if (!result.error) return result.data;
    } catch {
      // Transport exceptions may contain private connection details.
    }
    throw new Error("BILLING_EVIDENCE_PERSISTENCE_FAILED");
  }
  return Object.freeze({
    event: (receipt: VerifiedEventV2) =>
      write(
        "record_verified_billing_event_v2",
        boundary.eventArguments(receipt),
      ),
    subscription: (receipt: VerifiedSubscriptionV2) =>
      write(
        "record_verified_billing_subscription_v2",
        boundary.subscriptionArguments(receipt),
      ),
    transaction: (receipt: VerifiedTransactionV2) =>
      write(
        "record_verified_billing_transaction_v2",
        boundary.transactionArguments(receipt),
      ),
  });
}
