import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { ensureNotificationPreferenceDefaults } from "../features/notifications/lib/notification-service";

export const PENDING_INVITE_STORAGE_KEY = "coachos_pending_invite_token";
export const SIGNUP_INTENT_STORAGE_KEY = "coachos_signup_intent";

export type AccountType = "pt" | "client" | "unknown";

export type PtProfileRow = {
  id?: string;
  user_id: string;
  workspace_id?: string | null;
  display_name?: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  coach_business_name: string | null;
  headline: string | null;
  bio: string | null;
  location_country: string | null;
  location_city: string | null;
  languages: string[] | null;
  specialties: string[] | null;
  starting_price: number | null;
  onboarding_completed_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ClientProfileRow = {
  id: string;
  workspace_id: string | null;
  relationship_status?: string | null;
  user_id: string | null;
  status: string | null;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  photo_url: string | null;
  date_of_birth: string | null;
  dob: string | null;
  sex: string | null;
  gender: string | null;
  height_value: number | null;
  height_unit: string | null;
  height_cm: number | null;
  weight_value_current: number | null;
  weight_unit: string | null;
  current_weight: number | null;
  unit_preference: string | null;
  location: string | null;
  location_country: string | null;
  timezone: string | null;
  goal: string | null;
  injuries: string | null;
  limitations: string | null;
  equipment: string | null;
  days_per_week: number | null;
  gym_name: string | null;
  training_type: string | null;
  account_onboarding_completed_at: string | null;
  created_at?: string | null;
};

export function extractInviteToken(input: string) {
  const value = input.trim();
  if (!value) return "";

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value);
      const parts = url.pathname.split("/").filter(Boolean);
      const inviteIndex = parts.findIndex(
        (part) => part === "invite" || part === "join",
      );
      return inviteIndex >= 0 ? (parts[inviteIndex + 1] ?? "") : "";
    } catch {
      return "";
    }
  }

  return value;
}

export function getPendingInviteToken(search?: string | null) {
  if (typeof window === "undefined") return null;
  const searchValue = search ?? window.location.search;
  const fromQuery = new URLSearchParams(searchValue).get("invite");
  if (fromQuery) return fromQuery;
  return window.localStorage.getItem(PENDING_INVITE_STORAGE_KEY);
}

export function persistPendingInviteToken(token: string | null | undefined) {
  if (typeof window === "undefined") return;
  const nextValue = token?.trim() ?? "";
  if (!nextValue) {
    window.localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(PENDING_INVITE_STORAGE_KEY, nextValue);
}

export function clearPendingInviteToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
}

export function getSignupIntentFallback(): AccountType {
  if (typeof window === "undefined") return "unknown";
  const intent = window.localStorage.getItem(SIGNUP_INTENT_STORAGE_KEY);
  if (intent === "pt" || intent === "client") return intent;
  return "unknown";
}

export function persistSignupIntent(
  intent: Extract<AccountType, "pt" | "client">,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIGNUP_INTENT_STORAGE_KEY, intent);
}

export function clearSignupIntent() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SIGNUP_INTENT_STORAGE_KEY);
}

export function getUserDisplayName(user: User | null | undefined) {
  if (!user) return "";
  const metadata = user.user_metadata ?? {};
  const candidates = [
    metadata.full_name,
    metadata.display_name,
    metadata.name,
    metadata.user_name,
    user.email?.split("@")[0],
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed || isRoleLikeDisplayName(trimmed)) continue;
    return trimmed;
  }

  return "";
}

function isRoleLikeDisplayName(value: string | null | undefined) {
  const raw = value?.trim().toLowerCase() ?? "";
  if (!raw) return false;

  const normalized = raw.replace(/[_-]+/g, " ");
  const collapsed = normalized.replace(/\s+/g, " ").trim();

  if (
    raw.startsWith("pt_") ||
    raw.startsWith("pt-") ||
    /^pt[_\-\s]?(owner|coach|admin)$/.test(raw)
  ) {
    return true;
  }

  return [
    "pt",
    "pt owner",
    "pt coach",
    "pt admin",
    "coach",
    "trainer",
    "trainer account",
    "coach account",
    "owner",
    "client",
  ].includes(collapsed);
}

export function getPreferredPersonDisplayName(
  ...candidates: Array<string | null | undefined>
) {
  for (const candidate of candidates) {
    const value = candidate?.trim() ?? "";
    if (!value || isRoleLikeDisplayName(value)) continue;
    return value;
  }

  return "";
}

export function getUserAvatarUrl(user: User | null | undefined) {
  if (!user) return "";
  const metadata = user.user_metadata ?? {};
  const candidates = [metadata.avatar_url, metadata.picture];
  return (
    candidates.find((value) => typeof value === "string" && value.trim()) ?? ""
  );
}

