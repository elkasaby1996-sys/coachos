import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type LeadType = "request_access" | "switch";

type LeadPayload = {
  type?: LeadType;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  business_name?: string;
  coaching_business?: string;
  coaching_model?: string;
  clients_range?: string;
  current_platform?: string;
  current_tools?: string;
  primary_reason?: string;
  goal?: string;
  message?: string;
  switching_timeline?: string;
  team_size?: string;
  data_to_move?: string;
  migration_concerns?: string;
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
  const firstName = cleanText(payload.first_name, 80);
  const lastName = cleanText(payload.last_name, 80);
  const fallbackName = cleanText(payload.name, 160);
  const name = `${firstName} ${lastName}`.trim() || fallbackName;
  const email = cleanText(payload.email, 180).toLowerCase();
  const businessName = cleanText(
    payload.business_name ?? payload.coaching_business,
    220,
  );
  const coachingModel = cleanText(payload.coaching_model, 80);
  const clientsRange = cleanText(payload.clients_range, 40);
  const currentPlatform = cleanText(
    payload.current_platform ?? payload.current_tools,
    220,
  );
  const primaryReason = cleanText(payload.primary_reason ?? payload.goal, 160);

  if (type !== "request_access" && type !== "switch") {
    return { ok: false as const, error: "Lead type is invalid" };
  }
  if (firstName.length < 2) {
    return { ok: false as const, error: "First name is required" };
  }
  if (lastName.length < 2) {
    return { ok: false as const, error: "Last name is required" };
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false as const, error: "Email is invalid" };
  }
  if (!coachingModel) {
    return { ok: false as const, error: "Coaching model is required" };
  }
  if (!clientsRange) {
    return { ok: false as const, error: "Client range is required" };
  }
  if (!primaryReason) {
    return { ok: false as const, error: "Primary reason is required" };
  }
  if (type === "switch" && !currentPlatform) {
    return { ok: false as const, error: "Current platform is required" };
  }
  if (type === "switch" && !cleanText(payload.switching_timeline, 80)) {
    return { ok: false as const, error: "Switching timeline is required" };
  }
  if (type === "switch" && !cleanText(payload.team_size, 80)) {
    return { ok: false as const, error: "Team size is required" };
  }
  if (type === "switch" && !cleanLongText(payload.data_to_move, 1800)) {
    return { ok: false as const, error: "Data to move is required" };
  }
  if (payload.consent !== true) {
    return { ok: false as const, error: "Consent is required" };
  }

  return {
    ok: true as const,
    spam: false as const,
    row: {
      type,
      first_name: firstName,
      last_name: lastName,
      name,
      email,
      business_name: businessName,
      coaching_business: businessName,
      coaching_model: coachingModel,
      clients_range: clientsRange,
      current_platform: currentPlatform,
      current_tools: currentPlatform,
      primary_reason: primaryReason,
      goal: primaryReason,
      message: cleanLongText(payload.message, 1800),
      switching_timeline: cleanText(payload.switching_timeline, 80),
      team_size: cleanText(payload.team_size, 80),
      data_to_move: cleanLongText(payload.data_to_move, 1800),
      migration_concerns: cleanLongText(payload.migration_concerns, 1800),
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
        `Business: ${row.business_name}`,
        `Coaching model: ${row.coaching_model}`,
        `Clients: ${row.clients_range}`,
        `Current platform: ${row.current_platform}`,
        `Primary reason: ${row.primary_reason}`,
        `Timeline: ${row.switching_timeline}`,
        `Team size: ${row.team_size}`,
        `Data to move: ${row.data_to_move}`,
        `Migration concerns: ${row.migration_concerns}`,
        `Message: ${row.message}`,
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
