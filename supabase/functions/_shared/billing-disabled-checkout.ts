/** Static retirement endpoint: no runtime, database, provider or secret dependencies. */
export function handleDisabledLegacyCheckout(request: Request): Response {
  const options = request.method === "OPTIONS";
  return new Response(
    options
      ? null
      : JSON.stringify({
          code: "BILLING_PROVIDER_RETIRED",
          message: "This billing provider has been permanently retired.",
        }),
    {
      status: options ? 200 : request.method === "POST" ? 410 : 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
