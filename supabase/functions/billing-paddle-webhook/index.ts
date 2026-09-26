import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import {
  createPaddleWebhookIngress,
  logPaddleWebhookRejection,
  webhookConfiguration,
} from "../_shared/paddle-webhook/ingress.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return new Response("rejected", { status: 405 });
  try {
    const config = webhookConfiguration((name) => Deno.env.get(name));
    const client = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    return await createPaddleWebhookIngress(config, {
      rpc: async (name, args) => client.rpc(name, args),
    })(request);
  } catch (error) {
    logPaddleWebhookRejection("configuration", error, 503);
    return new Response("unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
});
