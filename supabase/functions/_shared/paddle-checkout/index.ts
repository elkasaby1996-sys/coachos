import type { ServerEnvironmentReader } from "../paddle-catalogue/config.ts";
import { paddleEnvironment } from "../paddle-environment.ts";
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

/** Server composition selects the realm and injects the provider transport. */
export type PaddleCheckoutDependencies = {
  fetch: typeof fetch;
  readEnvironment: ServerEnvironmentReader;
  /** Approved merchant page containing Paddle.js; this is NOT a success redirect. */
  paymentPageUrl: string;
  /** Optional dashboard-created hosted-checkout launcher in the selected realm. */
  hostedCheckoutLaunchUrl?: string;
};
export function createPaddleCheckoutTransport(
  dependencies: PaddleCheckoutDependencies,
): PaddleCheckoutTransport {
  let authorization: () => string;
  let realm: ReturnType<typeof paddleEnvironment>;
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
    realm = paddleEnvironment(dependencies.readEnvironment);
    const key = realm.key("CHECKOUT_API_KEY");
    authorization = () => `Bearer ${key}`;
    policy = destinationPolicy(
      dependencies.paymentPageUrl,
      dependencies.hostedCheckoutLaunchUrl,
      realm.environment,
    );
  } catch {
    throw new PaddleCheckoutError("configuration");
  }
  const send = checkoutHttp(
    dependencies.fetch,
    authorization,
    realm.environment,
  );
  function normalize(
    body: unknown,
    expected: PaddleCheckoutInput,
    requestedReference?: string,
  ) {
    const data = object(object(body).data);
    const facts = observation(data, expected, requestedReference);
    return {
      ...facts,
      environment: realm.environment,
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

/** Compatibility entry point deliberately remains sandbox-only. */
export function createPaddleSandboxCheckoutTransport(
  dependencies: PaddleCheckoutDependencies,
): PaddleCheckoutTransport {
  try {
    if (dependencies.readEnvironment("PADDLE_ENVIRONMENT") !== "sandbox")
      throw new Error();
    return createPaddleCheckoutTransport(dependencies);
  } catch {
    throw new PaddleCheckoutError("configuration");
  }
}