function normalizeText(value: string | null | undefined) {
  const nextValue = value?.trim() ?? "";
  return nextValue.length > 0 ? nextValue : null;
}

function normalizeTextArray(values: string[] | null | undefined) {
  if (!values) return [] as string[];
  return values.map((value) => value.trim()).filter(Boolean);
}

function isConflictError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; status?: number };
  return maybeError.code === "23505" || maybeError.status === 409;
}

async function getExistingPtProfile(userId: string) {
  const { data, error } = await supabase
    .from("pt_profiles")
    .select("*")
    .eq("user_id", userId)
    .limit(25);

  if (error) throw error;
  return getCanonicalPtProfile((data ?? []) as PtProfileRow[]);
}

export function getCanonicalPtProfile(rows: PtProfileRow[] | null | undefined) {
  if (!rows?.length) return null;

  return (
    rows.find(
      (row) => row.workspace_id === null || row.workspace_id === undefined,
    ) ??
    [...rows].sort((a, b) =>
      (b.updated_at ?? b.created_at ?? "").localeCompare(
        a.updated_at ?? a.created_at ?? "",
      ),
    )[0] ??
    null
  );
}

export function isPtProfileComplete(profile: PtProfileRow | null | undefined) {
  return Boolean(profile?.onboarding_completed_at);
}

export function isClientAccountComplete(
  client: ClientProfileRow | null | undefined,
) {
  if (!client) return false;
  if (client.account_onboarding_completed_at) return true;

  const hasName = Boolean(
    client.full_name?.trim() || client.display_name?.trim(),
  );
  const hasPhone = Boolean(client.phone?.trim());
  const hasDob = Boolean(client.date_of_birth ?? client.dob);
  const hasSex = Boolean(client.sex?.trim() || client.gender?.trim());
  const hasHeight = Boolean(client.height_value ?? client.height_cm);
  const hasWeight = Boolean(
    client.weight_value_current ?? client.current_weight,
  );

  return hasName && hasPhone && hasDob && hasSex && hasHeight && hasWeight;
}

