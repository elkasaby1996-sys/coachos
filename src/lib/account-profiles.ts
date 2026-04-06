import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export const PENDING_INVITE_STORAGE_KEY = "coachos_pending_invite_token";

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
      return inviteIndex >= 0 ? parts[inviteIndex + 1] ?? "" : "";
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

export function getUserDisplayName(user: User | null | undefined) {
  if (!user) return "";
  const metadata = user.user_metadata ?? {};
  const candidates = [
    metadata.full_name,
    metadata.name,
    metadata.user_name,
    user.email?.split("@")[0],
  ];

  return (
    candidates.find((value) => typeof value === "string" && value.trim()) ?? ""
  );
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
    rows.find((row) => row.workspace_id === null || row.workspace_id === undefined) ??
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
  const payload = {
    ...values,
    workspace_id: null,
    display_name: normalizeText(values.full_name ?? values.display_name),
    full_name: normalizeText(values.full_name),
    phone: normalizeText(values.phone),
    avatar_url: normalizeText(values.avatar_url),
    coach_business_name: normalizeText(values.coach_business_name),
    headline: normalizeText(values.headline),
    bio: normalizeText(values.bio),
    location_country: normalizeText(values.location_country),
    location_city: normalizeText(values.location_city),
    languages: values.languages ? normalizeTextArray(values.languages) : undefined,
    specialties: values.specialties
      ? normalizeTextArray(values.specialties)
      : undefined,
  };

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

export async function ensureClientProfile(params: {
  userId: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
}) {
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
