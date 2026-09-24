import { billingOutput } from "./billing-operator-output.mjs";
import { getLegalReleaseReadiness } from "../src/lib/legal-site.ts";

const result = getLegalReleaseReadiness();
const status = result.ready
  ? "PADDLE_LEGAL_PR_READY"
  : result.blockers.length === 1 &&
      result.blockers[0] === "APPROVED_SUPPORT_PHONE_REQUIRED"
    ? "READY_FOR_COMMIT_AFTER_SUPPORT_PHONE"
    : "LEGAL_RELEASE_BLOCKED";
billingOutput.log(JSON.stringify({ ...result, status }, null, 2));
process.exitCode = result.ready ? 0 : 1;
