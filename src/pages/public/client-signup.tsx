import { useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { UserRound } from "lucide-react";
import { AuthPageLoader } from "../../components/common/auth-page-loader";
import { AuthComponent } from "../../components/ui/sign-up";
import { Input } from "../../components/ui/input";
import { FieldCharacterMeta } from "../../components/common/field-character-meta";
import {
  ensureClientProfile,
  extractInviteToken,
  getPendingInviteToken,
  getUserAvatarUrl,
  persistSignupIntent,
  persistPendingInviteToken,
} from "../../lib/account-profiles";
import {
  buildAuthCallbackUrl,
  signInWithOAuth,
  signUpWithEmailPassword,
} from "../../lib/auth-helpers";
import {
  getAuthenticatedRedirectPath,
  useBootstrapAuth,
  useSessionAuth,
} from "../../lib/auth";
import { getCharacterLimitState } from "../../lib/character-limits";

export function ClientSignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    accountType,
    bootstrapResolved,
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired,
    hasWorkspaceMembership,
    pendingInviteToken: authPendingInviteToken,
    ptProfileComplete,
    ptWorkspaceComplete,
  } = useBootstrapAuth();
  const { authLoading, session, user } = useSessionAuth();
  const pendingInviteToken = useMemo(
    () =>
      extractInviteToken(
        searchParams.get("invite") ?? getPendingInviteToken() ?? "",
      ),
    [searchParams],
  );
  const [fullName, setFullName] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const fullNameLimitState = getCharacterLimitState({
    value: fullName,
    kind: "full_name",
    fieldLabel: "Full name",
  });
  const hasOverLimitErrors = fullNameLimitState.overLimit;

  if (session && !bootstrapResolved) {
    return <AuthPageLoader message="Restoring your client account..." />;
  }

  if (!authLoading && session) {
    return (
      <Navigate
        to={getAuthenticatedRedirectPath({
          accountType,
          hasWorkspaceMembership,
          ptWorkspaceComplete,
          ptProfileComplete,
          clientAccountComplete,
          clientWorkspaceOnboardingHardGateRequired,
          pendingInviteToken: authPendingInviteToken ?? pendingInviteToken,
        })}
        replace
      />
    );
  }

  const targetHref = pendingInviteToken
    ? `/client/onboarding/account?invite=${encodeURIComponent(pendingInviteToken)}`
    : "/client/onboarding/account";

  const handleEmailSignup = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    if (hasOverLimitErrors) {
      return {
        error:
          fullNameLimitState.errorText ??
          "Please fix over-limit fields before continuing.",
      };
    }
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
      persistSignupIntent("client");
      if (pendingInviteToken) {
        persistPendingInviteToken(pendingInviteToken);
      }
      const { data, error: signUpError } = await signUpWithEmailPassword(
        email.trim(),
        password,
        buildAuthCallbackUrl({
          type: "signup",
          intent: "client",
          invite: pendingInviteToken,
          next: targetHref,
        }),
        {
          full_name: fullName.trim(),
          display_name: fullName.trim(),
          name: fullName.trim(),
          account_type: "client",
        },
      );
      if (signUpError) throw signUpError;

      const activeUser = data.session?.user ?? user ?? null;
      const userId = activeUser?.id;
      if (userId) {
        await ensureClientProfile({
          userId,
          fullName,
          avatarUrl: getUserAvatarUrl(activeUser),
          email,
        });
      }

      if (data.session) {
        navigate(targetHref, { replace: true });
        return { success: true };
      }

      return {
        notice:
          "Account created. Verify your email, then sign in to continue your client setup.",
      };
    } catch (nextError) {
      return {
        error:
          nextError instanceof Error
            ? nextError.message
            : "Unable to create account.",
      };
    }
  };

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      persistSignupIntent("client");
      if (hasOverLimitErrors) {
        return {
          error:
            fullNameLimitState.errorText ??
            "Please fix over-limit fields before continuing.",
        };
      }
      if (!fullName.trim()) {
        return { error: "Add your full name before continuing with Google." };
      }
      if (pendingInviteToken) {
        persistPendingInviteToken(pendingInviteToken);
      }
      window.localStorage.setItem(
        "coachos_client_signup_name",
        fullName.trim(),
      );
      const { error: oauthError } = await signInWithOAuth(
        "google",
        buildAuthCallbackUrl({
          type: "oauth",
          intent: "client",
          invite: pendingInviteToken,
          next: targetHref,
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
      brandName="RepSync"
      logo={
        <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
          <UserRound className="h-4 w-4" />
        </div>
      }
      title="Create your client account"
      subtitle={null}
      primaryLabel="Create client account"
      secondaryLinkHref="/login"
      secondaryLinkLabel="Already have an account? Sign in"
      submitDisabled={hasOverLimitErrors}
      socialDisabled={googleBusy || hasOverLimitErrors}
      preFields={
        <div className="space-y-2">
          <label htmlFor="client-full-name" className="text-sm font-medium">
            Full name
          </label>
          <Input
            id="client-full-name"
            isInvalid={fullNameLimitState.overLimit}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Sara Ahmed"
          />
          <FieldCharacterMeta
            count={fullNameLimitState.count}
            limit={fullNameLimitState.limit}
            errorText={fullNameLimitState.errorText}
          />
        </div>
      }
      footer={
        <>
          {pendingInviteToken ? (
            <p className="text-center text-xs text-muted-foreground">
              Your invite will be ready after account setup.
            </p>
          ) : null}
        </>
      }
      onEmailPasswordSubmit={handleEmailSignup}
      onGoogle={handleGoogle}
      onPhone={async () => {
        return { notice: "Phone sign-up will be wired next." };
      }}
    />
  );
}
