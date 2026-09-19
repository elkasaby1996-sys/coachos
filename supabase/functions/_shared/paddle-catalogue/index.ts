import type { PaddleCatalogueCapability } from "./contract.ts";
import {
  assertServer,
  PADDLE_SANDBOX_ORIGIN,
  readServerEnvironment,
  sandboxAuthorization,
  type ServerEnvironmentReader,
} from "./config.ts";
import {
  malformed,
  object,
  PaddleCatalogueError,
  priceObservation,
  productObservation,
  reference,
} from "./validation.ts";
export type * from "./contract.ts";
export { PaddleCatalogueError } from "./validation.ts";

export const PADDLE_CATALOGUE_LIMITS = Object.freeze({
  timeoutMs: 10000,
  operationTimeoutMs: 60000,
  responseBytes: 1048576,
  pages: 100,
  pageSize: 200,
  attempts: 3,
  retryDelayMs: 1000,
  maxRetryDelayMs: 5000,
});
type Resource = "products" | "prices";
type Dependencies = {
  readEnvironment?: ServerEnvironmentReader;
  fetch?: typeof fetch;
};

export function createPaddleSandboxCatalogue(
  dependencies: Dependencies = {},
): PaddleCatalogueCapability {
  assertServer();
  const authorization = sandboxAuthorization(
    dependencies.readEnvironment ?? readServerEnvironment,
  );
  const fetcher = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  const limits = PADDLE_CATALOGUE_LIMITS;

  async function attempt(
    url: URL,
    deadlineAt: number,
  ): Promise<{ body: unknown; retryDelay?: number }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancel = () => {
      controller.abort();
      void reader?.cancel().catch(() => {});
    };
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          cancel();
          reject(new PaddleCatalogueError("timeout"));
        },
        Math.min(limits.timeoutMs, Math.max(0, deadlineAt - Date.now())),
      );
    });
    const operation = async () => {
      const response = await fetcher(url, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: authorization(),
          Accept: "application/json",
          "Paddle-Version": "1",
        },
      });
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        throw new PaddleCatalogueError("timeout");
      }
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        const status = response.status;
        const code =
          status === 401
            ? "unauthorized"
            : status === 403
              ? "forbidden"
              : status === 404
                ? "not_found"
                : status === 429
                  ? "rate_limited"
                  : status >= 500
                    ? "provider_unavailable"
                    : "http_error";
        if (
          status === 429 ||
          status === 502 ||
          status === 503 ||
          status === 504
        ) {
          const raw = response.headers.get("Retry-After");
          const delay =
            raw === null
              ? limits.retryDelayMs
              : /^\d+$/.test(raw)
                ? Number(raw) * 1000
                : Date.parse(raw) - Date.now();
          // Do not retry earlier than a long provider-requested cooldown.
          if (
            Number.isFinite(delay) &&
            delay >= 0 &&
            delay <= limits.maxRetryDelayMs
          ) {
            return {
              body: new PaddleCatalogueError(code, status),
              retryDelay: delay,
            };
          }
        }
        throw new PaddleCatalogueError(code, status);
      }
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers.get("Content-Type") ?? "",
        )
      )
        return malformed();
      const length = response.headers.get("Content-Length");
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) > limits.responseBytes)
      ) {
        throw new PaddleCatalogueError("response_too_large");
      }
      if (!response.body) return malformed();
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limits.responseBytes)
          throw new PaddleCatalogueError("response_too_large");
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        return {
          body: JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          ) as unknown,
        };
      } catch {
        return malformed();
      }
    };
    try {
      return await Promise.race([operation(), deadline]);
    } catch (error) {
      if (error instanceof PaddleCatalogueError) throw error;
      throw new PaddleCatalogueError(
        controller.signal.aborted ? "timeout" : "network",
      );
    } finally {
      clearTimeout(timer);
      cancel();
    }
  }
  async function get(
    url: URL,
    deadlineAt = Date.now() + limits.operationTimeoutMs,
  ): Promise<Record<string, unknown>> {
    for (let i = 0; i < limits.attempts; i++) {
      if (Date.now() >= deadlineAt) throw new PaddleCatalogueError("timeout");
      const result = await attempt(url, deadlineAt);
      if (result.body instanceof PaddleCatalogueError) {
        if (i === limits.attempts - 1) throw result.body;
        if (Date.now() + (result.retryDelay ?? 0) >= deadlineAt)
          throw new PaddleCatalogueError("timeout");
        await new Promise((resolve) => setTimeout(resolve, result.retryDelay));
      } else return object(result.body);
    }
    return malformed();
  }
  function listUrl(resource: Resource, after?: string): URL {
    const url = new URL(`/${resource}`, PADDLE_SANDBOX_ORIGIN);
    url.searchParams.set("per_page", String(limits.pageSize));
    url.searchParams.set("status", "active,archived");
    if (after !== undefined) url.searchParams.set("after", after);
    return url;
  }
  async function list<T>(
    resource: Resource,
    normalize: (raw: unknown) => T,
    ref: (item: T) => string,
  ): Promise<T[]> {
    let url = listUrl(resource);
    const deadlineAt = Date.now() + limits.operationTimeoutMs;
    const cursors = new Set<string>();
    const ids = new Set<string>();
    const result: T[] = [];
    for (let page = 0; page < limits.pages; page++) {
      const body = await get(url, deadlineAt);
      if (!Array.isArray(body.data) || body.data.length > limits.pageSize)
        return malformed();
      for (const raw of body.data) {
        const item = normalize(raw);
        if (ids.has(ref(item))) return malformed();
        ids.add(ref(item));
        result.push(item);
      }
      const pagination = object(object(body.meta).pagination);
      if (typeof pagination.has_more !== "boolean") return malformed();
      if (!pagination.has_more) return result;
      if (
        !body.data.length ||
        typeof pagination.next !== "string" ||
        pagination.next.length > 4096
      )
        return malformed();
      let next: URL;
      try {
        next = new URL(pagination.next);
      } catch {
        return malformed();
      }
      if (
        next.origin !== PADDLE_SANDBOX_ORIGIN ||
        next.pathname !== `/${resource}` ||
        next.username ||
        next.password ||
        next.hash
      )
        return malformed();
      // Only extract the cursor. Never send credentials to a provider-supplied URL.
      const after = reference(next.searchParams.get("after"));
      if (next.searchParams.getAll("after").length !== 1 || cursors.has(after))
        return malformed();
      cursors.add(after);
      url = listUrl(resource, after);
    }
    throw new PaddleCatalogueError("pagination_limit");
  }
  async function retrieve<T>(
    resource: Resource,
    id: string,
    normalize: (raw: unknown) => T,
    ref: (item: T) => string,
  ): Promise<T> {
    let pathReference: string;
    try {
      reference(id);
      pathReference = encodeURIComponent(id);
    } catch {
      throw new PaddleCatalogueError("invalid_reference");
    }
    const body = await get(
      new URL(`/${resource}/${pathReference}`, PADDLE_SANDBOX_ORIGIN),
    );
    const item = normalize(body.data);
    if (ref(item) !== id) return malformed();
    return item;
  }
  return Object.freeze({
    provider: "paddle",
    environment: "test",
    listProducts: () =>
      list("products", productObservation, (p) => p.productReference),
    retrieveProduct: (id: string) =>
      retrieve("products", id, productObservation, (p) => p.productReference),
    listPrices: () => list("prices", priceObservation, (p) => p.priceReference),
    retrievePrice: (id: string) =>
      retrieve("prices", id, priceObservation, (p) => p.priceReference),
  });
}
