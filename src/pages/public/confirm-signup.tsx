import { useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  getSignupConfirmationCallbackPath,
  getSignupConfirmationIntent,
} from "../../lib/signup-confirmation";
import { takeSignupConfirmationToken } from "../../lib/signup-confirmation-entry";
import { supabase } from "../../lib/supabase";
import { usePublicSeo } from "./public-seo";

export function ConfirmSignupPage() {
  const navigate = useNavigate();
  const tokenRef = useRef<string | null>(null);
  const capturedRef = useRef(false);
  const pendingRef = useRef(false);
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    // Keep the captured credential through StrictMode's effect replay.
    if (capturedRef.current) return;
    capturedRef.current = true;
    tokenRef.current = takeSignupConfirmationToken();
    setHasToken(Boolean(tokenRef.current));
  }, []);

  usePublicSeo({
    title: "Confirm your email — RepSync",
    description:
      "Confirm your email address to finish creating your RepSync account.",
    robots: "noindex,nofollow",
    canonicalPath: "/confirm-signup",
  });

  const confirmEmail = async () => {
    if (pendingRef.current || !tokenRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenRef.current,
        type: "email",
      });
      if (
        error ||
        !data.user ||
        !data.session ||
        data.session.user.id !== data.user.id
      ) {
        setFailed(true);
        return;
      }
      tokenRef.current = null;
      navigate(
        getSignupConfirmationCallbackPath(
          getSignupConfirmationIntent(data.user.user_metadata),
        ),
        { replace: true },
      );
    } catch {
      // Provider errors may contain credentials or internal details.
      setFailed(true);
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthBackdrop contentClassName="max-w-md">
      <Card className="w-full rounded-[var(--ui-radius-card)] border-border/70 bg-card/90 shadow-[0_32px_90px_-52px_rgba(0,0,0,0.72)] backdrop-blur-xl">
        <CardHeader className="space-y-3 text-center">
          <CardTitle className="text-2xl">
            {hasToken ? "Confirm your email" : "Confirmation link unavailable"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {hasToken
              ? "Confirm your email address to finish creating your RepSync account."
              : "This confirmation link is incomplete or has already been used. Request a new verification email and try again."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {failed ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              We couldn't confirm this email. The link may have expired or
              already been used. Request a new verification email and try again.
            </p>
          ) : null}
          {hasToken ? (
            <Button
              type="button"
              className="h-11 w-full"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void confirmEmail()}
            >
              {busy ? "Confirming..." : "Confirm email"}
            </Button>
          ) : null}
          <Button asChild variant="secondary" className="h-11 w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}
