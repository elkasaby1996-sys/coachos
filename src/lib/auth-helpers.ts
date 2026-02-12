import { supabase } from "./supabase";

export type AuthOAuthProvider = "google" | "apple" | "facebook";

export async function signInWithOAuth(provider: AuthOAuthProvider, redirectTo: string) {
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
}

export async function signInWithOtpEmail(email: string, redirectTo: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
}

export async function signInWithOtpPhone(phone: string) {
  return supabase.auth.signInWithOtp({ phone });
}

export async function verifyPhoneOtp(phone: string, token: string) {
  return supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });
}

export async function signUpWithEmailPassword(email: string, password: string, redirectTo?: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
}

export async function signInWithEmailPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}
