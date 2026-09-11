/** Provider objects and PII never leave this adapter. No environment-selectable fake. */
export type Environment = "test" | "live";
export class BillingError extends Error {
  constructor(
    public code: string,
    public httpStatus = 400,
    public ambiguous = false,
  ) {
    super(code);
  }
}
export function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BillingError("BILLING_INVALID_INPUT");
  return value as Record<string, any>;
}
export function providerId(value: unknown): string {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^[1-9][0-9]*$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value))
  )
    throw new BillingError("BILLING_SUBSCRIPTION_IDENTITY_MISMATCH");
  return String(value);
}
export function timestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new BillingError("BILLING_INVALID_INPUT");
  return new Date(value).toISOString();
}
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function checkoutRequest(value: unknown) {
  const v = object(value);
  if (
    Object.keys(v).sort().join(",") !== "cadence,operationId,planKey" ||
    !["launch", "growth", "scale"].includes(v.planKey) ||
    !["monthly", "annual"].includes(v.cadence) ||
    typeof v.operationId !== "string" ||
    !uuidPattern.test(v.operationId)
  )
    throw new BillingError("BILLING_INVALID_INPUT");
  return {
    planKey: v.planKey as string,
    cadence: v.cadence as string,
    operationId: v.operationId as string,
  };
}
export function hostedCheckoutUrl(value: unknown): string {
  if (typeof value !== "string")
    throw new BillingError("BILLING_VARIANT_MAPPING_MISMATCH");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BillingError("BILLING_VARIANT_MAPPING_MISMATCH");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.lemonsqueezy\.com$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith("/checkout/") ||
    url.hash
  )
    throw new BillingError("BILLING_VARIANT_MAPPING_MISMATCH");
  return value;
}
export type CheckoutOperation = {
  attempt: {
    id: string;
    billing_account_id: string;
    plan_version_id: string;
    environment: Environment;
    status: string;
    expected_expires_at: string;
    creation_lease_expires_at: string;
    provider_checkout_url: string | null;
  };
  mapping: {
    provider_store_id: string;
    provider_product_id: string;
    provider_variant_id: string;
    provider_price_id: string;
    unit_amount_minor: number;
  };
};
export type CheckoutResult = { id: string; url: string; expiresAt: string };
export type SubscriptionSnapshot = {
  provider: "lemonsqueezy";
  environment: Environment;
  store_id: string;
  subscription_id: string;
  customer_id: string;
  order_id: string;
  order_item_id: string;
  product_id: string;
  variant_id: string;
  price_id: string;
  first_subscription_item_id: string;
  quantity: number;
  status: string;
  cancelled: boolean;
  renews_at: string | null;
  ends_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
};
export interface BillingProvider {
  createCheckout(
    operation: CheckoutOperation,
    returnUrl: string,
    owner: { email?: string; name?: string },
  ): Promise<CheckoutResult>;
  retrieveSubscription(id: string): Promise<SubscriptionSnapshot>;
  retrieveSubscriptionForPortal?(id: string): Promise<PortalSubscription>;
}
export type PortalSubscription = Pick<
  SubscriptionSnapshot,
  | "provider"
  | "environment"
  | "store_id"
  | "subscription_id"
  | "customer_id"
  | "status"
