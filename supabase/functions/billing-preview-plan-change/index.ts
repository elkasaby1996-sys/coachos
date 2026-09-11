import { billingDependencies } from "../_shared/billing-runtime.ts";
import { handlePlanChange } from "../_shared/billing-plan-change.ts";
Deno.serve((request) =>
  handlePlanChange(request, billingDependencies(), "preview"),
);
