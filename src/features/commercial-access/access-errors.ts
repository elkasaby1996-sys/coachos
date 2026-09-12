import { z } from "zod";
export const ACCESS_ERROR_CODES = [
  "ACCOUNT_ACCESS_ACTION_NOT_ALLOWED",
  "ACCOUNT_ACCESS_EXISTING_DELIVERY_ONLY",
  "ACCOUNT_ACCESS_READ_ONLY",
  "ACCOUNT_ACCESS_EXPIRED",
  "ACCOUNT_ACCESS_ONBOARDING_ONLY",
  "ACCOUNT_ACCESS_OWNER_RECOVERY_REQUIRED",
  "WORKSPACE_COMMERCIAL_ACCESS_UNAVAILABLE",
  "CLIENT_COACHING_INTERACTION_UNAVAILABLE",
  "PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS",
] as const;
export type AccessErrorCode = (typeof ACCESS_ERROR_CODES)[number];
export function commercialErrorCode(error: unknown): AccessErrorCode | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { message?: unknown; details?: unknown };
  const exact = z.enum(ACCESS_ERROR_CODES).safeParse(e.message);
  if (exact.success) return exact.data;
  if (typeof e.details === "string") {
    try {
      const detail = z
        .object({ code: z.enum(ACCESS_ERROR_CODES) })
        .passthrough()
        .safeParse(JSON.parse(e.details));
      return detail.success ? detail.data.code : null;
    } catch {
      return null;
    }
  }
  return null;
}
export function commercialErrorMessage(code: AccessErrorCode): string {
  if (code === "PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS")
    return "This coach is not accepting new applications right now.";
  if (code === "CLIENT_COACHING_INTERACTION_UNAVAILABLE")
    return "Coaching interaction is currently unavailable. Your account and historical content remain available.";
  if (code === "WORKSPACE_COMMERCIAL_ACCESS_UNAVAILABLE")
    return "This workspace is restricted. Contact its owner for help.";
  if (code === "ACCOUNT_ACCESS_OWNER_RECOVERY_REQUIRED")
    return "We could not confirm your account access. Contact support; your records are preserved.";
  return "This action is unavailable with your current account access. Review Billing to recover access. Your input has been kept.";
}
export class CommercialAccessError extends Error {
  constructor(public readonly code: AccessErrorCode) {
    super(commercialErrorMessage(code));
    this.name = "CommercialAccessError";
  }
}
