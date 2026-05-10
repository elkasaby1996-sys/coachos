import { useMemo, useState } from "react";
import type React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { supabase } from "../../lib/supabase";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import type {
  ClientAccessMode,
  InvitableWorkspaceRole,
  TeamInvitePreview,
} from "../../features/workspace-team/contracts";
import {
  deriveInvitePageState,
  type InvitePageState,
} from "../../features/workspace-team/invite-page-state";
import {
  acceptWorkspaceTeamInvite,
  getWorkspaceTeamInviteErrorCode,
  previewWorkspaceTeamInvite,
} from "../../features/workspace-team/invite-api";

const roleLabels: Record<InvitableWorkspaceRole, string> = {
  admin: "Admin",
  coach: "Coach",
  assistant_coach: "Assistant Coach",
  viewer: "Viewer",
};

const accessLabels: Record<ClientAccessMode, string> = {
  all_clients: "All clients",
  assigned_clients_only: "Assigned clients only",
};

function isUserEmailVerified(user: unknown) {
  if (!user || typeof user !== "object") return false;
  const candidate = user as {
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  };
  return Boolean(candidate.email_confirmed_at ?? candidate.confirmed_at);
}

function buildRedirectLink(path: string, token: string | undefined) {
  const returnTo = `/team-invites/${encodeURIComponent(token ?? "")}`;
  return `${path}?redirect=${encodeURIComponent(returnTo)}`;
}

function InviteStatusBadge({ state }: { state: InvitePageState }) {
  if (state === "expired") {
    return (
      <Badge tone="neutral">
        <Clock3 className="h-3.5 w-3.5" />
        Expired
      </Badge>
    );
  }
  if (state === "revoked" || state === "invalid" || state === "error") {
    return (
      <Badge tone="danger">
        <XCircle className="h-3.5 w-3.5" />
        Unavailable
      </Badge>
    );
  }
  if (state === "already_accepted") {
    return (
      <Badge tone="success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Accepted
      </Badge>
    );
  }
  if (
    state === "pending_wrong_account" ||
    state === "pending_unverified_email"
  ) {
    return (
      <Badge tone="warning">
        <ShieldAlert className="h-3.5 w-3.5" />
        Action needed
      </Badge>
    );
  }
  return (
    <Badge tone="info">
      <Clock3 className="h-3.5 w-3.5" />
      Pending invite
    </Badge>
  );
}

function RoleBadge({ role }: { role: InvitableWorkspaceRole }) {
  return <Badge module="coaching">{roleLabels[role]}</Badge>;
}

