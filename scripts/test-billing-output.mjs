import { join } from "node:path";
import {
  billingOutput,
  emitBillingSnapshot,
} from "./billing-operator-output.mjs";
import {
  fixture,
  references,
  paymentUrl,
} from "../tests/fixtures/billing-output-canaries.mjs";

// Local synthetic harness: no network, database or provider client.
const value = fixture();
billingOutput.log(value, JSON.stringify(value), references[0]);
billingOutput.error(value.error, value);
billingOutput.table([value]);
billingOutput.report(join(process.argv[2], "report.json"), value);
billingOutput.report(
  join(process.argv[2], "report.md"),
  `# Synthetic report\n${paymentUrl}\n${references.join("\n")}`,
);
await emitBillingSnapshot(
  { getAXState: async () => `webarea ${paymentUrl}\n${references[0]}` },
  (safe) => process.stdout.write(safe),
);
