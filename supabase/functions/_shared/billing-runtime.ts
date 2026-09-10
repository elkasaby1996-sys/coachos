import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { BillingError, createLemonSqueezyProvider } from "./lemon-squeezy.ts";
import type { BillingDependencies, Rpc } from "./billing-handlers.ts";

const safeDatabaseCodes = new Set([
  "BILLING_FORBIDDEN",
  "BILLING_INVALID_INPUT",
  "BILLING_ALREADY_SUBSCRIBED",
  "BILLING_VARIANT_MAPPING_UNAVAILABLE",
  "BILLING_VARIANT_MAPPING_MISMATCH",
  "BILLING_CHECKOUT_ALREADY_OPEN",
  "BILLING_CHECKOUT_OPERATION_CONFLICT",
  "BILLING_CHECKOUT_CREATION_AMBIGUOUS",
  "BILLING_CHECKOUT_EXPIRED",
]);
export function billingDependencies(): BillingDependencies {
  const env = (name: string) => Deno.env.get(name)?.trim() ?? "";
  const service = createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const rpc =
    (client: typeof service): Rpc =>
    async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      if (error)
        throw new BillingError(
          safeDatabaseCodes.has(error.message)
            ? error.message
            : "BILLING_RECONCILIATION_FAILED",
          error.code === "42501"
            ? 403
            : safeDatabaseCodes.has(error.message)
              ? 409
              : 503,
          error.message === "BILLING_CHECKOUT_CREATION_AMBIGUOUS",
        );
      return data;
    };
  return {
    config: () => {
      const environment = env("BILLING_PROVIDER_ENVIRONMENT"),
        apiKey = env("LEMONSQUEEZY_API_KEY"),
        webhookSecret = env("LEMONSQUEEZY_WEBHOOK_SECRET"),
        appBaseUrl = env("BILLING_APP_BASE_URL");
      if (
        !["test", "live"].includes(environment) ||
        !apiKey ||
        !webhookSecret ||
        !appBaseUrl
      )
        return null;
      return {
        environment: environment as "test" | "live",
        appBaseUrl,
        webhookSecret,
        provider: createLemonSqueezyProvider(apiKey),
      };
    },
    authenticate: async (token) => {
      const {
        data: { user },
        error,
      } = await service.auth.getUser(token);
      if (error || !user) return null;
      const { data: profile } = await service
        .from("pt_profiles")
        .select("display_name,full_name")
        .eq("user_id", user.id)
        .is("workspace_id", null)
        .maybeSingle();
      return {
        id: user.id,
        ...(user.email_confirmed_at && user.email ? { email: user.email } : {}),
        ...(profile?.display_name || profile?.full_name
          ? {
              name: String(profile.display_name || profile.full_name).slice(
                0,
                160,
              ),
            }
          : {}),
      };
    },
    ownerRpc: (token) =>
      rpc(
        createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false },
        }),
      ),
    serviceRpc: rpc(service),
    log: (tags) => console.info(JSON.stringify(tags)),
  };
}
