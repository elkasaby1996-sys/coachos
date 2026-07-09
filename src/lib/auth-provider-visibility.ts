import type { AuthOAuthProvider } from "./auth-helpers";

export const betaSupportedOAuthProviders = ["google"] as const;
export const stagedOAuthProviders = ["apple", "facebook"] as const;

export type BetaSupportedOAuthProvider =
  (typeof betaSupportedOAuthProviders)[number];

export function isBetaSupportedOAuthProvider(
  provider: AuthOAuthProvider,
): provider is BetaSupportedOAuthProvider {
  return betaSupportedOAuthProviders.includes(
    provider as BetaSupportedOAuthProvider,
  );
}
