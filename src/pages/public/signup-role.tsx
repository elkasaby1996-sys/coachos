import { Link, Navigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import { Button } from "../../components/ui/button";
import { getAuthenticatedRedirectPath, useAuth } from "../../lib/auth";

export function SignupRolePage() {
  const {
    accountType,
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired,
    hasWorkspaceMembership,
    loading,
    pendingInviteToken,
    ptProfileComplete,
    ptWorkspaceComplete,
    session,
  } = useAuth();

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
          pendingInviteToken,
        })}
        replace
      />
    );
  }

  return (
    <AuthBackdrop contentClassName="max-w-2xl">
      <div className="auth-shell-card max-w-2xl">
        <div className="mb-4">
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 text-sm font-medium text-white/68 transition-[color,transform] duration-200 hover:-translate-x-0.5 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Back to sign in
          </Link>
        </div>
        <div className="space-y-2 text-center">
          <h1 className="auth-shell-title">Create your account</h1>
          <p className="auth-shell-subtitle">
            Pick the path that matches how you'll use Repsync.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="surface-section p-4">
            <h3 className="text-base font-semibold text-foreground">
              I'm a Coach
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a PT account, set up your workspace, and finish your coach profile.
            </p>
            <Button asChild className="mt-4 h-11 w-full">
              <Link to="/signup/pt">Continue as coach</Link>
            </Button>
          </div>

          <div className="surface-section p-4">
            <h3 className="text-base font-semibold text-foreground">
              I'm a Client
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your account now and connect to a coach later when you have an invite.
            </p>
            <Button asChild className="mt-4 h-11 w-full">
              <Link to="/signup/client">Continue as client</Link>
            </Button>
          </div>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an invite link? Open it directly, or sign in and paste it on the no-workspace screen later.
        </p>
      </div>
    </AuthBackdrop>
  );
}