export async function ensurePtProfile(params: {
  userId: string;
  fullName?: string | null;
  coachBusinessName?: string | null;
}) {
  await ensureNotificationPreferenceDefaults({
    userId: params.userId,
    actorType: "pt",
  });

  const existing = await getExistingPtProfile(params.userId);
  const payload = {
    user_id: params.userId,
    workspace_id: null,
    display_name: normalizeText(params.fullName),
    full_name: normalizeText(params.fullName),
    coach_business_name: normalizeText(params.coachBusinessName),
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("pt_profiles")
      .update({
        display_name: existing.display_name ?? payload.display_name,
        full_name: existing.full_name ?? payload.full_name,
        coach_business_name:
          existing.coach_business_name ?? payload.coach_business_name,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw error;
    return data as PtProfileRow;
  }

  const { data, error } = await supabase
    .from("pt_profiles")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (isConflictError(error)) {
      const conflictingRow = await getExistingPtProfile(params.userId);
      if (conflictingRow) return conflictingRow;
    }
    throw error;
  }
  return data as PtProfileRow;
}

export async function updatePtProfile(
  userId: string,
  values: Partial<Omit<PtProfileRow, "user_id">>,
) {
  const existing = await getExistingPtProfile(userId);
  const payload: Partial<PtProfileRow> = {
    ...values,
    workspace_id: null,
  };
  if ("full_name" in values || "display_name" in values) {
    payload.display_name = normalizeText(
      values.full_name ?? values.display_name,
    );
  }
  if ("full_name" in values)
    payload.full_name = normalizeText(values.full_name);
  if ("phone" in values) payload.phone = normalizeText(values.phone);
  if ("avatar_url" in values) {
    payload.avatar_url = normalizeText(values.avatar_url);
  }
  if ("coach_business_name" in values) {
    payload.coach_business_name = normalizeText(values.coach_business_name);
  }
  if ("headline" in values) payload.headline = normalizeText(values.headline);
  if ("bio" in values) payload.bio = normalizeText(values.bio);
  if ("location_country" in values) {
    payload.location_country = normalizeText(values.location_country);
  }
  if ("location_city" in values) {
    payload.location_city = normalizeText(values.location_city);
  }
  if ("languages" in values) {
    payload.languages = values.languages
      ? normalizeTextArray(values.languages)
      : [];
  }
  if ("specialties" in values) {
    payload.specialties = values.specialties
      ? normalizeTextArray(values.specialties)
      : [];
  }

  const query = existing?.id
    ? supabase.from("pt_profiles").update(payload).eq("id", existing.id)
    : supabase.from("pt_profiles").insert({ user_id: userId, ...payload });

  const { data, error } = await query.select("*").single();

  if (error) {
    if (!existing && isConflictError(error)) {
      const conflictingRow = await getExistingPtProfile(userId);
      if (conflictingRow?.id) {
        const { data: retriedData, error: retryError } = await supabase
          .from("pt_profiles")
          .update(payload)
          .eq("id", conflictingRow.id)
          .select("*")
          .single();

        if (retryError) throw retryError;
        return retriedData as PtProfileRow;
      }
    }
    throw error;
  }
  return data as PtProfileRow;
}

export async function updateCurrentUserNameMetadata(fullName: string) {
  const normalizedFullName = normalizeText(fullName);
  if (!normalizedFullName) return;

  const { data } = await supabase.auth.getUser();
  if (data.user?.id) {
    const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    await supabase.auth.updateUser({
      data: {
        ...metadata,
        full_name: normalizedFullName,
        display_name:
          typeof metadata.display_name === "string" &&
          metadata.display_name.trim()
            ? metadata.display_name
            : normalizedFullName,
        name:
          typeof metadata.name === "string" && metadata.name.trim()
            ? metadata.name
            : normalizedFullName,
      },
    });
  }
}

export async function syncPtAccountIdentity(params: {
  userId: string;
  fullName: string | null | undefined;
  contactEmail?: string | null;
  supportEmail?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  updateAuthMetadata?: boolean;
}) {
  const fullName = normalizeText(params.fullName);
  if (!fullName) return;

  if (params.updateAuthMetadata !== false) {
    try {
      await updateCurrentUserNameMetadata(fullName);
    } catch {
      // Database profile rows remain the source of truth if auth metadata cannot be updated.
    }
  }

  await ensurePtProfile({
    userId: params.userId,
    fullName,
  });
  const legacyProfileUpdate: Partial<Omit<PtProfileRow, "user_id">> = {
    full_name: fullName,
  };
  if (params.phone !== undefined) legacyProfileUpdate.phone = params.phone;
  if (params.country !== undefined) {
    legacyProfileUpdate.location_country = params.country;
  }
  if (params.city !== undefined)
    legacyProfileUpdate.location_city = params.city;
  await updatePtProfile(params.userId, legacyProfileUpdate);

  const { data: hubProfile, error: hubProfileError } = await supabase
    .from("pt_hub_profiles")
    .select("display_name")
    .eq("user_id", params.userId)
    .maybeSingle<{
      display_name: string | null;
    }>();

  if (hubProfileError) throw hubProfileError;

  const hubProfilePayload = {
    user_id: params.userId,
    full_name: fullName,
    display_name: normalizeText(hubProfile?.display_name) ?? fullName,
  };

  const { error: hubProfileUpsertError } = await supabase
    .from("pt_hub_profiles")
    .upsert(hubProfilePayload, { onConflict: "user_id" });

  if (hubProfileUpsertError) throw hubProfileUpsertError;

  const settingsPayload: Record<string, string | null> = {
    user_id: params.userId,
    full_name: fullName,
  };
  if (params.contactEmail !== undefined) {
    settingsPayload.contact_email = normalizeText(params.contactEmail);
  }
  if (params.supportEmail !== undefined) {
    settingsPayload.support_email = normalizeText(params.supportEmail);
  }
  if (params.phone !== undefined)
    settingsPayload.phone = normalizeText(params.phone);
  if (params.country !== undefined) {
    settingsPayload.country = normalizeText(params.country);
  }
  if (params.city !== undefined)
    settingsPayload.city = normalizeText(params.city);

  const { error: settingsUpsertError } = await supabase
    .from("pt_hub_settings")
    .upsert(settingsPayload, { onConflict: "user_id" });

  if (settingsUpsertError) throw settingsUpsertError;
}

export async function ensureClientProfile(params: {
  userId: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
}) {
  await ensureNotificationPreferenceDefaults({
    userId: params.userId,
    actorType: "client",
  });

  const { data, error } = await supabase.rpc("ensure_client_profile", {
    p_user_id: params.userId,
    p_full_name: normalizeText(params.fullName),
    p_avatar_url: normalizeText(params.avatarUrl),
    p_email: normalizeText(params.email),
  });

  if (error) throw error;
  if (Array.isArray(data)) {
    return (data[0] ?? null) as ClientProfileRow | null;
  }
  return data as ClientProfileRow | null;
}

export async function updateClientCanonicalProfile(
  clientId: string,
  values: Partial<ClientProfileRow>,
) {
  const payload = {
    ...values,
    full_name: normalizeText(values.full_name),
    display_name: normalizeText(values.full_name ?? values.display_name),
    phone: normalizeText(values.phone),
    avatar_url: normalizeText(values.avatar_url),
    photo_url: normalizeText(values.avatar_url ?? values.photo_url),
    sex: normalizeText(values.sex),
  };

  const { data, error } = await supabase
    .from("clients")
    .update(payload)
    .eq("id", clientId)
    .select("*")
    .single();

  if (error) throw error;
  return data as ClientProfileRow;
}
