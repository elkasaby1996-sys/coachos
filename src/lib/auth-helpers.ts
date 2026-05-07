import { supabase } from "./supabase";
import { runClientGuardedAction } from "./request-guard";

export type AuthOAuthProvider = "google" | "apple" | "facebook";

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
    message: "Please wait a few seconds before trying another verification code.",
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
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
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
