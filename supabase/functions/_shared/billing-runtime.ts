import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { createBillingRuntimeDependencies } from "./billing-runtime-dependencies.ts";
import type { BillingDependencies } from "./billing-handlers.ts";

export function billingDependencies(): BillingDependencies {
  return createBillingRuntimeDependencies(
    createClient,
    (name) => Deno.env.get(name)?.trim() ?? "",
  );
}