function InvitePreviewCard({
  preview,
  state,
}: {
  preview: TeamInvitePreview | null;
  state: InvitePageState;
}) {
  return (
    <Card className="w-full rounded-[28px] border-border/70 bg-card/90 shadow-[0_32px_90px_-52px_rgba(0,0,0,0.72)] backdrop-blur-xl">
      <CardHeader className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <InviteStatusBadge state={state} />
        </div>
        <div className="space-y-2">
          <CardTitle className="text-2xl">
            {preview?.workspaceName ?? "Workspace invite"}
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            {preview
              ? `You've been invited to join ${preview.workspaceName} on RepSync as ${roleLabels[preview.role]}.`
              : "We could not load this team invite."}
          </p>
        </div>
      </CardHeader>
      {preview ? (
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Role
              </p>
              <div className="mt-2">
                <RoleBadge role={preview.role} />
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Access
              </p>
              <p className="mt-2 text-sm font-medium">
                {accessLabels[preview.clientAccessMode]}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Invited account:{" "}
            <span className="font-medium text-foreground">
              {preview.invitedEmail}
            </span>
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function InviteActionPanel({
  state,
  preview,
  token,
  currentEmail,
  onAccept,
  onSignOut,
  successMessage,
  errorMessage,
}: {
  state: InvitePageState;
  preview: TeamInvitePreview | null;
  token: string | undefined;
  currentEmail: string | null;
  onAccept: () => void;
  onSignOut: () => void;
  successMessage: string | null;
  errorMessage: string | null;
}) {
  if (state === "loading" || state === "accepting") {
    return (
      <Alert tone="info">
        <AlertTitle className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {state === "accepting" ? "Accepting invite" : "Loading invite"}
        </AlertTitle>
        <AlertDescription>
          {state === "accepting"
            ? "We are adding this workspace to your PT Hub."
            : "We are checking the invite and your session."}
        </AlertDescription>
      </Alert>
    );
  }

  if (!preview) {
    return (
      <InviteTerminalState
        tone="danger"
        title="This invite could not be opened"
        description="The link may be invalid, expired, or no longer available."
      />
    );
  }

  if (state === "pending_signed_out") {
    return (
      <Alert tone="info">
        <AlertTitle>Sign in to accept</AlertTitle>
        <AlertDescription>
          Sign in or create a RepSync account with {preview.invitedEmail} to
          accept this invite.
        </AlertDescription>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button asChild>
            <Link to={buildRedirectLink("/login", token)}>
              Sign in to accept
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={buildRedirectLink("/signup/pt", token)}>
              Create account to accept
            </Link>
          </Button>
        </div>
      </Alert>
    );
  }

  if (state === "pending_matching_account") {
    return (
      <Alert tone="success">
        <AlertTitle className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Ready to join
        </AlertTitle>
        <AlertDescription>
          This invite matches your signed-in email. Accepting will add the
          workspace to your PT Hub.
        </AlertDescription>
        {successMessage ? (
          <p className="mt-3 text-sm font-medium text-[var(--state-success-text)]">
            {successMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 text-sm font-medium text-[var(--state-danger-text)]">
            {errorMessage}
          </p>
        ) : null}
        <Button className="mt-4 w-full" onClick={onAccept}>
          Accept invite
        </Button>
      </Alert>
    );
  }

  if (state === "pending_wrong_account") {
    return (
      <WrongInviteAccountState
        invitedEmail={preview.invitedEmail}
        currentEmail={currentEmail}
        onSignOut={onSignOut}
      />
    );
  }

  if (state === "pending_unverified_email") {
    return (
      <InviteTerminalState
        tone="warning"
        title="Verify your email first"
        description={`You are signed in as ${currentEmail ?? "this account"}, but your email needs to be verified before this invite can be accepted.`}
        action={
          <Button asChild>
            <Link to="/pt-hub">Back to PT Hub</Link>
          </Button>
        }
      />
    );
  }

  if (state === "expired") {
    return (
      <InviteTerminalState
        tone="neutral"
        title="Invite expired"
        description="This invite has expired. Ask the workspace owner or admin to send you a new invite."
      />
    );
  }

  if (state === "revoked") {
    return (
      <InviteTerminalState
        tone="danger"
        title="Invite unavailable"
        description="This invite is no longer available. It may have been revoked by the workspace owner or admin."
      />
    );
  }

  if (state === "already_accepted") {
    return (
      <InviteTerminalState
        tone="success"
        title="Invite already accepted"
        description="This invite has already been accepted. The workspace may already be available in your PT Hub."
        action={
          <Button asChild>
            <Link to="/pt-hub/workspaces">Open PT Hub</Link>
          </Button>
        }
      />
    );
  }

  return (
    <InviteTerminalState
      tone="danger"
      title="Invite unavailable"
      description={
        errorMessage ??
        "This invite cannot be accepted right now. Ask the workspace owner or admin for a fresh invite."
      }
    />
  );
}

function WrongInviteAccountState({
  invitedEmail,
  currentEmail,
  onSignOut,
}: {
  invitedEmail: string;
  currentEmail: string | null;
  onSignOut: () => void;
}) {
  return (
    <Alert tone="danger">
      <AlertTitle>Wrong signed-in account</AlertTitle>
      <AlertDescription>
        This invite was sent to {invitedEmail}. You are signed in as{" "}
        {currentEmail ?? "another account"}. Sign out and continue with{" "}
        {invitedEmail} to accept this invite.
      </AlertDescription>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={onSignOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
        <Button asChild>
          <Link to="/pt-hub">Back to PT Hub</Link>
        </Button>
      </div>
    </Alert>
  );
}

function InviteTerminalState({
  tone,
  title,
  description,
  action,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Alert tone={tone}>
      <AlertTitle className="inline-flex items-center gap-2">
        {tone === "success" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : tone === "warning" ? (
          <ShieldAlert className="h-4 w-4" />
        ) : tone === "neutral" ? (
          <Clock3 className="h-4 w-4" />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
        {title}
      </AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {action ? <div className="mt-4">{action}</div> : null}
    </Alert>
  );
}

export function TeamInviteAcceptancePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshBootstrap } = useBootstrapAuth();
  const { authLoading, user } = useSessionAuth();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [acceptErrorCode, setAcceptErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ["workspace-team-invite-preview", token],
    queryFn: () => previewWorkspaceTeamInvite(token ?? ""),
    enabled: Boolean(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptWorkspaceTeamInvite(token ?? ""),
    onMutate: () => {
      setAcceptErrorCode(null);
      setErrorMessage(null);
      setSuccessMessage(null);
    },
    onSuccess: async (result) => {
      setSuccessMessage("Workspace added to your PT Hub");
      await refreshBootstrap();
      await queryClient.invalidateQueries({ queryKey: ["pt-hub-workspaces"] });
      window.setTimeout(() => {
        navigate(result.redirectTo, { replace: true });
      }, 250);
    },
    onError: (error) => {
      const code = getWorkspaceTeamInviteErrorCode(error);
      setAcceptErrorCode(code);
      if (code === "INVITE_EMAIL_MISMATCH") return;
      setErrorMessage(
        code === "AUTHENTICATED_EMAIL_NOT_VERIFIED"
          ? "Verify your email before accepting this invite."
          : "This invite could not be accepted. Re-check the link or ask for a fresh invite.",
      );
    },
  });

  const preview = previewQuery.data ?? null;
  const currentEmail = user?.email ?? null;
  const pageState = deriveInvitePageState({
    preview,
    previewLoading: previewQuery.isLoading,
    previewError: previewQuery.isError || !token,
    authLoading,
    currentEmail,
    emailVerified: user ? isUserEmailVerified(user) : undefined,
    accepting: acceptMutation.isPending,
    acceptErrorCode,
  });

  const heading = useMemo(() => {
    if (pageState === "pending_signed_out") return "Join this workspace";
    if (pageState === "pending_matching_account")
      return "Accept workspace invite";
    if (pageState === "pending_wrong_account") return "Switch accounts";
    if (pageState === "already_accepted") return "Invite accepted";
    if (pageState === "expired" || pageState === "revoked")
      return "Invite unavailable";
    return "Workspace invite";
  }, [pageState]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate(`/team-invites/${encodeURIComponent(token ?? "")}`, {
      replace: true,
    });
  };

  return (
    <AuthBackdrop contentClassName="max-w-2xl">
      <main className="w-full space-y-5">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Workspace teams
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {heading}
          </h1>
        </div>
        <InvitePreviewCard preview={preview} state={pageState} />
        <InviteActionPanel
          state={pageState}
          preview={preview}
          token={token}
          currentEmail={currentEmail}
          onAccept={() => acceptMutation.mutate()}
          onSignOut={() => void handleSignOut()}
          successMessage={successMessage}
          errorMessage={errorMessage}
        />
      </main>
    </AuthBackdrop>
  );
}
