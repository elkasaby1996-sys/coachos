import {
  createPaddleSandboxWebhookVerifier,
  PADDLE_WEBHOOK_LIMITS,
  PaddleWebhookError,
  type PaddleWebhookConfiguration,
} from "./index.ts";

type Environment = (name: string) => string | undefined;
const rejectionCodes = new Set([
  "configuration",
  "request_invalid",
  "body_too_large",
  "signature_header_invalid",
  "timestamp_outside_tolerance",
  "signature_invalid",
  "event_invalid",
  "receipt_invalid",
  "verification_failed",
]);
/** Never serialize errors or request/database values, even on unexpected failures. */
export function logPaddleWebhookRejection(
  stage: "configuration" | "verification" | "ingestion" | "dispatch",
  error: unknown,
  status: 400 | 413 | 503,
): void {
  try {
    const code =
      error instanceof PaddleWebhookError && rejectionCodes.has(error.code)
        ? error.code
        : "verification_failed";
    console.warn(
      JSON.stringify({ event: "paddle_webhook_rejected", stage, code, status }),
    );
  } catch {
    // Observability must never change acknowledgement/retry behavior.
  }
}
export function webhookConfiguration(
  env: Environment,
): PaddleWebhookConfiguration {
  if (
    env("PADDLE_ENVIRONMENT") !== "sandbox" ||
    [
      "PADDLE_LIVE_WEBHOOK_SECRET",
      "PADDLE_LIVE_WEBHOOK_SECRET_PREVIOUS",
      "PADDLE_WEBHOOK_SECRET",
    ].some((k) => env(k) !== undefined)
  ) {
    throw new PaddleWebhookError("configuration");
  }
  const current = env("PADDLE_SANDBOX_WEBHOOK_SECRET");
  const previous = env("PADDLE_SANDBOX_WEBHOOK_SECRET_PREVIOUS");
  if (!current) throw new PaddleWebhookError("configuration");
  return {
    environment: "test",
    secrets: [current, ...(previous === undefined ? [] : [previous])].map(
      (value) => ({ environment: "sandbox", value }),
    ),
  };
}

const response = (status: number) =>
  new Response(status === 200 ? "accepted" : "rejected", {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

/** Bounded streaming read; never request.json/text/arrayBuffer. */
async function rawBody(request: Request): Promise<Uint8Array> {
  const limit = PADDLE_WEBHOOK_LIMITS.bodyBytes;
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(declared) || Number(declared) > limit)
  )
    throw new PaddleWebhookError("body_too_large");
  if (!request.body) throw new PaddleWebhookError("request_invalid");
  const reader = request.body.getReader();
  const buffer = new Uint8Array(limit);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > limit - size)
        throw new PaddleWebhookError("body_too_large");
      buffer.set(value, size);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return buffer.subarray(0, size);
}

type IngestionArguments = ReturnType<
  ReturnType<typeof createPaddleSandboxWebhookVerifier>["ingestionArguments"]
>;
export interface PaddleWebhookDatabase {
  rpc(
    ...call:
      | [name: "ingest_verified_paddle_event_v1", args: IngestionArguments]
      | [
          name: "reconcile_paddle_initial_purchase_event_v1",
          args: { p_event: string },
        ]
  ): Promise<{ error: unknown; data: unknown }>;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function ingestionResult(
  value: unknown,
  eventType: string,
): value is {
  accepted: true;
  reused: boolean;
  eventId: string;
  eventType: string;
} {
  return (
    object(value) &&
    Object.keys(value).length === 4 &&
    value.accepted === true &&
    typeof value.reused === "boolean" &&
    typeof value.eventId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value.eventId,
    ) &&
    value.eventType === eventType &&
    [
      "transaction.completed",
      "subscription.created",
      "subscription.updated",
    ].includes(eventType)
  );
}
function dispatcherResult(value: unknown): boolean {
  return (
    object(value) &&
    Object.keys(value).length === 1 &&
    typeof value.status === "string" &&
    [
      "disabled",
      "not_applicable",
      "pending",
      "applied",
      "reused",
      "manual_review",
    ].includes(value.status)
  );
}
export function createPaddleWebhookIngress(
  config: PaddleWebhookConfiguration,
  database: PaddleWebhookDatabase,
) {
  const verifier = createPaddleSandboxWebhookVerifier(config);
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return response(405);
    let result;
    try {
      // Fetch exposes coalesced headers, not wire entries. Pass values untouched:
      // PREP rejects comma-coalesced signatures and repeated ts, never splitting them.
      result = await verifier.verify({
        method: request.method,
        headers: Array.from(request.headers.entries()),
        rawBody: await rawBody(request),
      });
    } catch (error) {
      const status =
        error instanceof PaddleWebhookError && error.code === "body_too_large"
          ? 413
          : 400;
      logPaddleWebhookRejection("verification", error, status);
      return response(status);
    }
    if (result.kind === "unsupported") return response(200);
    let stage: "ingestion" | "dispatch" = "ingestion";
    try {
      const stored = await database.rpc(
        "ingest_verified_paddle_event_v1",
        verifier.ingestionArguments(result.receipt),
      );
      if (
        stored.error ||
        !ingestionResult(stored.data, result.observation.eventType)
      ) {
        logPaddleWebhookRejection(stage, undefined, 503);
        return response(503);
      }
      // Separate awaited requests: retained evidence commits before authority.
      {
        stage = "dispatch";
        const dispatched = await database.rpc(
          "reconcile_paddle_initial_purchase_event_v1",
          {
            p_event: stored.data.eventId,
          },
        );
        if (dispatched.error || !dispatcherResult(dispatched.data)) {
          logPaddleWebhookRejection(stage, undefined, 503);
          return response(503);
        }
      }
      return response(200);
    } catch (error) {
      logPaddleWebhookRejection(stage, error, 503);
      return response(503);
    }
  };
}
