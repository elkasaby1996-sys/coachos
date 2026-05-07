import type { User } from "@supabase/supabase-js";
import {
  ensureClientProfile,
  ensurePtProfile,
  getPendingInviteToken,
  getSignupIntentFallback,
  getUserAvatarUrl,
  getUserDisplayName,
  persistPendingInviteToken,
  persistSignupIntent,
  type AccountType,
} from "./account-profiles";

export type AuthCallbackKind =
  | "signup"
  | "recovery"
  | "oauth"
  | "invite"
  | "activation"
  | "email_change"
  | "unknown";

export type AuthCallbackParams = {
  kind: AuthCallbackKind;
  nextPath: string | null;
  intent: AccountType;
  inviteToken: string | null;
  hasError: boolean;
  errorDescription: string | null;
  hasCode: boolean;
  hasHashToken: boolean;
};

export type AuthCallbackHashSession = {
  accessToken: string;
  refreshToken: string;
};

function normalizePath(value: string | null) {
  if (!value?.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

function normalizeIntent(value: string | null): AccountType {
  if (value === "pt" || value === "client") return value;
  return "unknown";
}

function normalizeKind(value: string | null): AuthCallbackKind {
  if (
    value === "signup" ||
    value === "recovery" ||
    value === "oauth" ||
    value === "invite" ||
    value === "activation" ||
    value === "email_change"
  ) {
    return value;
  }
  return "unknown";
}

export function parseAuthCallbackUrl(input: string): AuthCallbackParams {
  const url = new URL(input);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const searchKind = normalizeKind(url.searchParams.get("type"));
  const hashKind = normalizeKind(hashParams.get("type"));
  const kind = searchKind === "unknown" ? hashKind : searchKind;
  const errorDescription =
    url.searchParams.get("error_description") ??
    hashParams.get("error_description") ??
    url.searchParams.get("error") ??
    hashParams.get("error");
  const inviteToken =
    url.searchParams.get("invite") ?? hashParams.get("invite") ?? null;

  return {
    kind,
    nextPath:
      normalizePath(url.searchParams.get("next")) ??
      normalizePath(hashParams.get("next")),
    intent: normalizeIntent(
      url.searchParams.get("intent") ?? hashParams.get("intent"),
    ),
    inviteToken,
    hasError: Boolean(errorDescription),
    errorDescription,
    hasCode: Boolean(url.searchParams.get("code")),
    hasHashToken: Boolean(hashParams.get("access_token")),
  };
}

export function getAuthCallbackHashSession(
  input: string,
): AuthCallbackHashSession | null {
  const url = new URL(input);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
}

export function getCallbackFallbackPath(params: {
  kind: AuthCallbackKind;
  intent: AccountType;
  inviteToken: string | null;
}) {
  if (params.kind === "recovery") return "/auth/reset-password";
  if (params.inviteToken)
    return `/invite/${encodeURIComponent(params.inviteToken)}`;
  if (params.intent === "pt") return "/pt/onboarding/workspace";
  if (params.intent === "client") return "/client/onboarding/account";
  return "/";
}

export async function provisionCallbackProfile(params: {
  user: User;
  intent: AccountType;
  inviteToken: string | null;
}) {
  const storedIntent =
    params.intent === "unknown" ? getSignupIntentFallback() : params.intent;
  const inviteToken = params.inviteToken ?? getPendingInviteToken();

  if (storedIntent === "pt") {
    persistSignupIntent("pt");
    await ensurePtProfile({
      userId: params.user.id,
      fullName:
        window.localStorage.getItem("coachos_pt_signup_full_name") ??
        getUserDisplayName(params.user),
    });
    return;
  }

  if (storedIntent === "client" || inviteToken) {
    persistSignupIntent("client");
    if (inviteToken) persistPendingInviteToken(inviteToken);
    await ensureClientProfile({
      userId: params.user.id,
      fullName:
        window.localStorage.getItem("coachos_client_signup_name") ??
        getUserDisplayName(params.user),
      avatarUrl: getUserAvatarUrl(params.user),
      email: params.user.email ?? null,
    });
  }
}
