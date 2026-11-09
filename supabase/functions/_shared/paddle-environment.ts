import {
  assertServer,
  type ServerEnvironmentReader,
} from "./paddle-catalogue/config.ts";

export type PaddleEnvironment = "test" | "live";
export function paddleApiOrigin(environment: string): string {
  if (environment === "test") return "https://sandbox-api.paddle.com";
  if (environment === "live") return "https://api.paddle.com";
  throw new Error("PADDLE_CONFIGURATION");
}

export function paddleKeyMatchesEnvironment(
  environment: string,
  key: string,
): boolean {
  return environment === "test"
    ? /^pdl_sdbx_[A-Za-z0-9_]+$/.test(key)
    : environment === "live" && /^pdl_live_[A-Za-z0-9_]+$/.test(key);
}

/** The deployment chooses one realm. Neither requests nor provider payloads choose it. */
export function paddleEnvironment(read: ServerEnvironmentReader) {
  assertServer();
  const selector = read("PADDLE_ENVIRONMENT");
  if (
    !["sandbox", "production"].includes(selector ?? "") ||
    read("PADDLE_API_BASE_URL") ||
    read("PADDLE_API_KEY")
  )
    throw new Error("PADDLE_CONFIGURATION");
  const environment: PaddleEnvironment =
    selector === "sandbox" ? "test" : "live";
  const prefix = environment === "test" ? "PADDLE_SANDBOX_" : "PADDLE_LIVE_";
  const opposite = environment === "test" ? "PADDLE_LIVE_" : "PADDLE_SANDBOX_";
  for (const suffix of [
    "API_KEY",
    "CHECKOUT_API_KEY",
    "PAYMENT_METHOD_API_KEY",
    "PORTAL_API_KEY",
    "WEBHOOK_SECRET",
    "WEBHOOK_SECRET_PREVIOUS",
    "PAYMENT_PAGE_URL",
    "HOSTED_CHECKOUT_LAUNCH_URL",
  ]) {
    if (read(opposite + suffix)) throw new Error("PADDLE_CONFIGURATION");
  }
  return Object.freeze({
    environment,
    origin: paddleApiOrigin(environment),
    setting(suffix: string) {
      if (read(opposite + suffix)) throw new Error("PADDLE_CONFIGURATION");
      return read(prefix + suffix);
    },
    key(suffix = "API_KEY") {
      if (read(opposite + suffix)) throw new Error("PADDLE_CONFIGURATION");
      const key = read(prefix + suffix) ?? "";
      if (
        !paddleKeyMatchesEnvironment(environment, key) ||
        !/^pdl_(sdbx|live)_apikey_[a-z\d]{26}_[a-zA-Z\d]{22}_[a-zA-Z\d]{3}$/.test(
          key,
        )
      )
        throw new Error("PADDLE_CONFIGURATION");
      return key;
    },
  });
}
