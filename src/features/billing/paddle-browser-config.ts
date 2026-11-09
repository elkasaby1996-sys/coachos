export type PaddleBrowserEnvironment = "sandbox" | "production";

export function paddleBrowserConfiguration(
  selector: unknown,
  sandboxToken: unknown,
  liveToken: unknown,
): {
  environment: PaddleBrowserEnvironment;
  token: string;
  realm: "test" | "live";
} {
  // Preserve the existing sandbox setup; production always requires an explicit selector.
  const environment = selector ?? "sandbox";
  if (environment !== "sandbox" && environment !== "production")
    throw new Error("PADDLE_CLIENT_CONFIGURATION");
  const token = environment === "sandbox" ? sandboxToken : liveToken;
  const pattern =
    environment === "sandbox"
      ? /^test_[a-zA-Z0-9]{20,64}$/
      : /^live_[a-zA-Z0-9]{20,64}$/;
  if (typeof token !== "string" || !pattern.test(token))
    throw new Error("PADDLE_CLIENT_CONFIGURATION");
  return {
    environment,
    token,
    realm: environment === "sandbox" ? ("test" as const) : ("live" as const),
  };
}

export function configuredPaddleBrowser() {
  return paddleBrowserConfiguration(
    import.meta.env.VITE_PADDLE_ENVIRONMENT,
    import.meta.env.VITE_PADDLE_SANDBOX_CLIENT_TOKEN,
    import.meta.env.VITE_PADDLE_LIVE_CLIENT_TOKEN,
  );
}
