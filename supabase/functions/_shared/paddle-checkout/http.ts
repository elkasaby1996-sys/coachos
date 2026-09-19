import { PADDLE_SANDBOX_ORIGIN } from "../paddle-catalogue/config.ts";
import {
  fail,
  PaddleCheckoutError,
  type CheckoutErrorCode,
} from "./validation.ts";

export const PADDLE_CHECKOUT_LIMITS = Object.freeze({
  requestBytes: 4096,
  responseBytes: 1048576,
  timeoutMs: 10000,
});
/** Explicit injection only. No ambient fetch and no automatic retries, including GET. */
export function checkoutHttp(
  fetcher: typeof fetch,
  authorization: () => string,
) {
  return async (
    method: "GET" | "POST",
    path: string,
    body?: string,
  ): Promise<unknown> => {
    if (
      (method !== "POST" && method !== "GET") ||
      (method === "POST" && path !== "/transactions") ||
      (method === "GET" && !/^\/transactions\/[^/?#]+$/.test(path))
    )
      fail("invalid_input");
    if (
      body !== undefined &&
      new TextEncoder().encode(body).byteLength >
        PADDLE_CHECKOUT_LIMITS.requestBytes
    )
      fail("body_too_large");
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let response: Response | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      controller.abort();
      void (reader ? reader.cancel() : response?.body?.cancel())?.catch(
        () => {},
      );
    };
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        cancel();
        reject(new PaddleCheckoutError("timeout"));
      }, PADDLE_CHECKOUT_LIMITS.timeoutMs);
    });
    async function operation() {
      response = await fetcher(new URL(path, PADDLE_SANDBOX_ORIGIN), {
        method,
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: authorization(),
          Accept: "application/json",
          "Paddle-Version": "1",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
      });
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        throw new PaddleCheckoutError("timeout");
      }
      if (response.status !== (method === "POST" ? 201 : 200)) {
        const status = response.status;
        const codes: Record<number, CheckoutErrorCode> = {
          401: "unauthorized",
          403: "forbidden",
          404: "not_found",
          409: "conflict",
          422: "unprocessable",
          429: "rate_limited",
        };
        throw new PaddleCheckoutError(
          codes[status] ??
            (status >= 500 ? "provider_unavailable" : "http_error"),
          status,
        );
      }
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers.get("Content-Type") ?? "",
        )
      )
        fail("malformed_response");
      const size = response.headers.get("Content-Length");
      if (
        size !== null &&
        (!/^\d+$/.test(size) ||
          Number(size) > PADDLE_CHECKOUT_LIMITS.responseBytes)
      )
        fail("response_too_large");
      if (!response.body) fail("malformed_response");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > PADDLE_CHECKOUT_LIMITS.responseBytes)
          fail("response_too_large");
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        return JSON.parse(
          new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
            bytes,
          ),
        ) as unknown;
      } catch {
        return fail("malformed_response");
      }
    }
    try {
      return await Promise.race([operation(), timeout]);
    } catch (error) {
      throw new PaddleCheckoutError(
        error instanceof PaddleCheckoutError ? error.code : "network",
        error instanceof PaddleCheckoutError ? error.status : undefined,
        method === "POST",
      );
    } finally {
      clearTimeout(timer);
      cancel();
    }
  };
}
