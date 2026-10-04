import { handleDisabledLegacyCheckout } from "../_shared/billing-disabled-checkout.ts";

// Retain this deployed name to overwrite the retired webhook implementation.
Deno.serve(handleDisabledLegacyCheckout);
