const MAX_CONFIRMATION_INPUT_LENGTH = 4096;

/** Only fragments carry credentials. Invalid inputs return no diagnostics. */
export function parseSignupConfirmationToken(source: string): string | null {
  if (source.length > MAX_CONFIRMATION_INPUT_LENGTH) return null;
  const hashIndex = source.indexOf("#");
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(source.slice(hashIndex + 1));
  const tokens = params.getAll("token_hash");
  if (tokens.length !== 1 || !tokens[0]?.trim()) return null;
  return tokens[0];
}

export type SignupConfirmationIntent = "pt" | "client" | "unknown";

export function getSignupConfirmationIntent(
  metadata: unknown,
): SignupConfirmationIntent {
  if (!metadata || typeof metadata !== "object") return "unknown";
  const accountType = (metadata as Record<string, unknown>).account_type;
  return accountType === "pt" || accountType === "client"
    ? accountType
    : "unknown";
}

export function getSignupConfirmationCallbackPath(
  intent: SignupConfirmationIntent,
): string {
  if (intent === "pt")
    return "/auth/callback?type=signup&intent=pt&next=/pt/onboarding/workspace";
  if (intent === "client")
    return "/auth/callback?type=signup&intent=client&next=/client/onboarding/account";
  return "/auth/callback?type=signup";
}
