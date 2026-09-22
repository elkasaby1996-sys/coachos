import {
  assertServer,
  type ServerEnvironmentReader,
} from "./paddle-catalogue/config.ts";
import { createPaddleSandboxCheckoutTransport } from "./paddle-checkout/index.ts";
import {
  createPaddleCheckoutOrchestrator,
  PaddleOrchestrationError,
} from "./paddle-checkout-orchestration.ts";
import type { BillingDependencies } from "./billing-handlers.ts";
import { boundedBody } from "./lemon-squeezy.ts";

export type PaddleCheckoutRuntime = Pick<
  BillingDependencies,
  "authenticate" | "serviceRpc"
> & {
  readEnvironment: ServerEnvironmentReader;
  fetch: typeof fetch;
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function response(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
const errors: Record<string, number> = {
  PADDLE_CHECKOUT_FORBIDDEN: 403,
  PADDLE_CHECKOUT_ROLLOUT_DISABLED: 403,
  PADDLE_CHECKOUT_DISABLED: 403,
  PADDLE_CHECKOUT_INVALID: 400,
  PADDLE_CHECKOUT_LEGAL_REQUIRED: 400,
  PADDLE_CHECKOUT_SEAT_POLICY: 400,
  PADDLE_CHECKOUT_MAPPING: 503,
  PADDLE_CHECKOUT_CONFLICT: 409,
  PADDLE_CHECKOUT_AMBIGUOUS: 409,
  PADDLE_CHECKOUT_NOT_DISPATCHED: 503,
  PADDLE_CHECKOUT_RECOVERY_REQUIRED: 409,
  PADDLE_CHECKOUT_PERSISTENCE: 503,
  PADDLE_CHECKOUT_CONFIGURATION: 503,
};
function fail(code: string): never {
  throw new PaddleOrchestrationError(code);
}
export function checkoutAccessMode(
  read: ServerEnvironmentReader,
): "disabled" | "pilot" | "all" {
  assertServer();
  const mode = read("PADDLE_CHECKOUT_ACCESS_MODE");
  return mode === "pilot" || mode === "all" ? mode : "disabled";
}

/** The only URL-unwrapping boundary; admission and persistence stay in the orchestrator. */
export async function handlePaddleCheckout(
  request: Request,
  runtime: () => PaddleCheckoutRuntime,
): Promise<Response> {
  if (request.method === "OPTIONS") return response({ status: "ok" }, 200);
  if (request.method !== "POST")
    return response({ code: "PADDLE_CHECKOUT_INVALID", retryable: false }, 405);
  let destinationReady = false;
  try {
    assertServer();
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token)
      return response(
        { code: "PADDLE_CHECKOUT_FORBIDDEN", retryable: false },
        401,
      );
    const deps = runtime();
    let actor;
    try {
      actor = await deps.authenticate(token);
    } catch {
      actor = null;
    }
    if (
      !actor ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(actor.id)
    )
      return response(
        { code: "PADDLE_CHECKOUT_FORBIDDEN", retryable: false },
        401,
      );
    const mode = checkoutAccessMode(deps.readEnvironment);
    if (mode === "disabled") fail("PADDLE_CHECKOUT_ROLLOUT_DISABLED");
    if (
      mode === "pilot" &&
      deps.readEnvironment("PADDLE_CHECKOUT_PILOT_USER_ID") !== actor.id
    )
      fail("PADDLE_CHECKOUT_FORBIDDEN");
    let input: unknown;
    try {
      input = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await boundedBody(request, 4096),
        ),
      );
    } catch {
      fail("PADDLE_CHECKOUT_INVALID");
    }
    // Validate configuration before any checkout persistence. This factory performs no HTTP.
    let transport;
    try {
      const hosted = deps.readEnvironment(
        "PADDLE_SANDBOX_HOSTED_CHECKOUT_LAUNCH_URL",
      );
      transport = createPaddleSandboxCheckoutTransport({
        fetch: deps.fetch,
        readEnvironment: deps.readEnvironment,
        paymentPageUrl:
          deps.readEnvironment("PADDLE_SANDBOX_PAYMENT_PAGE_URL") ?? "",
        ...(hosted === undefined ? {} : { hostedCheckoutLaunchUrl: hosted }),
      });
    } catch {
      fail("PADDLE_CHECKOUT_CONFIGURATION");
    }
    const result = await createPaddleCheckoutOrchestrator({
      authenticate: async () => actor,
      serviceRpc: deps.serviceRpc,
      transport: () => transport,
    }).checkout(token, input);
    if (!("destination" in result))
      return response(
        {
          code: "PADDLE_CHECKOUT_RECOVERY_REQUIRED",
          status: result.status,
          retryable: false,
        },
        409,
      );
    destinationReady = true;
    return response(
      { status: "ready", checkoutUrl: result.destination.destination().url },
      200,
    );
  } catch (error) {
    const code = destinationReady
      ? "PADDLE_CHECKOUT_RECOVERY_REQUIRED"
      : error instanceof PaddleOrchestrationError &&
          Object.hasOwn(errors, error.code)
        ? error.code
        : "PADDLE_CHECKOUT_CONFIGURATION";
    return response({ code, retryable: false }, errors[code]!);
  }
}
