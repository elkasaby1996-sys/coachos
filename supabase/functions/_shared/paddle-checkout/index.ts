import type { ServerEnvironmentReader } from "../paddle-catalogue/config.ts";
import { sandboxCheckoutAuthorization } from "./config.ts";
import type {
  PaddleCheckoutInput,
  PaddleCheckoutRetrieveInput,
  PaddleCheckoutTransport,
} from "./contract.ts";
import { destinationPolicy } from "./destination.ts";
import { checkoutHttp } from "./http.ts";
import {
  checkoutInput,
  closed,
  expectedItems,
  fail,
  object,
  observation,
  PaddleCheckoutError,
  reference,
} from "./validation.ts";
export type * from "./contract.ts";
export { PaddleCheckoutError } from "./validation.ts";
export { PADDLE_CHECKOUT_LIMITS } from "./http.ts";

/** Trusted composition only. PREP requires injected transport; no production wiring. */
export type PaddleCheckoutDependencies = {
  fetch: typeof fetch;
  readEnvironment: ServerEnvironmentReader;
  /** Approved merchant page containing Paddle.js; this is NOT a success redirect. */
  paymentPageUrl: string;
  /** Optional dashboard-created Paddle sandbox hosted-checkout launch URL. */
  hostedCheckoutLaunchUrl?: string;
};
export function createPaddleSandboxCheckoutTransport(
  dependencies: PaddleCheckoutDependencies,
): PaddleCheckoutTransport {
  let authorization: () => string;
  let policy: ReturnType<typeof destinationPolicy>;
  try {
    closed(
      dependencies,
      ["fetch", "readEnvironment", "paymentPageUrl"],
      ["hostedCheckoutLaunchUrl"],
    );
    if (
      typeof dependencies.fetch !== "function" ||
      typeof dependencies.readEnvironment !== "function"
    )
      fail("configuration");
    authorization = sandboxCheckoutAuthorization(dependencies.readEnvironment);
    policy = destinationPolicy(
      dependencies.paymentPageUrl,
      dependencies.hostedCheckoutLaunchUrl,
    );
  } catch {
    throw new PaddleCheckoutError("configuration");
  }
  const send = checkoutHttp(dependencies.fetch, authorization);
  function normalize(
    body: unknown,
    expected: PaddleCheckoutInput,
    requestedReference?: string,
  ) {
    const data = object(object(body).data);
    const facts = observation(data, expected, requestedReference);
    return {
      ...facts,
      checkout: policy.checkout(data.checkout, facts.transactionReference),
    };
  }
  return Object.freeze({
    async createCheckoutTransaction(input: PaddleCheckoutInput) {
      const expected = checkoutInput(input); // Snapshot trusted input before any await.
      const body = JSON.stringify({
        items: expectedItems(expected).map((item) => ({
          price_id: item.priceReference,
          quantity: item.quantity,
        })),
        collection_mode: "automatic",
        checkout: { url: policy.paymentPageUrl },
        custom_data: {
          repsync_operation_id: expected.correlation.operationReference,
          repsync_attempt_id: expected.correlation.attemptReference,
        },
      });
      const response = await send("POST", "/transactions", body);
      try {
        return normalize(response, expected);
      } catch (error) {
        throw new PaddleCheckoutError(
          error instanceof PaddleCheckoutError
            ? error.code
            : "malformed_response",
          undefined,
          true,
        );
      }
    },
    async retrieveCheckoutTransaction(input: PaddleCheckoutRetrieveInput) {
      const data = closed(input, ["transactionReference", "expected"]);
      const id = reference(data.transactionReference, "invalid_input"),
        expected = checkoutInput(data.expected);
      return normalize(
        await send("GET", `/transactions/${encodeURIComponent(id)}`),
        expected,
        id,
      );
    },
  });
}
