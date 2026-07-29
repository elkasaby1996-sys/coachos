import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthPageLoader } from "../../components/common/auth-page-loader";
import { AuthComponent } from "../../components/ui/sign-up";
import { Input } from "../../components/ui/input";
import {
  ensurePtProfile,
  persistSignupIntent,
  syncPtAccountIdentity,
  updatePtProfile,
} from "../../lib/account-profiles";
import {
  buildAuthCallbackUrl,
  signInWithOAuth,
  signUpWithEmailPassword,
} from "../../lib/auth-helpers";
import { supabase } from "../../lib/supabase";
import { getMarketingSiteUrl } from "../../lib/marketing-site";
import {
  getAuthenticatedRedirectPath,
  useBootstrapAuth,
  useSessionAuth,
} from "../../lib/auth";

const ptDetailFieldClassName =
  "border-border/70 bg-card/55 shadow-[inset_0_1px_0_oklch(1_0_0/0.62),0_10px_28px_-24px_oklch(var(--primary)/0.55)] backdrop-blur-xl focus-visible:ring-primary/45";

async function getPtNextPath(userId: string) {
  const { data: workspaceRows, error: workspaceError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .limit(25);

  if (workspaceError) throw workspaceError;

  const hasWorkspace = (workspaceRows ?? []).some((row) =>
    row.role?.startsWith("pt"),
  );
  if (!hasWorkspace) return "/pt/onboarding/workspace";
  return "/pt-hub";
}

export function PtSignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    accountType,
    bootstrapResolved,
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired,
    hasWorkspaceMembership,
    pendingInviteToken,
    ptProfileComplete,
    ptWorkspaceComplete,
  } = useBootstrapAuth();
  const { authLoading, session, user } = useSessionAuth();
  const [fullName, setFullName] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const redirectParam = new URLSearchParams(location.search).get("redirect");
  const inviteRedirect =
    redirectParam?.startsWith("/team-invites/") === true ? redirectParam : null;

  if (session && !bootstrapResolved) {
    return <AuthPageLoader message="Restoring your coach account..." />;
  }

  if (!authLoading && session) {
    return (
      <Navigate
        to={
          inviteRedirect ??
          getAuthenticatedRedirectPath({
            accountType,
            hasWorkspaceMembership,
            ptWorkspaceComplete,
            ptProfileComplete,
            clientAccountComplete,
            clientWorkspaceOnboardingHardGateRequired,
            pendingInviteToken,
          })
        }
        replace
      />
    );
  }

  const persistPtSignupDraft = () => {
    persistSignupIntent("pt");
    window.localStorage.setItem("coachos_pt_signup_full_name", fullName.trim());
    window.localStorage.removeItem("coachos_pt_signup_country");
    window.localStorage.removeItem("coachos_pt_signup_city");
    window.localStorage.removeItem("coachos_pt_signup_phone");
  };

  const handleEmailSignup = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    if (!fullName.trim()) {
      return { error: "Full name is required." };
    }
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      return { error: "Enter a valid email address." };
    }
    if (password.length < 6) {
      return { error: "Password must be at least 6 characters." };
    }

    try {
      persistPtSignupDraft();
      const redirectTo = buildAuthCallbackUrl({
        type: "signup",
        intent: "pt",
        next: inviteRedirect ?? "/pt/onboarding/workspace",
      });
      const { data, error: signUpError } = await signUpWithEmailPassword(
        email.trim(),
        password,
        redirectTo,
        {
          full_name: fullName.trim(),
          display_name: fullName.trim(),
          name: fullName.trim(),
          account_type: "pt",
        },
      );
      if (signUpError) throw signUpError;

      const activeUserId = data.session?.user?.id ?? user?.id;
      if (activeUserId) {
        await ensurePtProfile({
          userId: activeUserId,
          fullName,
        });
        await updatePtProfile(activeUserId, {
          full_name: fullName,
          onboarding_completed_at: new Date().toISOString(),
        });
        await syncPtAccountIdentity({
          userId: activeUserId,
          fullName,
          contactEmail: email.trim(),
          supportEmail: email.trim(),
        });
      }

      if (data.session?.user?.id) {
        navigate(
          inviteRedirect ?? (await getPtNextPath(data.session.user.id)),
          {
            replace: true,
          },
        );
        return { success: true };
      }

      return {
        notice:
          "Account created. Verify your email, then sign in to continue PT onboarding.",
      };
    } catch (nextError) {
      return {
        error:
          nextError instanceof Error
            ? nextError.message
            : "Unable to create PT account.",
      };
    }
  };

  const handleGoogle = async () => {
    if (!fullName.trim()) {
      return { error: "Full name is required before continuing with Google." };
    }
    setGoogleBusy(true);
    try {
      persistPtSignupDraft();
      const { error: oauthError } = await signInWithOAuth(
        "google",
        buildAuthCallbackUrl({
          type: "oauth",
          intent: "pt",
          next: inviteRedirect ?? "/pt/onboarding/workspace",
        }),
      );
      if (oauthError) throw oauthError;
      return { notice: "Redirecting to Google..." };
    } catch (nextError) {
      return {
        error:
          nextError instanceof Error
            ? nextError.message
            : "Unable to continue with Google.",
      };
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <AuthComponent
      mode="signup"
      brandName="R E P S Y N C"
      brandHref={getMarketingSiteUrl()}
      title="Start your 7-day Growth trial"
      subtitle="No card required. Add your coaching profile details after your account is ready."
      primaryLabel="Start free trial"
      secondaryLinkHref={
        inviteRedirect
          ? `/login?redirect=${encodeURIComponent(inviteRedirect)}`
          : "/login"
      }
      secondaryLinkLabel="Already have an account? Sign in"
      socialDisabled={googleBusy}
      preFields={
        <div className="app-form-grid">
          <div className="app-form-col-12 space-y-2">
            <label htmlFor="pt-full-name" className="text-sm font-medium">
              Full name
            </label>
            <Input
              id="pt-full-name"
              className={ptDetailFieldClassName}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Coach name"
              autoComplete="name"
            />
          </div>
        </div>
      }
      onEmailPasswordSubmit={handleEmailSignup}
      onGoogle={handleGoogle}
    />
  );
}
