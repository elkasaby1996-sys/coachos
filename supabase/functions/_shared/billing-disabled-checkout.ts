/** Historical endpoint remains addressable, but cannot create new sales. */
export function handleDisabledLegacyCheckout(request: Request): Response {
  const options = request.method === "OPTIONS";
  return new Response(
    options
      ? null
      : JSON.stringify({ code: "BILLING_PROVIDER_NOT_CONFIGURED" }),
    {
      status: options ? 200 : 503,
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
