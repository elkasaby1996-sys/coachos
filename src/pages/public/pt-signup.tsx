import { useNavigate } from "react-router-dom";
import { Dumbbell } from "lucide-react";
import { AuthComponent } from "../../components/ui/sign-up";
import { signInWithOAuth, signUpWithEmailPassword } from "../../lib/auth-helpers";

export function PtSignupPage() {
  const navigate = useNavigate();

  return (
    <AuthComponent
      mode="signup"
      brandName="CoachOS"
      logo={
        <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
          <Dumbbell className="h-4 w-4" />
        </div>
      }
      title="Create PT account"
      subtitle="After signup, you will create your workspace in the next step."
      primaryLabel="Create account"
      secondaryLinkHref="/login"
      secondaryLinkLabel="Already have an account? Sign in"
      onEmailPasswordSubmit={async ({ email, password }) => {
        const redirectTo = `${window.location.origin}/pt/onboarding/workspace`;
        const { data, error } = await signUpWithEmailPassword(email, password, redirectTo);

        if (error) {
          return { error: error.message };
        }

        window.localStorage.setItem("coachos_signup_intent", "pt");

        if (data.session) {
          navigate("/pt/onboarding/workspace", { replace: true });
          return { success: true };
        }

        return {
          notice: "Account created. Verify your email, then sign in to continue onboarding.",
          success: false,
        };
      }}
      onGoogle={async () => {
        window.localStorage.setItem("coachos_signup_intent", "pt");
        const redirectTo = `${window.location.origin}/pt/onboarding/workspace`;
        const { error } = await signInWithOAuth("google", redirectTo);

        if (error) {
          return { error: error.message };
        }

        return { notice: "Redirecting to Google..." };
      }}
    />
  );
}
