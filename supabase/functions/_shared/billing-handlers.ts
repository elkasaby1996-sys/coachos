import {
  BillingError,
  boundedBody,
  checkoutRequest,
  hostedCheckoutUrl,
  normalizeWebhook,
  object,
  sha256,
  validSignature,
  type BillingProvider,
  type CheckoutOperation,
  type Environment,
} from "./lemon-squeezy.ts";

export type Rpc = (name: string, args: Record<string, unknown>) => Promise<any>;
export type BillingConfig = {
  environment: Environment;
  appBaseUrl: string;
  webhookSecret: string;
  provider: BillingProvider;
  portalAllowedHosts?: string;
};
export type BillingDependencies = {
  config: () => BillingConfig | null;
  authenticate: (
    token: string,
  ) => Promise<{ id: string; email?: string; name?: string } | null>;
  ownerRpc: (token: string) => Rpc;
  serviceRpc: Rpc;
  log?: (tags: { code: string; processingStatus: string }) => void;
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
export function billingReturnUrl(config: BillingConfig, attempt: string) {
  const base = new URL(config.appBaseUrl);
  if (
    base.username ||
    base.password ||
    (base.protocol !== "https:" &&
      !(
        config.environment === "test" &&
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(base.hostname)
      ))
  )
    throw new BillingError("BILLING_PROVIDER_NOT_CONFIGURED", 503);
  const url = new URL("/pt-hub/settings/billing", base.origin);
  url.searchParams.set("checkout", "return");
  url.searchParams.set("attempt", attempt);
  return url.toString();
}
export async function handleBillingCheckout(
  request: Request,
  deps: BillingDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: cors });
  if (request.method !== "POST")
    return response({ code: "BILLING_INVALID_INPUT" }, 405);
  let operation: CheckoutOperation | undefined;
  let dispatched = false;
  let providerCreated = false;
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    const owner = token ? await deps.authenticate(token) : null;
    if (!owner || !token) throw new BillingError("BILLING_FORBIDDEN", 401);
    let value: unknown;
    try {
      value = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 4096)),
      );
    } catch {
      throw new BillingError("BILLING_INVALID_INPUT");
    }
    const input = checkoutRequest(value),
      config = deps.config();
    if (!config) throw new BillingError("BILLING_PROVIDER_NOT_CONFIGURED", 503);
    billingReturnUrl(config, "validation");
    const begun = object(
      await deps.ownerRpc(token)("begin_my_billing_checkout_attempt", {
        p_plan_key: input.planKey,
        p_cadence: input.cadence,
        p_operation_id: input.operationId,
        p_environment: config.environment,
      }),
    );
    operation = await deps.serviceRpc("get_billing_checkout_operation", {
      p_attempt: begun.checkoutAttemptId,
      p_owner: owner.id,
      p_environment: config.environment,
    });
    const attempt = operation!.attempt;
    if (attempt.status === "ready" && !begun.shouldCreate)
      return response({
        checkoutUrl: hostedCheckoutUrl(attempt.provider_checkout_url),
        checkoutAttemptId: attempt.id,
        expiresAt: attempt.expected_expires_at,
      });
    if (!begun.shouldCreate || attempt.status !== "creating")
      throw new BillingError(
        attempt.status === "ambiguous"
          ? "BILLING_CHECKOUT_CREATION_AMBIGUOUS"
          : attempt.status === "expired"
            ? "BILLING_CHECKOUT_EXPIRED"
            : "BILLING_CHECKOUT_ALREADY_OPEN",
        409,
      );
    dispatched = true;
    const result = await config.provider.createCheckout(
      operation!,
      billingReturnUrl(config, attempt.id),
      {
        ...(owner.email ? { email: owner.email } : {}),
        ...(owner.name ? { name: owner.name } : {}),
      },
    );
    providerCreated = true;
    await deps.serviceRpc("complete_billing_checkout_attempt", {
      p_attempt: attempt.id,
      p_environment: config.environment,
      p_lease: attempt.creation_lease_expires_at,
      p_checkout_id: result.id,
      p_url: result.url,
      p_expires_at: result.expiresAt,
    });
    return response({
      checkoutUrl: result.url,
      checkoutAttemptId: attempt.id,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    const safe = providerCreated
      ? new BillingError("BILLING_CHECKOUT_CREATION_AMBIGUOUS", 503, true)
      : error instanceof BillingError
        ? error
        : new BillingError(
            dispatched
              ? "BILLING_CHECKOUT_CREATION_AMBIGUOUS"
              : "BILLING_CHECKOUT_CREATION_FAILED",
            503,
            dispatched,
          );
    if (operation && dispatched) {
      try {
        await deps.serviceRpc("fail_billing_checkout_attempt", {
          p_attempt: operation.attempt.id,
          p_environment: operation.attempt.environment,
          p_lease: operation.attempt.creation_lease_expires_at,
          p_ambiguous: safe.ambiguous,
          p_code: safe.ambiguous
            ? "BILLING_CHECKOUT_CREATION_AMBIGUOUS"
            : "BILLING_CHECKOUT_CREATION_FAILED",
        });
      } catch {
        /* Lease expiry prevents automatic retry even if persistence fails. */
      }
    }
    deps.log?.({ code: safe.code, processingStatus: "failed" });
    return response({ code: safe.code }, safe.httpStatus);
  }
}
export async function handleBillingWebhook(
  request: Request,
  deps: BillingDependencies,
): Promise<Response> {
  if (request.method !== "POST")
    return response({ code: "BILLING_INVALID_INPUT" }, 405);
  let delivery: string | undefined;
  try {
    const config = deps.config();
    if (!config) throw new BillingError("BILLING_PROVIDER_NOT_CONFIGURED", 503);
    const raw = await boundedBody(request);
    if (
      !(await validSignature(
        raw,
        request.headers.get("x-signature"),
        config.webhookSecret,
      ))
    )
      throw new BillingError("BILLING_WEBHOOK_INVALID_SIGNATURE");
    const event = request.headers.get("x-event-name");
    if (!event || !/^[a-z_]{1,100}$/.test(event))
      throw new BillingError("BILLING_WEBHOOK_EVENT_MISMATCH");
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(raw),
      );
    } catch {
      throw new BillingError("BILLING_INVALID_INPUT");
    }
    const store = await deps.serviceRpc("get_billing_provider_store", {
      p_environment: config.environment,
    });
    if (!store) throw new BillingError("BILLING_PROVIDER_NOT_CONFIGURED", 503);
    const normalized = normalizeWebhook(
      parsed,
      event,
      config.environment,
      store,
    );
    const hash = await sha256(raw),
      fingerprint = await sha256(`${config.environment}\n${event}\n${hash}`);
    delivery = await deps.serviceRpc("record_billing_webhook_delivery", {
      p_environment: config.environment,
      p_event_name: event,
      p_object_type: normalized.objectType,
      p_object_id: normalized.objectId,
      p_payload_sha256: hash,
      p_fingerprint: fingerprint,
      p_payload: normalized.payload,
    });
    const snapshot = normalized.supported
      ? await config.provider.retrieveSubscription(
          String(normalized.payload.subscription_id),
        )
      : null;
    const status = await deps.serviceRpc(
      "reconcile_billing_provider_subscription",
      { p_delivery: delivery, p_snapshot: snapshot },
    );
    if (status === "failed") {
      // Reconciliation already persisted this failed attempt; do not count it twice.
      deps.log?.({
        code: "BILLING_RECONCILIATION_FAILED",
        processingStatus: "failed",
      });
      return response({ code: "BILLING_RECONCILIATION_FAILED" }, 503);
    }
    if (status === "ignored") {
      const outcome = await deps.serviceRpc(
        "get_billing_reconciliation_result",
        { p_delivery: delivery },
      );
      if (outcome?.code === "BILLING_UNAPPROVED_PLAN_CHANGE")
        deps.log?.({
          code: "BILLING_UNAPPROVED_PLAN_CHANGE",
          processingStatus: "manual_review",
        });
    }
    return response({ status });
  } catch (error) {
    const safe =
      error instanceof BillingError
        ? error
        : new BillingError("BILLING_RECONCILIATION_FAILED", 503);
    if (delivery) {
      try {
        await deps.serviceRpc("fail_billing_webhook_delivery", {
          p_delivery: delivery,
        });
      } catch {
        /* Provider retries the 5xx. */
      }
    }
    deps.log?.({ code: safe.code, processingStatus: "failed" });
    // After a verified delivery is stored, parsing/provider failures need retry and operational attention.
    return response({ code: safe.code }, delivery ? 503 : safe.httpStatus);
  }
}
