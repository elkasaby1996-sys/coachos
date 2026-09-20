import {
  createPaddleSandboxWebhookVerifier,
  PADDLE_WEBHOOK_LIMITS,
  PaddleWebhookError,
  type PaddleWebhookConfiguration,
} from "./index.ts";

type Environment = (name: string) => string | undefined;
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

export function createPaddleWebhookIngress(
  config: PaddleWebhookConfiguration,
  database: {
    rpc(
      name: "ingest_verified_paddle_event_v1",
      args: Record<string, unknown>,
    ): Promise<{ error: unknown; data: unknown }>;
  },
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
      return response(
        error instanceof PaddleWebhookError && error.code === "body_too_large"
          ? 413
          : 400,
      );
    }
    if (result.kind === "unsupported") return response(200);
    try {
      const stored = await database.rpc(
        "ingest_verified_paddle_event_v1",
        verifier.ingestionArguments(result.receipt),
      );
      if (
        stored.error ||
        !stored.data ||
        (stored.data as { accepted?: unknown }).accepted !== true
      )
        return response(503);
      return response(200);
    } catch {
      return response(503);
    }
  };
}
