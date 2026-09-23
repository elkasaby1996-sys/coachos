import { PaddleCatalogueError } from "./validation.ts";

export const PADDLE_SANDBOX_ORIGIN = "https://sandbox-api.paddle.com";
type ServerRuntime = typeof globalThis & {
  Deno?: {
    version?: { deno?: string };
    serve?: unknown;
    env: { get(name: string): string | undefined };
  };
  process?: {
    versions?: { node?: string };
    env: Record<string, string | undefined>;
  };
};
export function assertServer(): void {
  const runtime = globalThis as ServerRuntime;
  // Supabase Edge Runtime exposes window. Match the webhook guard's server
  // capabilities instead of treating that compatibility global as a browser.
  const denoServer =
    typeof runtime.Deno?.version?.deno === "string" &&
    typeof runtime.Deno?.serve === "function" &&
    typeof runtime.Deno?.env?.get === "function";
  const nodeServer = typeof runtime.process?.versions?.node === "string";
  if (
    (typeof window !== "undefined" && !denoServer) ||
    (!denoServer && !nodeServer)
  ) {
    throw new PaddleCatalogueError("configuration");
  }
}
/** Only trusted server composition/tests may inject a secret-store reader. */
export type ServerEnvironmentReader = (name: string) => string | undefined;
export function readServerEnvironment(name: string): string | undefined {
  assertServer();
  const runtime = globalThis as ServerRuntime;
  return runtime.Deno ? runtime.Deno.env.get(name) : runtime.process?.env[name];
}
/** Captures credentials privately; no serializable credential-bearing config object. */
export function sandboxAuthorization(
  read: ServerEnvironmentReader,
): () => string {
  assertServer();
  try {
    const environment = read("PADDLE_ENVIRONMENT");
    const key = read("PADDLE_SANDBOX_API_KEY");
    if (
      environment !== "sandbox" ||
      !key ||
      !/^pdl_sdbx_apikey_[a-z\d]{26}_[a-zA-Z\d]{22}_[a-zA-Z\d]{3}$/.test(key) ||
      read("PADDLE_API_KEY") ||
      read("PADDLE_LIVE_API_KEY") ||
      read("PADDLE_API_BASE_URL")
    ) {
      throw new PaddleCatalogueError("configuration");
    }
    return () => `Bearer ${key}`;
  } catch {
    throw new PaddleCatalogueError("configuration");
  }
}
