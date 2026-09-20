/** Dormant server composition. Never installed in the active billing runtime. */
import { legalSiteConfig } from "../../../src/lib/legal-site.ts";
import { assertServer } from "./paddle-catalogue/config.ts";
import type { BillingDependencies } from "./billing-handlers.ts";
import { PaddleCheckoutError } from "./paddle-checkout/validation.ts";
import type {
  PaddleCheckoutTransport,
  PaddleCheckoutInput,
  PaddleCheckoutDestination,
} from "./paddle-checkout/contract.ts";
export const checkoutLegalVersion = legalSiteConfig.version;
export type PaddleCheckoutIntent = {
  planKey: "launch" | "growth" | "scale";
  cadence: "monthly" | "annual";
  additionalCoachSeats: number;
  legal: {
    termsAccepted: true;
    refundAcknowledged: true;
    termsVersion: string;
    refundVersion: string;
  };
};
const codes = new Set([
  "PADDLE_CHECKOUT_INVALID",
  "PADDLE_CHECKOUT_FORBIDDEN",
  "PADDLE_CHECKOUT_LEGAL_REQUIRED",
  "PADDLE_CHECKOUT_DISABLED",
  "PADDLE_CHECKOUT_SEAT_POLICY",
  "PADDLE_CHECKOUT_MAPPING",
  "PADDLE_CHECKOUT_CONFLICT",
  "PADDLE_CHECKOUT_AMBIGUOUS",
]);
export class PaddleOrchestrationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PaddleOrchestrationError";
  }
}
function fail(code: string): never {
  throw new PaddleOrchestrationError(code);
}
function closed(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail("PADDLE_CHECKOUT_INVALID");
  const props = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((k) => !props[k]?.enumerable || !("value" in props[k]))
  )
    fail("PADDLE_CHECKOUT_INVALID");
  return value as Record<string, unknown>;
}
export function parsePaddleCheckoutIntent(
  value: unknown,
): PaddleCheckoutIntent {
  const v = closed(value, [
    "planKey",
    "cadence",
    "additionalCoachSeats",
    "legal",
  ]);
  if (
    !["launch", "growth", "scale"].includes(v.planKey as string) ||
    !["monthly", "annual"].includes(v.cadence as string) ||
    !Number.isSafeInteger(v.additionalCoachSeats) ||
    Number(v.additionalCoachSeats) < 0 ||
    Number(v.additionalCoachSeats) > 5
  )
    fail("PADDLE_CHECKOUT_INVALID");
  const l = closed(v.legal, [
    "termsAccepted",
    "refundAcknowledged",
    "termsVersion",
    "refundVersion",
  ]);
  if (
    l.termsAccepted !== true ||
    l.refundAcknowledged !== true ||
    l.termsVersion !== checkoutLegalVersion ||
    l.refundVersion !== checkoutLegalVersion
  )
    fail("PADDLE_CHECKOUT_LEGAL_REQUIRED");
  return structuredClone(v) as PaddleCheckoutIntent;
}
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const ref = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 256 &&
  !/[\s\x00-\x1f\x7f]/.test(v);
type Item = {
  priceReference: string;
  productReference: string;
  quantity: number;
};
function item(value: unknown, quantity: number): Item {
  const v = closed(value, ["priceReference", "productReference", "quantity"]);
  if (
    !ref(v.priceReference) ||
    !ref(v.productReference) ||
    v.quantity !== quantity
  )
    fail("PADDLE_CHECKOUT_MAPPING");
  return v as Item;
}
export type PaddleOrchestrationDependencies = {
  authenticate: BillingDependencies["authenticate"];
  serviceRpc: BillingDependencies["serviceRpc"];
  /** Trusted server creates the existing PREP transport; never browser injectable. */
  transport: () => PaddleCheckoutTransport;
};
export type PaddleCheckoutResult =
  | { status: "ready"; destination: PaddleCheckoutDestination }
  | {
      status: "creating" | "ready" | "failed" | "expired" | "completed";
      reused: true;
    };