> & { customerPortal: unknown; updatePaymentMethod: unknown };
export function parsePortalSubscription(
  value: unknown,
  id: string,
): PortalSubscription {
  const d = object(object(value).data),
    a = object(d.attributes);
  if (
    d.type !== "subscriptions" ||
    providerId(d.id) !== id ||
    typeof a.test_mode !== "boolean" ||
    ![
      "active",
      "paused",
      "past_due",
      "unpaid",
      "cancelled",
      "expired",
    ].includes(a.status)
  )
    throw new BillingError("BILLING_PORTAL_IDENTITY_MISMATCH", 409);
  const urls = a.urls == null ? {} : object(a.urls);
  return {
    provider: "lemonsqueezy",
    environment: a.test_mode ? "test" : "live",
    store_id: providerId(a.store_id),
    subscription_id: id,
    customer_id: providerId(a.customer_id),
    status: a.status,
    customerPortal: urls.customer_portal,
    updatePaymentMethod: urls.update_payment_method,
  };
}
export function buildCheckout(
  operation: CheckoutOperation,
  returnUrl: string,
  owner: { email?: string; name?: string },
) {
  const { attempt: a, mapping: m } = operation;
  const variant = Number(providerId(m.provider_variant_id));
  return {
    data: {
      type: "checkouts",
      attributes: {
        product_options: {
          enabled_variants: [variant],
          redirect_url: returnUrl,
          receipt_button_text: "Return to RepSync",
          receipt_link_url: returnUrl,
        },
        checkout_options: {
          embed: false,
          discount: false,
          skip_trial: true,
          subscription_preview: true,
        },
        checkout_data: {
          ...owner,
          variant_quantities: [{ variant_id: variant, quantity: 1 }],
          custom: {
            billing_account_id: a.billing_account_id,
            checkout_attempt_id: a.id,
            plan_version_id: a.plan_version_id,
          },
        },
        preview: true,
        test_mode: a.environment === "test",
        expires_at: a.expected_expires_at,
      },
      relationships: {
        store: {
          data: { type: "stores", id: providerId(m.provider_store_id) },
        },
        variant: { data: { type: "variants", id: String(variant) } },
      },
    },
  };
}
export function parseCheckout(
  value: unknown,
  operation: CheckoutOperation,
): CheckoutResult {
  try {
    const d = object(object(value).data),
      a = object(d.attributes),
      p = object(a.preview),
      opts = object(a.product_options);
    const expected = operation.mapping;
    if (
      d.type !== "checkouts" ||
      typeof d.id !== "string" ||
      !d.id ||
      providerId(a.store_id) !== expected.provider_store_id ||
      providerId(a.variant_id) !== expected.provider_variant_id ||
      a.test_mode !== (operation.attempt.environment === "test") ||
      timestamp(a.expires_at) !==
        timestamp(operation.attempt.expected_expires_at) ||
      Date.parse(a.expires_at) <= Date.now() ||
      p.currency !== "USD" ||
      p.subtotal !== expected.unit_amount_minor ||
      p.discount_total !== 0 ||
      a.custom_price != null ||
      !Array.isArray(opts.enabled_variants) ||
      opts.enabled_variants.length !== 1 ||
      providerId(opts.enabled_variants[0]) !== expected.provider_variant_id
    )
      throw new Error();
    return {
      id: d.id,
      url: hostedCheckoutUrl(a.url),
      expiresAt: timestamp(a.expires_at)!,
    };
  } catch {
    throw new BillingError("BILLING_VARIANT_MAPPING_MISMATCH", 502, true);
  }
}
export function parseSubscription(
  value: unknown,
  id: string,
): SubscriptionSnapshot {
  const d = object(object(value).data),
    a = object(d.attributes);
  if (
    d.type !== "subscriptions" ||
    providerId(d.id) !== id ||
    typeof a.test_mode !== "boolean" ||
    typeof a.cancelled !== "boolean"
  )
    throw new BillingError("BILLING_SUBSCRIPTION_IDENTITY_MISMATCH");
  if (a.status === "on_trial")
    throw new BillingError("BILLING_SUBSCRIPTION_UNSUPPORTED_TRIAL");
  const item = object(a.first_subscription_item);
  if (
    providerId(item.subscription_id) !== id ||
    !Number.isInteger(item.quantity) ||
    ![
      "active",
      "paused",
      "past_due",
      "unpaid",
      "cancelled",
      "expired",
    ].includes(a.status)
  )
    throw new BillingError("BILLING_SUBSCRIPTION_IDENTITY_MISMATCH");
  return {
    provider: "lemonsqueezy",
    environment: a.test_mode ? "test" : "live",
    store_id: providerId(a.store_id),
    subscription_id: id,
    customer_id: providerId(a.customer_id),
    order_id: providerId(a.order_id),
    order_item_id: providerId(a.order_item_id),
    product_id: providerId(a.product_id),
    variant_id: providerId(a.variant_id),
    price_id: providerId(item.price_id),
    first_subscription_item_id: providerId(item.id),
    quantity: item.quantity,
    status: a.status,
    cancelled: a.cancelled,
    renews_at: timestamp(a.renews_at, true),
    ends_at: timestamp(a.ends_at, true),
    trial_ends_at: timestamp(a.trial_ends_at, true),
    created_at: timestamp(a.created_at)!,
    updated_at: timestamp(a.updated_at)!,
  };
}
export function createLemonSqueezyProvider(
  apiKey: string,
  transport: typeof fetch = fetch,
): BillingProvider {
  async function request(path: string, body?: unknown) {
    let response: Response;
    try {
      response = await transport(`https://api.lemonsqueezy.com/v1/${path}`, {
        method: body ? "POST" : "GET",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new BillingError("BILLING_CHECKOUT_CREATION_AMBIGUOUS", 503, true);
    }
    if (!response.ok)
      throw new BillingError(
        response.status === 429
          ? "BILLING_PROVIDER_RATE_LIMITED"
          : response.status >= 500
            ? "BILLING_CHECKOUT_CREATION_AMBIGUOUS"
            : "BILLING_CHECKOUT_CREATION_FAILED",
        response.status >= 500 || response.status === 429 ? 503 : 502,
        response.status >= 500 || response.status === 429,
      );
    try {
      return await response.json();
    } catch {
      throw new BillingError("BILLING_CHECKOUT_CREATION_AMBIGUOUS", 502, true);
    }
  }
  return {
    async createCheckout(operation, returnUrl, owner) {
      return parseCheckout(
        await request("checkouts", buildCheckout(operation, returnUrl, owner)),
        operation,
      );
    },
    async retrieveSubscription(id) {
      return parseSubscription(
        await request(`subscriptions/${providerId(id)}`),
        id,
      );
    },
    async retrieveSubscriptionForPortal(id) {
      return parsePortalSubscription(
        await request(`subscriptions/${providerId(id)}`),
        id,
      );
    },
  };
}
export const supportedEvents = [
  "subscription_plan_changed",
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
];
export async function sha256(bytes: Uint8Array | string) {
  const input =
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", input as Uint8Array<ArrayBuffer>),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function validSignature(
  raw: Uint8Array,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.match(/../g)!, (n) =>
    parseInt(n, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    raw as Uint8Array<ArrayBuffer>,
  );
}
export async function boundedBody(request: Request, limit = 262_144) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new BillingError("BILLING_INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new BillingError("BILLING_INVALID_INPUT");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new BillingError("BILLING_INVALID_INPUT");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export function normalizeWebhook(
  value: unknown,
  event: string,
  environment: Environment,
  store: string,
) {
  const root = object(value),
    meta = object(root.meta),
    data = object(root.data),
    a = object(data.attributes);
  if (meta.event_name !== event)
    throw new BillingError("BILLING_WEBHOOK_EVENT_MISMATCH");
  if (a.test_mode !== (environment === "test"))
    throw new BillingError("BILLING_WEBHOOK_ENVIRONMENT_MISMATCH");
  if (providerId(a.store_id) !== store)
    throw new BillingError("BILLING_WEBHOOK_STORE_MISMATCH");
  const id = providerId(data.id);
  if (typeof data.type !== "string" || !/^[a-z_-]+$/.test(data.type))
    throw new BillingError("BILLING_INVALID_INPUT");
  const supported = supportedEvents.includes(event);
  const invoice = event.startsWith("subscription_payment_");
  if (
    supported &&
    data.type !== (invoice ? "subscription-invoices" : "subscriptions")
  )
    throw new BillingError("BILLING_INVALID_INPUT");
  const payload: Record<string, unknown> = {
    store_id: store,
    test_mode: a.test_mode,
  };
  if (supported) {
    payload.subscription_id = invoice ? providerId(a.subscription_id) : id;
    payload.customer_id = providerId(a.customer_id);
    payload.created_at = timestamp(a.created_at);
    payload.updated_at = timestamp(a.updated_at);
    if (!invoice) {
      payload.product_id = providerId(a.product_id);
      payload.variant_id = providerId(a.variant_id);
    }
    if (meta.custom_data != null) {
      const custom = object(meta.custom_data);
      for (const key of [
        "billing_account_id",
        "checkout_attempt_id",
        "plan_version_id",
      ]) {
        if (custom[key] !== undefined) {
          if (typeof custom[key] !== "string" || !uuidPattern.test(custom[key]))
            throw new BillingError("BILLING_SUBSCRIPTION_IDENTITY_MISMATCH");
          payload[key] = custom[key];
        }
      }
    }
  }
  return {
    event,
    objectType: data.type as string,
    objectId: id,
    payload,
    supported,
  };
}
