import { parseSignupConfirmationToken } from "./signup-confirmation";

function captureAndScrub(): string | null {
  if (
    typeof window === "undefined" ||
    window.location.pathname !== "/confirm-signup"
  )
    return null;
  const token = parseSignupConfirmationToken(window.location.hash);
  window.history.replaceState(window.history.state, "", "/confirm-signup");
  return token;
}

// Imported first by main.tsx: scrub before Supabase, routing and telemetry start.
// This one-use handoff lives only in memory until the lazy page mounts.
let initialToken = captureAndScrub();

export function takeSignupConfirmationToken(): string | null {
  const currentToken = captureAndScrub();
  const token = currentToken ?? initialToken;
  initialToken = null;
  return token;
}