export function createPaddleCheckoutOrchestrator(
  deps: PaddleOrchestrationDependencies,
) {
  assertServer();
  async function call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<any> {
    try {
      return await deps.serviceRpc(name, args);
    } catch (e) {
      if (e instanceof Error && codes.has(e.message)) fail(e.message);
      fail("PADDLE_CHECKOUT_PERSISTENCE");
    }
  }
  return Object.freeze({
    async checkout(
      token: string,
      input: unknown,
    ): Promise<PaddleCheckoutResult> {
      assertServer();
      const intent = parsePaddleCheckoutIntent(input);
      let actor: Awaited<ReturnType<BillingDependencies["authenticate"]>>;
      try {
        actor = await deps.authenticate(token);
      } catch {
        fail("PADDLE_CHECKOUT_FORBIDDEN");
      }
      if (!token || !actor || !uuid(actor.id))
        fail("PADDLE_CHECKOUT_FORBIDDEN");
      const operation = crypto.randomUUID();
      const raw = await call("begin_paddle_checkout_v1", {
        p_actor: actor.id,
        p_plan: intent.planKey,
        p_cadence: intent.cadence,
        p_seats: intent.additionalCoachSeats,
        p_operation: operation,
        p_terms: true,
        p_refund: true,
        p_terms_version: intent.legal.termsVersion,
        p_refund_version: intent.legal.refundVersion,
      });
      if (raw?.dispatch === false) {
        const existing = closed(raw, ["dispatch", "status"]);
        if (
          !["creating", "ready", "failed", "expired", "completed"].includes(
            existing.status as string,
          )
        )
          fail("PADDLE_CHECKOUT_AMBIGUOUS");
        return { status: existing.status as "creating", reused: true };
      }
      const begun = closed(raw, [
        "dispatch",
        "status",
        "attemptReference",
        "operationReference",
        "base",
        "seats",
      ]);
      if (
        begun.dispatch !== true ||
        begun.status !== "creating" ||
        !uuid(begun.attemptReference) ||
        begun.operationReference !== operation
      )
        fail("PADDLE_CHECKOUT_MAPPING");
      const attempt = begun.attemptReference;
      const persistence = {
        p_actor: actor.id,
        p_attempt: attempt,
        p_operation: operation,
      };
      let invoked = false;
      let returned = false;
      try {
        const base = item(begun.base, 1),
          seat =
            intent.additionalCoachSeats > 0
              ? item(begun.seats, intent.additionalCoachSeats)
              : null;
        if (
          (!seat && begun.seats !== null) ||
          seat?.priceReference === base.priceReference
        )
          fail("PADDLE_CHECKOUT_MAPPING");
        const expectedItems = [base, ...(seat ? [seat] : [])];
        const expected: PaddleCheckoutInput = {
          base: { priceReference: base.priceReference, quantity: 1 },
          ...(seat
            ? {
                seats: {
                  priceReference: seat.priceReference,
                  quantity: seat.quantity,
                },
              }
            : {}),
          correlation: {
            operationReference: operation,
            attemptReference: attempt,
          },
        };
        const transport = deps.transport();
        invoked = true;
        const observation = await transport.createCheckoutTransaction(expected);
        returned = true;
        if (
          observation.provider !== "paddle" ||
          observation.environment !== "test" ||
          !["draft", "ready"].includes(observation.status) ||
          !ref(observation.transactionReference) ||
          observation.currency !== "USD" ||
          observation.correlation.operationReference !== operation ||
          observation.correlation.attemptReference !== attempt ||
          observation.items.length !== expectedItems.length ||
          expectedItems.some(
            (e) =>
              observation.items.filter(
                (i) =>
                  i.priceReference === e.priceReference &&
                  i.productReference === e.productReference &&
                  i.quantity === e.quantity,
              ).length !== 1,
          ) ||
          !observation.checkout ||
          typeof observation.checkout.destination !== "function" ||
          typeof observation.checkout.toJSON !== "function"
        )
          fail("PADDLE_CHECKOUT_RESPONSE_MISMATCH");
        await call("mark_paddle_checkout_ready_v1", {
          ...persistence,
          p_transaction: observation.transactionReference,
          p_status: observation.status,
          p_currency: observation.currency,
          p_items: expectedItems,
        });
        return { status: "ready", destination: observation.checkout };
      } catch (e) {
        // Unknown failures after invocation, response drift, and lost ready commits
        // are uncertain. Never turn those into a retryable failed checkout.
        const ambiguous =
          returned ||
          (invoked &&
            !(e instanceof PaddleCheckoutError && !e.mutationMayHaveSucceeded));
        try {
          await call(
            ambiguous
              ? "mark_paddle_checkout_ambiguous_v1"
              : "mark_paddle_checkout_failed_v1",
            persistence,
          );
        } catch {
          fail("PADDLE_CHECKOUT_RECOVERY_REQUIRED");
        }
        fail(
          ambiguous
            ? "PADDLE_CHECKOUT_AMBIGUOUS"
            : "PADDLE_CHECKOUT_NOT_DISPATCHED",
        );
      }
    },
  });
}
