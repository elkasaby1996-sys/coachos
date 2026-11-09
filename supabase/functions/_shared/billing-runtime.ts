import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { createBillingRuntimeDependencies } from "./billing-runtime-dependencies.ts";
import type { BillingDependencies } from "./billing-handlers.ts";

export function billingDependencies(): BillingDependencies {
  return createBillingRuntimeDependencies(
    createClient,
    (name) => Deno.env.get(name)?.trim() ?? "",
  );
}
