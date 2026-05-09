import type { TeamInvitePreview } from "./contracts";

export type InvitePageState =
  | "loading"
  | "invalid"
  | "pending_signed_out"
  | "pending_matching_account"
  | "pending_wrong_account"
  | "pending_unverified_email"
  | "accepting"
  | "expired"
  | "revoked"
  | "already_accepted"
  | "error";

export type InvitePageStateInput = {
  preview: TeamInvitePreview | null | undefined;
  previewLoading?: boolean;
  previewError?: boolean;
  authLoading?: boolean;
  currentEmail?: string | null;
  emailVerified?: boolean;
  accepting?: boolean;
  acceptErrorCode?: string | null;
};

function normalizeEmailForCompare(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export function deriveInvitePageState(
  input: InvitePageStateInput,
): InvitePageState {
  if (input.previewLoading || input.authLoading) return "loading";
  if (input.previewError) return "invalid";
  if (!input.preview) return "invalid";

  if (input.acceptErrorCode === "INVITE_EMAIL_MISMATCH") {
    return "pending_wrong_account";
  }
  if (input.acceptErrorCode === "AUTHENTICATED_EMAIL_NOT_VERIFIED") {
    return "pending_unverified_email";
  }

  if (input.acceptErrorCode && input.acceptErrorCode !== "UNAUTHENTICATED") {
    return "error";
  }

  if (input.preview.status === "expired") return "expired";
  if (input.preview.status === "revoked") return "revoked";
  if (input.preview.status === "accepted") return "already_accepted";
  if (input.preview.status !== "pending") return "invalid";

  const currentEmail = normalizeEmailForCompare(input.currentEmail);
  if (!currentEmail) return "pending_signed_out";
  if (input.emailVerified === false) return "pending_unverified_email";

  const invitedEmail = normalizeEmailForCompare(input.preview.invitedEmail);
  if (currentEmail !== invitedEmail) return "pending_wrong_account";

  if (input.accepting) return "accepting";
  return "pending_matching_account";
}
