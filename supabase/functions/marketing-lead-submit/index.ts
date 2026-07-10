import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type LeadType = "request_access" | "switch";

type LeadPayload = {
  type?: LeadType;
  name?: string;
  email?: string;
  role?: string;
  coaching_business?: string;
  clients_range?: string;
  current_tools?: string;
  goal?: string;
  migration_notes?: string;
  consent?: boolean;
  website?: string;
  page_path?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getOptionalEnv(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanLongText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function validatePayload(payload: LeadPayload) {
  if (payload.website && payload.website.trim()) {
    return { ok: true as const, spam: true as const };
  }

  const type = payload.type;
  const name = cleanText(payload.name, 120);
  const email = cleanText(payload.email, 180).toLowerCase();
  const coachingBusiness = cleanText(payload.coaching_business, 220);
  const clientsRange = cleanText(payload.clients_range, 40);
  const currentTools = cleanText(payload.current_tools, 220);

  if (type !== "request_access" && type !== "switch") {
    return { ok: false as const, error: "Lead type is invalid" };
  }
  if (name.length < 2) return { ok: false as const, error: "Name is required" };
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false as const, error: "Email is invalid" };
  }
  if (!coachingBusiness) {
    return { ok: false as const, error: "Coaching business is required" };
  }
  if (!clientsRange) {
    return { ok: false as const, error: "Client range is required" };
  }
  if (type === "switch" && !currentTools) {
    return { ok: false as const, error: "Current tools are required" };
  }
  if (payload.consent !== true) {
    return { ok: false as const, error: "Consent is required" };
  }

  return {
    ok: true as const,
    spam: false as const,
    row: {
      type,
      name,
      email,
      role: cleanText(payload.role, 80),
      coaching_business: coachingBusiness,
      clients_range: clientsRange,
      current_tools: currentTools,
      goal: cleanLongText(payload.goal, 1800),
      migration_notes: cleanLongText(payload.migration_notes, 1800),
      consent: true,
      page_path: cleanText(payload.page_path, 220),
    },
  };
}

async function notifyLead(row: Record<string, unknown>) {
  const apiKey = getOptionalEnv("RESEND_API_KEY");
  const to = getOptionalEnv("MARKETING_LEADS_NOTIFY_EMAIL");
  const from =
    getOptionalEnv("MARKETING_LEADS_FROM_EMAIL") ||
    "RepSync <noreply@repsync.app>";

  if (!apiKey || !to) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New RepSync ${row.type} lead: ${row.name}`,
      text: [
        `Type: ${row.type}`,
        `Name: ${row.name}`,
        `Email: ${row.email}`,
        `Role: ${row.role}`,
        `Business: ${row.coaching_business}`,
        `Clients: ${row.clients_range}`,
        `Current tools: ${row.current_tools}`,
        `Goal: ${row.goal}`,
        `Migration notes: ${row.migration_notes}`,
        `Page: ${row.page_path}`,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    console.error("Resend notification failed", await response.text());
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = (await req.json()) as LeadPayload;
    const validation = validatePayload(payload);
    if (!validation.ok) return jsonResponse({ error: validation.error }, 400);
    if (validation.spam) return jsonResponse({ ok: true });

    const supabase = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const row = {
      ...validation.row,
      user_agent: cleanText(req.headers.get("User-Agent"), 500),
      referrer: cleanText(req.headers.get("Referer"), 500),
      metadata: {
        origin: cleanText(req.headers.get("Origin"), 220),
      },
    };

    const { data, error } = await supabase
      .from("marketing_leads")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;

    notifyLead(row).catch((error) =>
      console.error("Marketing lead notification failed", error),
    );

    return jsonResponse({ ok: true, id: data.id });
  } catch (error) {
    console.error("marketing-lead-submit failed", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
