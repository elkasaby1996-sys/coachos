export function assertPaymentMethodFixtureTarget(
  env: Record<string, string | undefined>,
) {
  const api = new URL(env.E2E_SUPABASE_API_URL ?? "");
  const disposablePort = env.PAY04_DISPOSABLE_LOCAL === "1" ? "58431" : "57431";
  const allowedPorts = [disposablePort];
  // The default smoke workflow starts its own disposable stack on this port.
  // Never infer permission from CI=true or merely from a loopback hostname.
  if (env.REPSYNC_E2E_DISPOSABLE_LOCAL === "1") allowedPorts.push("54321");
  if (
    api.protocol !== "http:" ||
    api.username ||
    api.password ||
    api.pathname !== "/" ||
    api.search ||
    api.hash ||
    !["127.0.0.1", "localhost"].includes(api.hostname) ||
    !allowedPorts.includes(api.port)
  ) {
    throw new Error(
      "Payment-method browser fixtures require the explicitly bound disposable local API.",
    );
  }
}
