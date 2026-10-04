import type { createClient as SupabaseCreateClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { BillingError } from "./billing-common.ts";
import type { BillingDependencies, Rpc } from "./billing-handlers.ts";
import { planChangeCodes } from "./billing-plan-change.ts";
import { seatQuantityCodes } from "./billing-seat-quantity.ts";
import { paddleCheckoutRpcError } from "./paddle-checkout-rpc.ts";
import { paddleProviderRegistry } from "./paddle-runtime-provider.ts";
import { handlePaddlePlanAction } from "./paddle-plan-change.ts";
import { handlePaddleSeatAction } from "./paddle-seat-quantity.ts";
import {
  projectPaddlePlanResult,
  legacyPaddlePlanPreview,
} from "./paddle-workflow-projection.ts";

const safeDatabaseCodes = new Set([
  ...planChangeCodes,
  ...seatQuantityCodes,
  "BILLING_FORBIDDEN",
  "BILLING_INVALID_INPUT",
  "BILLING_ALREADY_SUBSCRIBED",
  "BILLING_VARIANT_MAPPING_UNAVAILABLE",
  "BILLING_VARIANT_MAPPING_MISMATCH",
  "BILLING_CHECKOUT_ALREADY_OPEN",
  "BILLING_CHECKOUT_OPERATION_CONFLICT",
  "BILLING_CHECKOUT_CREATION_AMBIGUOUS",
  "BILLING_CHECKOUT_EXPIRED",
  "BILLING_PAYMENT_METHOD_UNAVAILABLE",
  "BILLING_PAYMENT_METHOD_AMBIGUOUS",
  "BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED",
  "BILLING_PAYMENT_METHOD_RESULT_INVALID",
]);
export function createBillingRuntimeDependencies(
  createClient: typeof SupabaseCreateClient,
  env: (name: string) => string,
  transport: typeof fetch = fetch,
): BillingDependencies {
  const service = createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const rpc =
    (client: typeof service): Rpc =>
    async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      if (error) {
        const paddleCode = paddleCheckoutRpcError(name, error);
        if (paddleCode) throw new Error(paddleCode);
      }
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
  const dependencies: BillingDependencies = {
    providerAvailable: (provider) => {
      try {
        paddleProviderRegistry.forSubscription(provider);
        return true;
      } catch {
        return false;
      }
    },
    paymentMethodTransport: (provider, environment) =>
      paddleProviderRegistry
        .forSubscription(provider)
        .createPaymentMethodTransport(
          env("PADDLE_ENVIRONMENT") === "sandbox" ? environment : "",
          env("PADDLE_SANDBOX_PAYMENT_METHOD_API_KEY"),
          transport,
        ),
    planAction: async (provider, owner, token, action, input) => {
      const adapter = paddleProviderRegistry.forSubscription(provider);
      return projectPaddlePlanResult(
        action,
        await handlePaddlePlanAction(
          {
            ...dependencies,
            paddlePlans: () =>
              adapter.createPlanTransport(
                env("PADDLE_ENVIRONMENT") === "sandbox" ? "test" : "",
                env("PADDLE_SANDBOX_API_KEY"),
                transport,
              ),
          },
          owner,
          token,
          action,
          input,
        ),
      );
    },
    seatAction: async (provider, owner, token, action, input) => {
      const adapter = paddleProviderRegistry.forSubscription(provider);
      return handlePaddleSeatAction(
        {
          ...dependencies,
          paddleSeats: () =>
            adapter.createSeatTransport(
              env("PADDLE_ENVIRONMENT") === "sandbox" ? "test" : "",
              env("PADDLE_SANDBOX_API_KEY"),
              transport,
            ),
        },
        owner,
        token,
        action,
        input,
      );
    },
    legacyPlanPreview: legacyPaddlePlanPreview,
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
  return dependencies;
}
