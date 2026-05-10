import { supabase } from "./supabase";
import { runClientGuardedAction } from "./request-guard";

export type AuthOAuthProvider = "google" | "apple" | "facebook";
export type AuthEmailOtpType = "signup" | "recovery" | "email_change";

const authCallbackPath = "/auth/callback";

function normalizeRedirectPath(path: string | null | undefined) {
  const value = path?.trim() ?? "";
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export function buildAuthCallbackUrl(params?: {
  next?: string | null;
  intent?: "pt" | "client" | null;
  invite?: string | null;
  type?: AuthEmailOtpType | "oauth" | "invite" | "activation" | null;
}) {
  const url = new URL(authCallbackPath, window.location.origin);
  const next = normalizeRedirectPath(params?.next);
  if (next !== "/") url.searchParams.set("next", next);
  if (params?.intent === "pt" || params?.intent === "client") {
    url.searchParams.set("intent", params.intent);
  }
  if (params?.invite?.trim()) {
    url.searchParams.set("invite", params.invite.trim());
  }
  if (params?.type) {
    url.searchParams.set("type", params.type);
  }
  return url.toString();
}

export async function signInWithOAuth(
  provider: AuthOAuthProvider,
  redirectTo: string,
) {
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
}

export async function signInWithOtpEmail(email: string, redirectTo: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return runClientGuardedAction({
    action: "auth-email-otp",
    scope: normalizedEmail,
    cooldownMs: 60_000,
    message: "Please wait a minute before requesting another email link.",
    run: () =>
      supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: redirectTo },
      }),
  });
}

export async function signInWithOtpPhone(phone: string) {
  const normalizedPhone = phone.trim();
  return runClientGuardedAction({
    action: "auth-phone-otp",
    scope: normalizedPhone,
    cooldownMs: 60_000,
    message: "Please wait a minute before requesting another SMS code.",
    run: () => supabase.auth.signInWithOtp({ phone: normalizedPhone }),
  });
}

export async function verifyPhoneOtp(phone: string, token: string) {
  const normalizedPhone = phone.trim();
  return runClientGuardedAction({
    action: "auth-phone-verify",
    scope: normalizedPhone,
    cooldownMs: 3_000,
    message:
      "Please wait a few seconds before trying another verification code.",
    run: () =>
      supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token,
        type: "sms",
      }),
  });
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  redirectTo?: string,
  metadata?: Record<string, unknown>,
) {
  const normalizedEmail = email.trim().toLowerCase();
  return runClientGuardedAction({
    action: "auth-signup",
    scope: normalizedEmail,
    cooldownMs: 30_000,
    message: "Please wait a little before trying to sign up again.",
    run: () =>
      supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
          ...(metadata ? { data: metadata } : {}),
        },
      }),
  });
}

export async function signInWithEmailPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return runClientGuardedAction({
    action: "auth-signin",
    scope: normalizedEmail,
    cooldownMs: 3_000,
    message: "Please wait a few seconds before trying to sign in again.",
    run: () =>
      supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      }),
  });
}

export async function resendSignupVerification(
  email: string,
  redirectTo: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  return runClientGuardedAction({
    action: "auth-resend-signup",
    scope: normalizedEmail,
    cooldownMs: 60_000,
    message:
      "Please wait a minute before requesting another verification email.",
    run: () =>
      supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { emailRedirectTo: redirectTo },
      }),
  });
}

export async function sendPasswordRecoveryEmail(
  email: string,
  redirectTo: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  return runClientGuardedAction({
    action: "auth-password-recovery",
    scope: normalizedEmail,
    cooldownMs: 60_000,
    message: "Please wait a minute before requesting another recovery email.",
    run: () =>
      supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      }),
  });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}
