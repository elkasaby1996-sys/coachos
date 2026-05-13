import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Dumbbell } from "lucide-react";
import { AuthComponent } from "../../components/ui/sign-up";
import {
  buildAuthCallbackUrl,
  signInWithEmailPassword,
  signInWithOAuth,
} from "../../lib/auth-helpers";
import { getMarketingSiteUrl } from "../../lib/marketing-site";
import { supabaseConfigured } from "../../lib/supabase";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.title = "Login — RepSync";
  }, []);

  const from = (location.state as { from?: unknown } | null)?.from;
  const redirectParam = new URLSearchParams(location.search).get("redirect");
  const requestedRedirect = typeof from === "string" ? from : redirectParam;
  const redirectTarget =
    requestedRedirect &&
    (requestedRedirect.startsWith("/join/") ||
      requestedRedirect.startsWith("/invite/") ||
      requestedRedirect.startsWith("/team-invites/") ||
      requestedRedirect.startsWith("/pt/onboarding/"))
      ? requestedRedirect
      : "/";
  const signupLink =
    redirectTarget !== "/"
      ? `/signup?redirect=${encodeURIComponent(redirectTarget)}`
      : "/signup";

  return (
    <AuthComponent
      mode="signin"
      brandName="RepSync"
      brandHref={getMarketingSiteUrl()}
      logo={
        <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
          <Dumbbell className="h-4 w-4" />
        </div>
      }
      title="Welcome back"
      subtitle=""
      primaryLabel="Sign in"
      secondaryLinkHref={signupLink}
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

        const redirectTo = buildAuthCallbackUrl({
          type: "oauth",
          next: redirectTarget,
        });
        const { error } = await signInWithOAuth("google", redirectTo);
        if (error) {
          return { error: error.message };
        }

        return { notice: "Redirecting to Google..." };
      }}
      onApple={async () => {
        return { notice: "Apple sign-in will be wired next." };
      }}
      onFacebook={async () => {
        return { notice: "Facebook sign-in will be wired next." };
      }}
      onPhone={async () => {
        return { notice: "Phone sign-in will be wired next." };
      }}
    />
  );
}
