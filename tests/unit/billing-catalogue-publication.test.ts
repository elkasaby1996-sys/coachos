import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  parseCatalogueProofV1,
  type CatalogueProofV1,
} from "../../supabase/functions/_shared/billing-catalogue-proof-v1";
import {
  createVerifiedEvidenceBoundaryV2,
  type AuthenticatedEvidenceVerifierV2,
  type VerifiedCatalogueV1,
  type VerifiedTransactionV2,
} from "../../supabase/functions/_shared/billing-verified-receipts-v2";
import { createCatalogueEvidenceWriterV1 } from "../../supabase/functions/_shared/billing-catalogue-writer-v1";
import type { ProofScope } from "../../supabase/functions/_shared/billing-proof-v2";

const fixture = JSON.parse(
  readFileSync(
    "supabase/tests/fixtures/billing_catalogue_fixture.psql",
    "utf8",
  ).split("$fixture$")[1],
) as CatalogueProofV1;
const proof = () => structuredClone(fixture);
function verifier(p = proof()): AuthenticatedEvidenceVerifierV2 {
  return {
    provider: "paddle",
    environment: "test",
    verifyEvent: vi.fn(),
    retrieveSubscription: vi.fn(),
    retrieveTransaction: vi.fn(),
    retrieveCatalogue: vi.fn(async () => p),
  };
}
describe("verified catalogue receipt", () => {
  it("reuses the existing boundary and exposes only copied sanitized facts", async () => {
    const p = proof(),
      boundary = createVerifiedEvidenceBoundaryV2(verifier(p));
    const token = await boundary.retrieveCatalogue(p.catalogue.priceRef);
    p.catalogue.productRef = "changed after verification";
    expect(boundary.catalogueArguments(token).p_proof).toEqual(fixture);
    const args = boundary.catalogueArguments(token);
    args.p_proof.catalogue.productRef = "changed after serialization";
    expect(boundary.catalogueArguments(token).p_proof).toEqual(fixture);
    expect(Object.keys(token)).toEqual(["toJSON"]);
    expect(Object.isFrozen(token)).toBe(true);
    expect(() => JSON.stringify(token)).toThrow("NOT_SERIALIZABLE");
    expect(() => structuredClone(token)).toThrow();
  });
  it.each([{}, fixture, { toJSON: () => fixture }, Object.create(null)])(
    "rejects a forged/JSON receipt",
    (fake) => {
      expect(() =>
        createVerifiedEvidenceBoundaryV2(verifier()).catalogueArguments(
          fake as VerifiedCatalogueV1,
        ),
      ).toThrow("RECEIPT_INVALID");
    },
  );
  it("rejects cross-instance, provider, environment and payment-kind use", async () => {
    const a = createVerifiedEvidenceBoundaryV2(verifier()),
      b = createVerifiedEvidenceBoundaryV2(verifier());
    const token = await a.retrieveCatalogue(fixture.catalogue.priceRef);
    expect(() => b.catalogueArguments(token)).toThrow("RECEIPT_INVALID");
    expect(() =>
      a.catalogueArguments(token, { provider: "paddle", environment: "live" }),
    ).toThrow("RECEIPT_INVALID");
    expect(() =>
      a.catalogueArguments(token, {
        provider: "lemon_squeezy",
        environment: "test",
      } as unknown as ProofScope),
    ).toThrow("RECEIPT_INVALID");
    expect(() =>
      a.transactionArguments(token as unknown as VerifiedTransactionV2),
    ).toThrow("RECEIPT_INVALID");
  });
  it("rejects opposite-environment verifier results and mismatched price", async () => {
    const p = proof();
    p.environment = "live";
    await expect(
      createVerifiedEvidenceBoundaryV2(verifier(p)).retrieveCatalogue(
        p.catalogue.priceRef,
      ),
    ).rejects.toThrow("RECEIPT_INVALID");
    await expect(
      createVerifiedEvidenceBoundaryV2(verifier()).retrieveCatalogue(
        "synthetic/different",
      ),
    ).rejects.toThrow("RECEIPT_INVALID");
  });
  it("fails closed without a catalogue verifier or on authentication failure", async () => {
    const v = verifier();
    delete v.retrieveCatalogue;
    await expect(
      createVerifiedEvidenceBoundaryV2(v).retrieveCatalogue(
        fixture.catalogue.priceRef,
      ),
    ).rejects.toThrow("RECEIPT_INVALID");
    v.retrieveCatalogue = vi.fn(async () => {
      throw new Error("authentication failed");
    });
    await expect(
      createVerifiedEvidenceBoundaryV2(v).retrieveCatalogue(
        fixture.catalogue.priceRef,
      ),
    ).rejects.toThrow("authentication failed");
  });
  it("writes only verified receipts to the narrow evidence RPC and sanitizes errors", async () => {
    const b = createVerifiedEvidenceBoundaryV2(verifier()),
      rpc = vi.fn(async () => ({
        data: { id: "synthetic" },
        error: null as unknown,
      }));
    const writer = createCatalogueEvidenceWriterV1(b, { rpc });
    await expect(writer.record({} as VerifiedCatalogueV1)).rejects.toThrow(
      "RECEIPT_INVALID",
    );
    expect(rpc).not.toHaveBeenCalled();
    const token = await b.retrieveCatalogue(fixture.catalogue.priceRef);
    await writer.record(token);
    expect(rpc).toHaveBeenCalledWith("record_verified_paddle_catalogue_v1", {
      p_proof: fixture,
    });
    rpc.mockRejectedValueOnce(new Error("secret connection details"));
    await expect(writer.record(token)).rejects.toThrow(
      "BILLING_CATALOGUE_PERSISTENCE_FAILED",
    );
  });
});
describe("closed catalogue proof", () => {
  it.each(["launch", "growth", "scale", "coach-seat"] as const)(
    "represents both cadences for %s",
    (key) => {
      for (const cadence of ["monthly", "annual"] as const) {
        const p = proof();
        Object.assign(p.catalogue, {
          canonicalKey: key,
          identityKind: key === "coach-seat" ? "addon" : "plan",
          cadence,
          recurrenceUnit: cadence === "monthly" ? "month" : "year",
          unitAmountMinor:
            { launch: 1900, growth: 5900, scale: 11900, "coach-seat": 1200 }[
              key
            ] * (cadence === "annual" ? 10 : 1),
        });
        expect(parseCatalogueProofV1(p)).toEqual(p);
      }
    },
  );
  it.each([
    (p: Record<string, unknown>) => {
      p.rawPayload = {};
    },
    (p: Record<string, unknown>) => {
      delete p.verificationRef;
    },
    (p: Record<string, unknown>) => {
      p.provider = "lemon_squeezy";
    },
    (p: Record<string, unknown>) => {
      p.validator = "structure-only-v1";
    },
    (p: Record<string, unknown>) => {
      p.evidenceClass = "verified_transaction";
    },
    (p: Record<string, unknown>) => {
      p.observedAt = "2026-02-30T00:00:00.000Z";
    },
    (p: Record<string, unknown>) => {
      (p.catalogue as Record<string, unknown>).credentials = "no";
    },
    (p: Record<string, unknown>) => {
      (p.catalogue as Record<string, unknown>).priceRef = "";
    },
    (p: Record<string, unknown>) => {
      (p.catalogue as Record<string, unknown>).unitAmountMinor = 1.5;
    },
    (p: Record<string, unknown>) => {
      (p.catalogue as Record<string, unknown>).quantity = {
        minimum: 2,
        maximum: 1,
      };
    },
    (p: Record<string, unknown>) => {
      (p.catalogue as Record<string, unknown>).trial = {
        unit: "day",
        count: 1,
        extra: true,
      };
    },
    (p: Record<string, unknown>) => {
      Object.defineProperty(p, "catalogue", {
        enumerable: true,
        get() {
          throw new Error("getter executed");
        },
      });
    },
  ])("rejects closed-schema violations %#", (mutate) => {
    const p = proof();
    mutate(p);
    expect(() => parseCatalogueProofV1(p)).toThrow(
      /BILLING_(CATALOGUE|PROOF)_INVALID/,
    );
  });
  it("keeps exact opaque references and retains adverse facts without publication authority", () => {
    const p = proof();
    p.catalogue.priceRef = " Synthetic / λ / 007 ";
    p.catalogue.currency = "EUR";
    p.catalogue.trial = { unit: "day", count: 7 };
    p.catalogue.quantity = null;
    expect(parseCatalogueProofV1(p)).toEqual(p);
  });
});
