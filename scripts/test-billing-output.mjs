import { join } from "node:path";
import {
  billingOutput,
  emitBillingSnapshot,
} from "./billing-operator-output.mjs";
import {
  fixture,
  references,
  paymentUrl,
  projectReferences,
  projectUrls,
} from "../tests/fixtures/billing-output-canaries.mjs";

// Local synthetic harness: no network, database or provider client.
const value = fixture();
billingOutput.log(value, JSON.stringify(value), references[0]);
billingOutput.log(
  `CLI project row: id=${projectReferences[0]} ref=${projectReferences[0]} url=${projectUrls[0]}`,
);
billingOutput.error(value.error, value);
billingOutput.error(`deployment_id=${projectReferences[1]}`);
billingOutput.table([value]);
billingOutput.report(join(process.argv[2], "report.json"), value);
billingOutput.report(
  join(process.argv[2], "report.md"),
  `# Synthetic report\n${paymentUrl}\n${references.join("\n")}\n${projectUrls.join("\n")}\n${projectReferences.join("\n")}`,
);
await emitBillingSnapshot(
  { getAXState: async () => `webarea ${paymentUrl}\n${references[0]}` },
  (safe) => process.stdout.write(safe),
);
