import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaddleWebhookRequest } from "./contract.ts";

export const PADDLE_WEBHOOK_LIMITS = Object.freeze({
  bodyBytes: 262144,
  signatureBytes: 1024,
  signatures: 8,
  headerEntries: 64,
  headerBytes: 16384,
  timestampToleranceSeconds: 5,
});
export type PaddleWebhookErrorCode =
  | "configuration"
  | "request_invalid"
  | "body_too_large"
  | "signature_header_invalid"
  | "timestamp_outside_tolerance"
  | "signature_invalid"
  | "event_invalid"
  | "receipt_invalid"
  | "verification_failed";
export class PaddleWebhookError extends Error {
  constructor(readonly code: PaddleWebhookErrorCode) {
    super(`Paddle webhook: ${code}`);
    this.name = "PaddleWebhookError";
  }
}
export function fail(code: PaddleWebhookErrorCode): never {
  throw new PaddleWebhookError(code);
}

/** Trusted server composition only. The secret format does not identify its environment:
 * the secret-store binding must attest sandbox provenance. No environment lookup/fallback. */
export type PaddleWebhookConfiguration = {
  environment: "test";
  secrets: readonly { environment: "sandbox"; value: string }[];
  /** Trusted clock in epoch milliseconds; tests may inject a deterministic clock. */
  now?: () => number;
};

export function assertServer(): void {
  if (typeof window !== "undefined") fail("configuration");
}

/** Native constant-time comparison of equal-sized SHA-256 digests. Length is public. */
export function constantTimeSignatureEqual(
  expected: Uint8Array,
  candidate: Uint8Array,
): boolean {
  if (expected.byteLength !== 32 || candidate.byteLength !== 32) return false;
  return timingSafeEqual(expected, candidate);
}

export function parseSignatureHeader(header: string): {
  timestamp: string;
  signatures: Uint8Array[];
} {
  if (
    typeof header !== "string" ||
    header.length > PADDLE_WEBHOOK_LIMITS.signatureBytes ||
    !/^ts=[1-9][0-9]{0,11}(?:;h1=[a-fA-F0-9]{64})+$/.test(header)
  )
    fail("signature_header_invalid");
  const [first, ...parts] = header.split(";");
  if (parts.length > PADDLE_WEBHOOK_LIMITS.signatures)
    fail("signature_header_invalid");
  return {
    timestamp: first!.slice(3),
    signatures: parts.map((part) =>
      Uint8Array.from(part.slice(3).match(/../g)!, (hex) =>
        Number.parseInt(hex, 16),
      ),
    ),
  };
}

/** Copy bytes and header primitives synchronously before any asynchronous work.
 * Buffer.slice aliases memory, so explicitly construct a plain Uint8Array. */
export function snapshotRequest(request: PaddleWebhookRequest): {
  raw: Uint8Array;
  headers: Headers;
} {
  assertServer();
  if (
    !request ||
    request.method !== "POST" ||
    !(request.rawBody instanceof Uint8Array) ||
    !(request.rawBody.buffer instanceof ArrayBuffer) ||
    !request.rawBody.byteLength
  )
    fail("request_invalid");
  if (request.rawBody.byteLength > PADDLE_WEBHOOK_LIMITS.bodyBytes)
    fail("body_too_large");
  if (
    !Array.isArray(request.headers) ||
    request.headers.length > PADDLE_WEBHOOK_LIMITS.headerEntries
  )
    fail("request_invalid");
  const raw = new Uint8Array(request.rawBody);
  const selected = new Map<string, string>();
  let bytes = 0;
  for (const row of request.headers) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      typeof row[0] !== "string" ||
      typeof row[1] !== "string"
    )
      fail("request_invalid");
    const [name, value] = row;
    if (name.length + value.length > PADDLE_WEBHOOK_LIMITS.headerBytes)
      fail("request_invalid");
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(value))
      fail("request_invalid");
    bytes += new TextEncoder().encode(name + value).length;
    if (bytes > PADDLE_WEBHOOK_LIMITS.headerBytes) fail("request_invalid");
    const key = name.toLowerCase();
    if (
      [
        "paddle-signature",
        "content-type",
        "content-encoding",
        "content-length",
      ].includes(key)
    ) {
      if (selected.has(key))
        fail(
          key === "paddle-signature"
            ? "signature_header_invalid"
            : "request_invalid",
        );
      selected.set(key, value);
    }
  }
  const signature = selected.get("paddle-signature");
  if (!signature) fail("signature_header_invalid");
  parseSignatureHeader(signature); // Reject duplicate/coalesced representations before hashing.
  if (
    !/^application\/json(?:;\s*charset=utf-8)?$/i.test(
      selected.get("content-type") ?? "",
    ) ||
    (selected.has("content-encoding") &&
      selected.get("content-encoding") !== "identity")
  )
    fail("request_invalid");
  const length = selected.get("content-length");
  if (
    length !== undefined &&
    (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) !== raw.byteLength)
  )
    fail("request_invalid");
  return { raw, headers: new Headers({ "Paddle-Signature": signature }) };
}

export function createSignatureVerifier(config: PaddleWebhookConfiguration) {
  assertServer();
  let secrets: string[];
  let clock: () => number;
  try {
    if (
      !config ||
      Object.keys(config).some(
        (k) => !["environment", "secrets", "now"].includes(k),
      ) ||
      config.environment !== "test" ||
      !Array.isArray(config.secrets) ||
      config.secrets.length < 1 ||
      config.secrets.length > 2 ||
      (config.now !== undefined && typeof config.now !== "function")
    )
      fail("configuration");
    secrets = config.secrets.map((entry) => {
      if (
        !entry ||
        Object.keys(entry).sort().join() !== "environment,value" ||
        entry.environment !== "sandbox" ||
        typeof entry.value !== "string" ||
        !/^[\x21-\x7e]{32,256}$/.test(entry.value)
      )
        fail("configuration");
      return entry.value;
    });
    if (new Set(secrets).size !== secrets.length) fail("configuration");
    clock = config.now ?? Date.now;
  } catch {
    return fail("configuration");
  }
  return (raw: Uint8Array, headers: Headers): void => {
    const parsed = parseSignatureHeader(headers.get("Paddle-Signature") ?? "");
    const now = clock();
    if (!Number.isSafeInteger(now) || now < 0) fail("configuration");
    if (
      Math.abs(Math.floor(now / 1000) - Number(parsed.timestamp)) >
      PADDLE_WEBHOOK_LIMITS.timestampToleranceSeconds
    )
      fail("timestamp_outside_tolerance");
    let matched = 0;
    // Check every signature against every configured key; no early return on a match.
    // Duplicate h1 values are harmless and still count toward the public bound.
    for (const secret of secrets) {
      const expected = createHmac("sha256", secret)
        .update(parsed.timestamp + ":", "utf8")
        .update(raw)
        .digest();
      for (const candidate of parsed.signatures)
        matched |= Number(constantTimeSignatureEqual(expected, candidate));
    }
    if (!matched) fail("signature_invalid");
  };
}
