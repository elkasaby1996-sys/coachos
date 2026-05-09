import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  getAuthCallbackHashSession,
  getCallbackFallbackPath,
  parseAuthCallbackUrl,
  provisionCallbackProfile,
} from "../../lib/auth-callback";
import { getAuthenticatedRedirectPath, useBootstrapAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";

type CallbackState =
  | { status: "loading"; title: string; description: string }
  | { status: "success"; title: string; description: string; nextPath: string }
  | { status: "error"; title: string; description: string };

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const bootstrap = useBootstrapAuth();
  const bootstrapRef = useRef(bootstrap);
  const processedRef = useRef(false);
  const [state, setState] = useState<CallbackState>({
    status: "loading",
    title: "Finishing sign in",
    description: "We are verifying your secure link.",
  });

  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (processedRef.current) return;
      processedRef.current = true;
      const callbackUrl = window.location.href;
      const parsed = parseAuthCallbackUrl(callbackUrl);
      const hashSession = getAuthCallbackHashSession(callbackUrl);
      if (parsed.hasHashToken) {
        window.history.replaceState(
          null,
          document.title,
          `${window.location.pathname}${window.location.search}`,
        );
      }
      if (parsed.hasError) {
        setState({
          status: "error",
          title: "This link could not be used",
          description:
            parsed.errorDescription ??
            "The link may be invalid, expired, or already used.",
        });
        return;
      }

      try {
        if (parsed.hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(
            new URL(window.location.href).searchParams.get("code") ?? "",
          );
          if (error) throw error;
        }
        if (hashSession) {
          const { error } = await supabase.auth.setSession({
            access_token: hashSession.accessToken,
            refresh_token: hashSession.refreshToken,
          });
          if (error) throw error;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const session = data.session;
        const isRecovery =
          parsed.kind === "recovery" ||
          parsed.nextPath === "/auth/reset-password";

        if (!session?.user) {
          if (isRecovery) {
            navigate("/auth/reset-password", { replace: true });
            return;
          }
          throw new Error("Your session could not be restored from this link.");
        }

        if (isRecovery) {
          if (!active) return;
          setState({
            status: "success",
            title: "Recovery link verified",
            description: "Choose a new password to finish recovery.",
            nextPath: "/auth/reset-password",
          });
          window.setTimeout(() => {
            if (active) navigate("/auth/reset-password", { replace: true });
          }, 250);
          return;
        }

        await provisionCallbackProfile({
          user: session.user,
          intent: parsed.intent,
          inviteToken: parsed.inviteToken,
        });
        await bootstrapRef.current.refreshBootstrap();
        const latestBootstrap = bootstrapRef.current;

        const fallbackPath = getCallbackFallbackPath({
          kind: parsed.kind,
          intent: parsed.intent,
          inviteToken: parsed.inviteToken,
        });
        const nextPath =
          parsed.nextPath ??
          (parsed.kind === "recovery"
            ? "/auth/reset-password"
            : (latestBootstrap.bootstrapPath ??
              getAuthenticatedRedirectPath({
                accountType: latestBootstrap.accountType,
                hasWorkspaceMembership: latestBootstrap.hasWorkspaceMembership,
                ptWorkspaceComplete: latestBootstrap.ptWorkspaceComplete,
                ptProfileComplete: latestBootstrap.ptProfileComplete,
                clientAccountComplete: latestBootstrap.clientAccountComplete,
                clientWorkspaceOnboardingHardGateRequired:
                  latestBootstrap.clientWorkspaceOnboardingHardGateRequired,
                pendingInviteToken:
                  parsed.inviteToken ?? latestBootstrap.pendingInviteToken,
              }) ??
              fallbackPath));

        if (!active) return;
        setState({
          status: "success",
          title:
            parsed.kind === "recovery"
              ? "Recovery link verified"
              : "Account verified",
          description: "Your secure link was accepted.",
          nextPath,
        });

        window.setTimeout(() => {
          if (active) navigate(nextPath, { replace: true });
        }, 450);
      } catch (error) {
        if (!active) return;
        setState({
          status: "error",
          title: "This link could not be used",
          description:
            error instanceof Error
              ? error.message
              : "The link may be invalid, expired, or already used.",
        });
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [navigate]);

  const isLoading = state.status === "loading";
  const isSuccess = state.status === "success";

  return (
    <AuthBackdrop contentClassName="max-w-md">
      <Card className="w-full rounded-[28px] border-border/70 bg-card/90 shadow-[0_32px_90px_-52px_rgba(0,0,0,0.72)] backdrop-blur-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isSuccess ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
          </div>
          <CardTitle className="text-2xl">{state.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{state.description}</p>
          {state.status === "error" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="secondary">
                <Link to="/auth/forgot-password">Recover account</Link>
              </Button>
              <Button asChild>
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}
