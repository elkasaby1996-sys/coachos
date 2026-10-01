import { BillingError, boundedBody, object } from "./billing-common.ts";
import type { BillingDependencies } from "./billing-handlers.ts";
import type {
  PaymentMethodUpdateExpectation,
  PreparedPaymentMethodUpdate,
} from "./billing-provider.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, private",
};
const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });
const codes = new Set([
  "BILLING_PAYMENT_METHOD_UNAVAILABLE",
  "BILLING_PAYMENT_METHOD_AMBIGUOUS",
  "BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED",
  "BILLING_PAYMENT_METHOD_OWNER_REQUIRED",
  "BILLING_PAYMENT_METHOD_PROVIDER_FAILED",
  "BILLING_PAYMENT_METHOD_PROVIDER_AMBIGUOUS",
]);

export function paymentMethodRequest(value: unknown): "update_payment_method" {
  const body = object(value);
  if (Object.keys(body).length !== 1 || body.intent !== "update_payment_method")
    throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 400);
  return "update_payment_method";
}

function expectation(value: unknown): PaymentMethodUpdateExpectation {
  const ctx = object(value);
  if (
    ctx.provider !== "paddle" ||
    ctx.environment !== "test" ||
    !["update_only", "settle_existing_balance"].includes(ctx.mode) ||
    typeof ctx.subscriptionRef !== "string" ||
    typeof ctx.customerRef !== "string" ||
    !Array.isArray(ctx.items) ||
    ctx.items.length < 1 ||
    ctx.items.length > 2
  )
    throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 503);
  const items = ctx.items.map((raw: unknown) => {
    const item = object(raw);
    if (
      typeof item.priceRef !== "string" ||
      typeof item.productRef !== "string" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      typeof item.amount !== "string"
    )
      throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 503);
    return {
      priceReference: item.priceRef as string,
      productReference: item.productRef as string,
      quantity: item.quantity as number,
      unitAmountMinor: item.amount as string,
    };
  });
  let obligation: PaymentMethodUpdateExpectation["obligation"];
  if (ctx.mode === "settle_existing_balance") {
    const debt = object(ctx.obligation),
      period = object(debt.servicePeriod);
    if (
      typeof debt.providerTransactionReference !== "string" ||
      typeof debt.amountMinor !== "string" ||
      typeof debt.currency !== "string" ||
      typeof period.startsAt !== "string" ||
      typeof period.endsAt !== "string"
    )
      throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 503);
    obligation = {
      transactionReference: debt.providerTransactionReference,
      amountMinor: debt.amountMinor,
      currency: debt.currency,
      period: { startsAt: period.startsAt, endsAt: period.endsAt },
    };
  }
  return {
    identity: {
      provider: "paddle",
      environment: "test",
      subscriptionReference: ctx.subscriptionRef,
      customerReference: ctx.customerRef,
    },
    mode: ctx.mode,
    items,
    ...(obligation ? { obligation } : {}),
  };
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer,
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Server-only orchestration. The browser supplies an intent and no identity. */
export async function handlePaymentMethodUpdate(
  request: Request,
  deps: BillingDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST")
    return reply({ code: "BILLING_PAYMENT_METHOD_UNAVAILABLE" }, 405);
  let preparationId: string | undefined;
  let claimHash: string | undefined;
  let claimed = false;
  try {
    const jwt = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    const owner = jwt ? await deps.authenticate(jwt) : null;
    if (!owner)
      throw new BillingError("BILLING_PAYMENT_METHOD_OWNER_REQUIRED", 401);
    try {
      paymentMethodRequest(
        JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))),
      );
    } catch {
      throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 400);
    }
    // Resolve before selecting a provider, then let begin resolve again under
    // the account lock. New-sales configuration never chooses this adapter.
    const context = object(
      await deps.serviceRpc("resolve_owned_billing_payment_method_context_v1", {
        p_owner: owner.id,
      }),
    );
    if (!deps.paymentMethodTransport)
      throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 503);
    const transport = deps.paymentMethodTransport(
      context.provider,
      context.environment,
    );
    transport.validateConfiguration();
    const begun = object(
      await deps.serviceRpc("begin_billing_payment_method_preparation_v1", {
        p_owner: owner.id,
      }),
    );
    if (typeof begun.preparationId !== "string")
      throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 503);
    preparationId = begun.preparationId;
    if (begun.status === "creating" && begun.claimed === true)
      throw new BillingError("BILLING_PAYMENT_METHOD_AMBIGUOUS", 409);
    let prepared: PreparedPaymentMethodUpdate;
    if (begun.status === "ready") {
      if (typeof begun.transactionRef !== "string")
        throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 503);
      prepared = await transport.inspect(
        expectation(begun.context),
        begun.transactionRef,
      );
    } else if (begun.status === "creating") {
      const claim = crypto.getRandomValues(new Uint8Array(32));
      claimHash = await digest(claim);
      const permit = object(
        await deps.serviceRpc("claim_billing_payment_method_dispatch_v1", {
          p_owner: owner.id,
          p_preparation: preparationId,
          p_token_sha256: claimHash,
        }),
      );
      if (permit.dispatch !== true)
        throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 409);
      claimed = true;
      let consumed = false;
      prepared = await transport.prepare(expectation(permit.context), {
        consume: () => {
          if (consumed) return false;
          consumed = true;
          return true;
        },
      });
      const recorded = object(
        await deps.serviceRpc(
          "record_billing_payment_method_preparation_result_v1",
          {
            p_owner: owner.id,
            p_preparation: preparationId,
            p_token_sha256: claimHash,
            p_transaction_ref: prepared.transactionReference,
            p_validator_version: "paddle-payment-method-transaction-v1",
            p_result_sha256: prepared.normalizedResultSha256,
          },
        ),
      );
      if (recorded.status !== "ready" && recorded.status !== "completed")
        throw new BillingError("BILLING_PAYMENT_METHOD_AMBIGUOUS", 503, true);
      if (recorded.status === "completed")
        throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 409);
    } else {
      throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 409);
    }
    if (prepared.status !== "checkout_ready")
      throw new BillingError("BILLING_PAYMENT_METHOD_UNAVAILABLE", 409);
    const authorized = object(
      await deps.serviceRpc(
        "authorize_billing_payment_method_continuation_v1",
        {
          p_owner: owner.id,
          p_preparation: preparationId,
        },
      ),
    );
    if (
      authorized.status !== "ready" ||
      authorized.transactionRef !== prepared.transactionReference
    )
      throw new BillingError("BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED", 409);
    return reply({
      intent: "update_payment_method",
      effect: prepared.effect,
      continuation: prepared.release(),
    });
  } catch (error) {
    if (claimed && preparationId && claimHash) {
      try {
        await deps.serviceRpc("fail_billing_payment_method_preparation_v1", {
          p_preparation: preparationId,
          p_token_sha256: claimHash,
          p_error_code: "provider_ambiguous",
        });
      } catch {
        /* Committed claim remains a no-redispatch fence. */
      }
    }
    const code =
      error instanceof BillingError && codes.has(error.code)
        ? error.code
        : "BILLING_PAYMENT_METHOD_UNAVAILABLE";
    deps.log?.({ code, processingStatus: claimed ? "pending" : "denied" });
    return reply(
      { code },
      error instanceof BillingError ? error.httpStatus : 503,
    );
  }
}
