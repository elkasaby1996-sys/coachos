import { useLocation, useNavigate } from "react-router-dom";
import { Dumbbell } from "lucide-react";
import { AuthComponent } from "../../components/ui/sign-up";
import {
  signInWithEmailPassword,
  signInWithOAuth,
} from "../../lib/auth-helpers";
import { supabaseConfigured } from "../../lib/supabase";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: unknown } | null)?.from;
  const redirectTarget =
    typeof from === "string" &&
    (from.startsWith("/join/") ||
      from.startsWith("/invite/") ||
      from.startsWith("/pt/onboarding/"))
      ? from
      : "/";

  return (
    <AuthComponent
      mode="signin"
      brandName="CoachOS"
      logo={
        <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
          <Dumbbell className="h-4 w-4" />
        </div>
      }
      title="Welcome back"
      subtitle="Sign in to manage athletes or access your client app."
      primaryLabel="Sign in"
      secondaryLinkHref="/signup"
      secondaryLinkLabel="Need an account? Sign up"
      onEmailPasswordSubmit={async ({ email, password }) => {
        if (!supabaseConfigured) {
          return {
            error:
              "Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
          };
        }

        const { data, error } = await signInWithEmailPassword(email, password);
        if (error) {
          return { error: error.message };
        }

        if (!data.session) {
          return { error: "Sign-in succeeded, but no session was created." };
        }

        navigate(redirectTarget, { replace: true });
        return { success: true };
      }}
      onGoogle={async () => {
        if (!supabaseConfigured) {
          return {
            error:
              "Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
          };
        }

        const redirectTo = `${window.location.origin}${redirectTarget}`;
        const { error } = await signInWithOAuth("google", redirectTo);
        if (error) {
          return { error: error.message };
        }

        return { notice: "Redirecting to Google..." };
      }}
    />
  );
}
