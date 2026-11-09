import type { BillingDependencies } from "./billing-handlers.ts";
import { boundedBody } from "./billing-common.ts";
import { paddleEnvironment } from "./paddle-environment.ts";
import { acceptsPaddlePortalUrl } from "../../../src/features/billing/portal-url.ts";

type Dependencies = Pick<BillingDependencies, "authenticate" | "serviceRpc"> & {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
};
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const result = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });

export async function handlePaddleCustomerPortal(
  request: Request,
  runtime: () => Dependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") return result(200, { status: "ok" });
  if (request.method !== "POST")
    return result(405, { code: "BILLING_INVALID_INPUT" });
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return result(401, { code: "BILLING_FORBIDDEN" });
    const deps = runtime();
    const actor = await deps.authenticate(token);
    if (!actor) return result(401, { code: "BILLING_FORBIDDEN" });
    let input: unknown;
    try {
      input = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await boundedBody(request, 256),
        ),
      );
    } catch {
      return result(400, { code: "BILLING_INVALID_INPUT" });
    }
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length
    )
      return result(400, { code: "BILLING_INVALID_INPUT" });
    const context = await deps.serviceRpc("paddle_customer_portal_context_v1", {
      p_owner: actor.id,
    });
    const realm = paddleEnvironment(deps.env);
    if (
      context?.environment !== realm.environment ||
      !/^ctm_[a-z0-9]{26}$/.test(context.customerId) ||
      !/^sub_[a-z0-9]{26}$/.test(context.subscriptionId)
    )
      return result(403, { code: "BILLING_PORTAL_UNAVAILABLE" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await deps.fetch(
        `${realm.origin}/customers/${context.customerId}/portal-sessions`,
        {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${realm.key("PORTAL_API_KEY")}`,
            "Content-Type": "application/json",
            "Paddle-Version": "1",
          },
          body: JSON.stringify({ subscription_ids: [context.subscriptionId] }),
        },
      );
      if (
        response.status !== 201 ||
        !/^application\/json(?:;|$)/i.test(
          response.headers.get("content-type") ?? "",
        )
      )
        throw new Error();
      const data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await boundedBody(response, 16384),
        ),
      ).data;
      if (
        data?.customer_id !== context.customerId ||
        !acceptsPaddlePortalUrl(
          data?.urls?.general?.overview,
          realm.environment,
        )
      )
        throw new Error();
      return result(200, {
        portalUrl: data.urls.general.overview,
        environment: realm.environment,
      });
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  } catch {
    return result(503, { code: "BILLING_PORTAL_UNAVAILABLE" });
  }
}
