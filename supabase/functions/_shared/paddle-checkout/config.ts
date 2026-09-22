import {
  assertServer,
  type ServerEnvironmentReader,
} from "../paddle-catalogue/config.ts";
import { PaddleCheckoutError } from "./validation.ts";

/** Checkout authority is deliberately separate from catalogue/administration. */
export function sandboxCheckoutAuthorization(
  read: ServerEnvironmentReader,
): () => string {
  assertServer();
  try {
    const key = read("PADDLE_SANDBOX_CHECKOUT_API_KEY");
    if (
      read("PADDLE_ENVIRONMENT") !== "sandbox" ||
      !key ||
      !/^pdl_sdbx_apikey_[a-z\d]{26}_[a-zA-Z\d]{22}_[a-zA-Z\d]{3}$/.test(key) ||
      read("PADDLE_API_KEY") ||
      read("PADDLE_LIVE_API_KEY") ||
      read("PADDLE_LIVE_CHECKOUT_API_KEY") ||
      read("PADDLE_API_BASE_URL")
    ) {
      throw new Error();
    }
    return () => `Bearer ${key}`;
  } catch {
    throw new PaddleCheckoutError("configuration");
  }
}
