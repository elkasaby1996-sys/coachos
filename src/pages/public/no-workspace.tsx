import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  extractInviteToken,
  getPendingInviteToken,
  persistPendingInviteToken,
} from "../../lib/account-profiles";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function NoWorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    accountType,
    bootstrapResolved,
    bootstrapStale,
    clientAccountComplete,
    hasWorkspaceMembership,
    hasStableBootstrap,
    pendingInviteToken,
    ptWorkspaceComplete,
  } = useBootstrapAuth();
  const { authLoading, session } = useSessionAuth();
  const [inviteCode, setInviteCode] = useState(
    pendingInviteToken ?? getPendingInviteToken() ?? "",
  );
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!bootstrapResolved && !(bootstrapStale && hasStableBootstrap)) return;
    if (!session) {
      if (location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
      return;
    }
    if (accountType === "pt" && !ptWorkspaceComplete) {
      navigate("/pt/onboarding/workspace", { replace: true });
      return;
    }
    if (accountType === "pt" && ptWorkspaceComplete) {
      navigate("/pt-hub", { replace: true });
      return;
    }
    if (accountType === "unknown" && ptWorkspaceComplete) {
      navigate("/pt-hub", { replace: true });
      return;
    }
    if (accountType === "client" && !clientAccountComplete) {
      navigate(
        pendingInviteToken
          ? `/client/onboarding/account?invite=${encodeURIComponent(
              pendingInviteToken,
            )}`
          : "/client/onboarding/account",
        { replace: true },
      );
      return;
    }
    if (
      (accountType === "client" || accountType === "unknown") &&
      clientAccountComplete &&
      hasWorkspaceMembership
    ) {
      navigate("/app/home", { replace: true });
    }
  }, [
    accountType,
    authLoading,
    bootstrapResolved,
    bootstrapStale,
    clientAccountComplete,
    hasStableBootstrap,
    hasWorkspaceMembership,
    location.pathname,
    navigate,
    pendingInviteToken,
    ptWorkspaceComplete,
    session,
  ]);

  if (authLoading || (!bootstrapResolved && !(bootstrapStale && hasStableBootstrap))) {
    return (
      <AuthBackdrop contentClassName="max-w-md">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Loading</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Checking workspace membership...
          </CardContent>
        </Card>
      </AuthBackdrop>
    );
  }

  if (!session) return null;

  const handleInviteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedToken = extractInviteToken(inviteCode);
    if (!normalizedToken) {
      setInviteError("Please enter a valid invite token or link.");
      return;
    }
    setInviteError(null);
    persistPendingInviteToken(normalizedToken);
    setInviteCode(normalizedToken);
    navigate(`/invite/${normalizedToken}`);
  };

  return (
    <AuthBackdrop contentClassName="max-w-md">
      <Card className="w-full max-w-md">
        <div data-testid="no-workspace-page" />
        <CardHeader>
          <CardTitle>
            {accountType === "client"
              ? "You're not connected to a coach yet"
              : "No workspace found"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {accountType === "client"
              ? "Paste an invite token or full invite link whenever you're ready to join a coach."
              : "We couldn't match your account to a workspace yet. Join a coach with an invite code or create your own PT workspace to continue."}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild variant="secondary">
            <Link to="/login">Back to login</Link>
          </Button>
          {accountType !== "client" ? (
            <Button asChild>
              <Link to="/pt/onboarding/workspace">Create PT workspace</Link>
            </Button>
          ) : null}
          {accountType === "client" ? (
            <form className="space-y-3 rounded-2xl border border-border/70 bg-secondary/20 p-4" onSubmit={handleInviteSubmit}>
              <p className="text-sm font-medium text-foreground">
                Join with an invite
              </p>
              <Input
                autoFocus
                placeholder="Paste invite token or full invite link"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
              />
              {inviteError ? (
                <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {inviteError}
                </div>
              ) : null}
              <Button className="w-full" type="submit">
                Continue
              </Button>
            </form>
          ) : (
            <Button variant="ghost" onClick={() => navigate("/login")}>
              Use an invite code
            </Button>
          )}
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}
