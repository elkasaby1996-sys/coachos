import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Globe, UserRound } from "lucide-react";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  ensureClientProfile,
  extractInviteToken,
  getPendingInviteToken,
  getUserAvatarUrl,
  persistPendingInviteToken,
} from "../../lib/account-profiles";
import { signInWithOAuth, signUpWithEmailPassword } from "../../lib/auth-helpers";
import { getAuthenticatedRedirectPath, useAuth } from "../../lib/auth";

export function ClientSignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    accountType,
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired,
    hasWorkspaceMembership,
    loading,
    pendingInviteToken: authPendingInviteToken,
    ptProfileComplete,
    ptWorkspaceComplete,
    session,
    user,
  } = useAuth();
  const pendingInviteToken = useMemo(
    () => extractInviteToken(searchParams.get("invite") ?? getPendingInviteToken() ?? ""),
    [searchParams],
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busyAction, setBusyAction] = useState<"idle" | "email" | "google">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!loading && session) {
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

  const handleEmailSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setBusyAction("email");
    setError(null);
    setNotice(null);
    try {
      if (pendingInviteToken) {
        persistPendingInviteToken(pendingInviteToken);
      }
      const { data, error: signUpError } = await signUpWithEmailPassword(
        email.trim(),
        password,
        `${window.location.origin}${targetHref}`,
      );
      if (signUpError) throw signUpError;

      const userId = data.user?.id ?? user?.id;
      if (userId) {
        await ensureClientProfile({
          userId,
          fullName,
          avatarUrl: getUserAvatarUrl(data.user ?? user ?? null),
          email,
        });
      }

      if (data.session) {
        navigate(targetHref, { replace: true });
        return;
      }

      setNotice(
        "Account created. Verify your email, then sign in to continue your client setup.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to create account.",
      );
    } finally {
      setBusyAction("idle");
    }
  };

  const handleGoogle = async () => {
    setBusyAction("google");
    setError(null);
    setNotice(null);
    try {
      if (!fullName.trim()) {
        setError("Add your full name before continuing with Google.");
        setBusyAction("idle");
        return;
      }
      if (pendingInviteToken) {
        persistPendingInviteToken(pendingInviteToken);
      }
      window.localStorage.setItem("coachos_client_signup_name", fullName.trim());
      const { error: oauthError } = await signInWithOAuth(
        "google",
        `${window.location.origin}${targetHref}`,
      );
      if (oauthError) throw oauthError;
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to continue with Google.",
      );
      setBusyAction("idle");
    }
  };

  return (
    <AuthBackdrop contentClassName="max-w-lg">
      <Card className="w-full rounded-[28px] border-border/70 bg-card/88 shadow-[0_32px_90px_-52px_rgba(0,0,0,0.72)] backdrop-blur-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl">Create your client account</CardTitle>
            <p className="text-sm text-muted-foreground">
              Build your profile now and connect to a coach whenever you're ready.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleEmailSignup}>
            <div className="space-y-2">
              <label htmlFor="client-full-name" className="text-sm font-medium">
                Full name
              </label>
              <Input
                id="client-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Sara Ahmed"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="client-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="client-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                {notice}
              </div>
            ) : null}

            <Button className="h-11 w-full" type="submit" disabled={busyAction !== "idle"}>
              {busyAction === "email" ? "Creating..." : "Create client account"}
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            <div className="h-px flex-1 bg-border/60" />
            <span>or</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          <Button
            variant="secondary"
            className="h-11 w-full"
            onClick={() => void handleGoogle()}
            disabled={busyAction !== "idle"}
          >
            <Globe className="h-4 w-4" />
            {busyAction === "google" ? "Redirecting..." : "Continue with Google"}
          </Button>

          {pendingInviteToken ? (
            <p className="text-center text-xs text-muted-foreground">
              Your invite will be ready after account setup.
            </p>
          ) : null}

          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <Link className="text-foreground underline" to="/login">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}
