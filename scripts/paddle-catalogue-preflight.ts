import { billingOutput } from "./billing-operator-output.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPaddleSandboxCatalogue } from "../supabase/functions/_shared/paddle-catalogue/index.ts";
import {
  assertServer,
  readServerEnvironment,
} from "../supabase/functions/_shared/paddle-catalogue/config.ts";
import {
  CatalogueVerificationError,
  createPaddleCatalogueVerifier,
  failedCatalogueSummary,
  type CatalogueVerificationSummary,
} from "../supabase/functions/_shared/paddle-catalogue-verifier.ts";
import { readPrivateCatalogueBinding } from "./paddle-catalogue-private-binding.ts";

/** GET-only preflight. Receipts live only in the verifier closure during this run.
 * No local/remote DB, publisher, subprocess SQL, payment or webhook integration. */
export async function runPaddleCataloguePreflight(): Promise<CatalogueVerificationSummary> {
  assertServer();
  try {
    const binding = readPrivateCatalogueBinding(
      readServerEnvironment("PADDLE_CATALOGUE_BINDING_PATH"),
    );
    const verifier = createPaddleCatalogueVerifier(
      createPaddleSandboxCatalogue(),
      binding,
      binding.expectedCatalogue,
    );
    return await verifier.verify();
  } catch (e) {
    return failedCatalogueSummary(
      e instanceof CatalogueVerificationError ? e.code : "TRANSPORT",
    );
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const summary = await runPaddleCataloguePreflight();
  billingOutput.log(JSON.stringify(summary));
  if (summary.receiptCount !== 8) process.exitCode = 1;
}
