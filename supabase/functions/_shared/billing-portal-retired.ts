/** Compatibility endpoint: no authentication, linkage lookup or provider capability. */
export function handleRetiredCustomerPortal(request: Request): Response {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
  };
  if (request.method === "OPTIONS") return new Response(null, { headers });
  return new Response(JSON.stringify({ code: "BILLING_PORTAL_RETIRED" }), {
    status: request.method === "POST" ? 410 : 405,
    headers,
  });
}
