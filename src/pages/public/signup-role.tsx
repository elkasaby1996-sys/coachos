import { Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AppFooter } from "../../components/common/app-footer";
import {
  AuthFlowBackground,
  authFooterClassName,
  authFooterContentClassName,
} from "../../components/common/auth-backdrop";
import { AuthPageLoader } from "../../components/common/auth-page-loader";
import {
  getAuthenticatedRedirectPath,
  useBootstrapAuth,
  useSessionAuth,
} from "../../lib/auth";

export function SignupRolePage() {
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
  const { authLoading, session } = useSessionAuth();
  const redirectParam = new URLSearchParams(location.search).get("redirect");
  const inviteRedirect =
    redirectParam?.startsWith("/team-invites/") === true ? redirectParam : null;
  const redirectSearch = inviteRedirect
    ? `?redirect=${encodeURIComponent(inviteRedirect)}`
    : "";

  if (authLoading) {
    return <AuthPageLoader message="Checking your session..." />;
  }

  if (session && !bootstrapResolved) {
    return <AuthPageLoader message="Restoring your account path..." />;
  }

  if (session) {
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

  return (
    <main className="pt-hub-theme pt-hub-theme-light auth-flow-canvas relative isolate flex h-dvh flex-col overflow-hidden text-foreground">
      <AuthFlowBackground />

      <div className="auth-flow-brand fixed left-4 top-4 z-20 flex items-center md:left-1/2 md:-translate-x-1/2">
        <h1 className="text-xl font-bold tracking-normal text-foreground sm:text-2xl">
          RepSync
        </h1>
      </div>

      <section className="auth-flow-scroll relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-4 py-20">
        <div className="w-full text-center">
          <Link
            to="/login"
            className="group mb-7 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Back to sign in
          </Link>
          <h2 className="text-balance font-serif text-5xl font-light leading-none tracking-tight text-foreground sm:text-6xl">
            Sign up
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm font-medium leading-6 text-muted-foreground">
            Pick the path that matches how you'll use Repsync.
          </p>
        </div>

        <div className="grid w-full gap-4 md:grid-cols-2">
          <Link
            to={`/signup/pt${redirectSearch}`}
            className="group relative min-h-[12rem] overflow-hidden rounded-[32px] border border-border/55 bg-card/62 p-6 shadow-[0_28px_90px_-54px_oklch(var(--primary)/0.58),inset_0_1px_0_oklch(1_0_0/0.22)] backdrop-blur-2xl transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-1 hover:border-white/60 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="block text-2xl font-semibold tracking-tight text-foreground">
              I'm a Coach
            </span>
            <span className="mt-3 block text-sm leading-6 text-[oklch(0.99_0.004_95/0.94)]">
              Create a PT account, set up your workspace, and finish your coach
              profile.
            </span>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              Continue as coach
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            to={`/signup/client${redirectSearch}`}
            className="group relative min-h-[12rem] overflow-hidden rounded-[32px] border border-border/55 bg-card/62 p-6 shadow-[0_28px_90px_-54px_oklch(var(--primary)/0.58),inset_0_1px_0_oklch(1_0_0/0.22)] backdrop-blur-2xl transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-1 hover:border-white/60 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="block text-2xl font-semibold tracking-tight text-foreground">
              I'm a Client
            </span>
            <span className="mt-3 block text-sm leading-6 text-[oklch(0.99_0.004_95/0.94)]">
              Create your account now and connect to a coach later when you have
              an invite.
            </span>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              Continue as client
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </section>
      <AppFooter
        surface="transparent"
        className={authFooterClassName}
        contentClassName={authFooterContentClassName}
      />
    </main>
  );
}
