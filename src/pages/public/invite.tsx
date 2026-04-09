import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Apple,
  Facebook,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  Smartphone,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { FieldCharacterMeta } from "../../components/common/field-character-meta";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import {
  clearPendingInviteToken,
  ensureClientProfile,
  getUserAvatarUrl,
  getUserDisplayName,
  isClientAccountComplete,
  persistPendingInviteToken,
} from "../../lib/account-profiles";
import {
  signInWithOAuth,
  signInWithOtpEmail,
  signInWithOtpPhone,
  signUpWithEmailPassword,
  verifyPhoneOtp,
} from "../../lib/auth-helpers";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import { getCharacterLimitState } from "../../lib/character-limits";

type VerifyInviteRow = {
  is_valid: boolean;
  reason: string | null;
  invite_id: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_logo_url: string | null;
  role: string | null;
  expires_at: string | null;
};

type InviteTab = "social" | "email_link" | "phone_code" | "email_password";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong.";
}

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, authLoading } = useSessionAuth();
  const { accountType, patchBootstrap, refreshRole } = useBootstrapAuth();
  const [activeTab, setActiveTab] = useState<InviteTab>("social");
  const [inviteLoading, setInviteLoading] = useState(true);
  const [invite, setInvite] = useState<VerifyInviteRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [rateLimitedTab, setRateLimitedTab] = useState<InviteTab | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [passwordEmail, setPasswordEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneStep, setPhoneStep] = useState<"send" | "verify">("send");
  const acceptingInviteRef = useRef(false);
  const emailLimitState = getCharacterLimitState({
    value: email,
    kind: "email",
    fieldLabel: "Email",
  });
  const phoneLimitState = getCharacterLimitState({
    value: phone,
    kind: "default_text",
    fieldLabel: "Phone",
  });
  const passwordEmailLimitState = getCharacterLimitState({
    value: passwordEmail,
    kind: "email",
    fieldLabel: "Email",
  });
  const passwordLimitState = getCharacterLimitState({
    value: password,
    kind: "default_text",
    fieldLabel: "Password",
  });

  const tokenValue = token ?? "";
  const redirectTo = useMemo(
    () => `${window.location.origin}/invite/${tokenValue}`,
    [tokenValue],
  );

  useEffect(() => {
    let active = true;
    const loadInvite = async () => {
      if (!tokenValue) {
        setInviteLoading(false);
        setError("Missing invite token.");
        return;
      }
      setInviteLoading(true);
      setError(null);
      setNotice(null);
      try {
        const { data, error: verifyError } = await supabase.rpc(
          "verify_invite",
          {
            p_token: tokenValue,
          },
        );
        if (verifyError) throw verifyError;
        const row = Array.isArray(data)
          ? (data[0] as VerifyInviteRow | undefined)
          : undefined;
        if (!row || !row.is_valid) {
          setInvite(row ?? null);
          setError(
            row?.reason ? `Invite invalid: ${row.reason}` : "Invite invalid.",
          );
          return;
        }
        if (!active) return;
        setInvite(row);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to verify invite.",
        );
      } finally {
        if (active) setInviteLoading(false);
      }
    };
    loadInvite();
    return () => {
      active = false;
    };
  }, [tokenValue]);

  useEffect(() => {
    if (!session?.user || !invite?.is_valid || !tokenValue) return;
    if (accountType === "pt") return;
    if (acceptingInviteRef.current) return;
    const accept = async () => {
      acceptingInviteRef.current = true;
      setBusyAction("accept_invite");
      setError(null);
      setNotice(null);
      try {
        persistPendingInviteToken(tokenValue);
        const clientProfile = await ensureClientProfile({
          userId: session.user.id,
          fullName:
            window.localStorage.getItem("coachos_client_signup_name") ??
            getUserDisplayName(session.user),
          avatarUrl: getUserAvatarUrl(session.user),
          email: session.user.email ?? null,
        });
        if (!isClientAccountComplete(clientProfile)) {
          patchBootstrap({
            accountType: "client",
            role: "client",
            clientProfile,
            activeClientId: clientProfile?.id ?? null,
            clientAccountComplete: false,
            hasWorkspaceMembership: false,
            clientWorkspaceOnboardingHardGateRequired: false,
          });
          navigate(
            `/client/onboarding/account?invite=${encodeURIComponent(tokenValue)}`,
            { replace: true },
          );
          acceptingInviteRef.current = false;
          setBusyAction(null);
          return;
        }

        const { error: acceptError } = await supabase.rpc("accept_invite", {
          p_token: tokenValue,
        });
        if (acceptError) throw acceptError;
        setNotice("Invite accepted. Redirecting...");
        clearPendingInviteToken();
        patchBootstrap((prev) => ({
          accountType: "client",
          role: "client",
          hasWorkspaceMembership: true,
          clientWorkspaceOnboardingHardGateRequired: true,
          activeWorkspaceId: invite.workspace_id ?? prev.activeWorkspaceId,
          clientProfile: prev.clientProfile
            ? {
                ...prev.clientProfile,
                workspace_id: invite.workspace_id ?? prev.clientProfile.workspace_id,
              }
            : prev.clientProfile,
        }));
        await refreshRole?.();
        navigate("/app/onboarding", { replace: true });
      } catch (err) {
        acceptingInviteRef.current = false;
        setError(getErrorMessage(err) || "Failed to accept invite.");
      } finally {
        setBusyAction(null);
      }
    };
    accept();
  }, [
    accountType,
    invite?.workspace_id,
    session?.user,
    invite?.is_valid,
    tokenValue,
    navigate,
    patchBootstrap,
    refreshRole,
  ]);

  const isRateLimited = (message: string) =>
    message.toLowerCase().includes("rate limit");
  const tabDisabled = (tab: InviteTab) => rateLimitedTab === tab;
  const rateLimitHint =
    error && isRateLimited(error) ? "Try again in a few minutes." : null;

  const handleOAuth = async (provider: "google" | "apple" | "facebook") => {
    setBusyAction(`oauth_${provider}`);
    setError(null);
    setNotice(null);
    try {
      const { error: oauthError } = await signInWithOAuth(provider, redirectTo);
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(getErrorMessage(err) || "OAuth sign-in failed.");
      setBusyAction(null);
    }
  };

  const handleEmailOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = email.trim();
    if (emailLimitState.overLimit) {
      setError(emailLimitState.errorText);
      return;
    }
    if (!EMAIL_REGEX.test(nextEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (tabDisabled("email_link")) return;
    setBusyAction("email_link");
    setError(null);
    setNotice(null);
    try {
      const { error: otpError } = await signInWithOtpEmail(
        nextEmail,
        redirectTo,
      );
      if (otpError) throw otpError;
      setNotice("Magic link sent. Check your inbox.");
    } catch (err) {
      const message = getErrorMessage(err) || "Email OTP failed.";
      setError(message);
      if (isRateLimited(message)) setRateLimitedTab("email_link");
    } finally {
      setBusyAction(null);
    }
  };

  const handlePhoneOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPhone = phone.trim();
    if (phoneLimitState.overLimit) {
      setError(phoneLimitState.errorText);
      return;
    }
    if (!PHONE_REGEX.test(nextPhone)) {
      setError(
        "Enter a valid phone number in international format (e.g. +15555555555).",
      );
      return;
    }
    if (phoneStep === "verify" && phoneCode.trim().length < 4) {
      setError("Enter the SMS code.");
      return;
    }
    if (tabDisabled("phone_code")) return;
    setBusyAction("phone_code");
    setError(null);
    setNotice(null);
    try {
      if (phoneStep === "send") {
        const { error: sendError } = await signInWithOtpPhone(nextPhone);
        if (sendError) throw sendError;
        setPhoneStep("verify");
        setNotice("SMS code sent. Enter it below.");
      } else {
        const { error: verifyError } = await verifyPhoneOtp(
          nextPhone,
          phoneCode.trim(),
        );
        if (verifyError) throw verifyError;
        setNotice("Phone verified. Completing sign in...");
      }
    } catch (err) {
      const message = getErrorMessage(err) || "Phone OTP failed.";
      setError(message);
      if (isRateLimited(message)) setRateLimitedTab("phone_code");
    } finally {
      setBusyAction(null);
    }
  };

  const handleEmailPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = passwordEmail.trim();
    if (passwordEmailLimitState.overLimit || passwordLimitState.overLimit) {
      setError(
        passwordEmailLimitState.errorText ??
          passwordLimitState.errorText ??
          "Please fix over-limit fields before continuing.",
      );
      return;
    }
    if (!EMAIL_REGEX.test(nextEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (tabDisabled("email_password")) return;
    setBusyAction("email_password");
    setError(null);
    setNotice(null);
    try {
      const { error: signUpError } = await signUpWithEmailPassword(
        nextEmail,
        password,
        redirectTo,
      );
      if (signUpError) throw signUpError;
      setNotice(
        "Account created. Check your email to verify, then return to this invite.",
      );
    } catch (err) {
      const message = getErrorMessage(err) || "Email/password sign-up failed.";
      setError(message);
      if (isRateLimited(message)) setRateLimitedTab("email_password");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <AuthBackdrop contentClassName="max-w-lg">
      <div className="relative w-full max-w-lg">
        <div className="mb-4 px-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Accept invite
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Join{" "}
            <span className="font-medium text-foreground">
              {invite?.workspace_name ?? "Coach workspace"}
            </span>{" "}
            as a client.
          </p>
        </div>

        <Card className="rounded-2xl border-border/70 bg-card/90 shadow-card backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">
              Create your client access
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose one method to continue. Your invite token is already
              attached.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 rounded-2xl border border-border/50 bg-card/60 p-5 shadow-[0_0_0_1px_oklch(var(--primary)/0.08),0_16px_48px_-28px_oklch(var(--primary)/0.6)] focus-within:shadow-[0_0_0_1px_oklch(var(--primary)/0.25),0_20px_56px_-26px_oklch(var(--primary)/0.75)]">
            {inviteLoading || authLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : null}

            {error ? (
              <Alert className="border-danger/40 bg-danger/10">
                <AlertTitle className="flex items-center gap-2 text-danger">
                  <AlertCircle className="h-4 w-4" />
                  Notice
                </AlertTitle>
                <AlertDescription className="text-danger">
                  {error}
                  {rateLimitHint ? ` ${rateLimitHint}` : ""}
                </AlertDescription>
              </Alert>
            ) : null}

            {notice ? (
              <Alert className="border-primary/30 bg-primary/10">
                <AlertTitle className="text-primary">Status</AlertTitle>
                <AlertDescription className="text-primary/90">
                  {notice}
                </AlertDescription>
              </Alert>
            ) : null}

            {session?.user && accountType === "pt" ? (
              <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                This account is set up as a coach. Sign out and use a client
                account to accept this invite.
              </div>
            ) : session?.user ? (
              <div className="rounded-xl border border-border/70 bg-secondary/40 p-3 text-sm">
                Signed in as{" "}
                <span className="font-medium">
                  {session.user.email ?? session.user.phone}
                </span>
                .
                {busyAction === "accept_invite"
                  ? " Finalizing invite..."
                  : " Finishing invite acceptance..."}
              </div>
            ) : invite && invite.is_valid && !(inviteLoading || authLoading) ? (
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as InviteTab)}
                className="space-y-4"
              >
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/60 bg-background/35 p-1 md:grid-cols-4">
                  <TabsTrigger value="social">Social</TabsTrigger>
                  <TabsTrigger value="email_link">Email Link</TabsTrigger>
                  <TabsTrigger value="phone_code">Phone Code</TabsTrigger>
                  <TabsTrigger value="email_password">
                    Email + Password
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="social" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Use your existing account to continue quickly.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10"
                      onClick={() => void handleOAuth("google")}
                      disabled={Boolean(busyAction)}
                    >
                      {busyAction === "oauth_google" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Globe className="h-4 w-4" />
                      )}
                      Google
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10"
                      onClick={() => void handleOAuth("apple")}
                      disabled={Boolean(busyAction)}
                    >
                      {busyAction === "oauth_apple" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Apple className="h-4 w-4" />
                      )}
                      Apple
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10"
                      onClick={() => void handleOAuth("facebook")}
                      disabled={Boolean(busyAction)}
                    >
                      {busyAction === "oauth_facebook" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Facebook className="h-4 w-4" />
                      )}
                      Facebook
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="email_link" className="space-y-3">
                  <form className="space-y-3" onSubmit={handleEmailOtp}>
                    <div className="space-y-2">
                      <label
                        htmlFor="invite-email-link"
                        className="text-sm font-medium text-foreground"
                      >
                        Email
                      </label>
                      <Input
                        id="invite-email-link"
                        type="email"
                        isInvalid={emailLimitState.overLimit}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                      <FieldCharacterMeta
                        count={emailLimitState.count}
                        limit={emailLimitState.limit}
                        errorText={emailLimitState.errorText}
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        Boolean(busyAction) ||
                        tabDisabled("email_link") ||
                        emailLimitState.overLimit
                      }
                    >
                      {busyAction === "email_link" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      Send magic link
                    </Button>
                  </form>
                  {tabDisabled("email_link") ? (
                    <p className="text-xs text-amber-300">
                      Email link is temporarily rate-limited.{" "}
                      {rateLimitHint ?? ""}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    We will send a sign-in link to your email.
                  </p>
                </TabsContent>

                <TabsContent value="phone_code" className="space-y-3">
                  <form className="space-y-3" onSubmit={handlePhoneOtp}>
                    <div className="space-y-2">
                      <label
                        htmlFor="invite-phone"
                        className="text-sm font-medium text-foreground"
                      >
                        Phone
                      </label>
                      <Input
                        id="invite-phone"
                        type="tel"
                        isInvalid={phoneLimitState.overLimit}
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="+15555555555"
                        required
                      />
                      <FieldCharacterMeta
                        count={phoneLimitState.count}
                        limit={phoneLimitState.limit}
                        errorText={phoneLimitState.errorText}
                      />
                    </div>
                    {phoneStep === "verify" ? (
                      <div className="space-y-2">
                        <label
                          htmlFor="invite-phone-code"
                          className="text-sm font-medium text-foreground"
                        >
                          Verification code
                        </label>
                        <Input
                          id="invite-phone-code"
                          value={phoneCode}
                          onChange={(event) => setPhoneCode(event.target.value)}
                          placeholder="6-digit code"
                          required
                        />
                      </div>
                    ) : null}
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        Boolean(busyAction) ||
                        tabDisabled("phone_code") ||
                        phoneLimitState.overLimit
                      }
                    >
                      {busyAction === "phone_code" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Smartphone className="h-4 w-4" />
                      )}
                      {phoneStep === "send" ? "Send code" : "Verify code"}
                    </Button>
                  </form>
                  {tabDisabled("phone_code") ? (
                    <p className="text-xs text-amber-300">
                      Phone code is temporarily rate-limited.{" "}
                      {rateLimitHint ?? ""}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    We will text a one-time verification code.
                  </p>
                </TabsContent>

                <TabsContent value="email_password" className="space-y-3">
                  <form className="space-y-3" onSubmit={handleEmailPassword}>
                    <div className="space-y-2">
                      <label
                        htmlFor="invite-email-password"
                        className="text-sm font-medium text-foreground"
                      >
                        Email
                      </label>
                      <Input
                        id="invite-email-password"
                        type="email"
                        isInvalid={passwordEmailLimitState.overLimit}
                        value={passwordEmail}
                        onChange={(event) =>
                          setPasswordEmail(event.target.value)
                        }
                        placeholder="you@example.com"
                        required
                      />
                      <FieldCharacterMeta
                        count={passwordEmailLimitState.count}
                        limit={passwordEmailLimitState.limit}
                        errorText={passwordEmailLimitState.errorText}
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="invite-password"
                        className="text-sm font-medium text-foreground"
                      >
                        Password
                      </label>
                      <Input
                        id="invite-password"
                        type="password"
                        isInvalid={passwordLimitState.overLimit}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Minimum 8 characters"
                        required
                      />
                      <FieldCharacterMeta
                        count={passwordLimitState.count}
                        limit={passwordLimitState.limit}
                        errorText={passwordLimitState.errorText}
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        Boolean(busyAction) ||
                        tabDisabled("email_password") ||
                        passwordEmailLimitState.overLimit ||
                        passwordLimitState.overLimit
                      }
                    >
                      {busyAction === "email_password" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      Create account
                    </Button>
                  </form>
                  {tabDisabled("email_password") ? (
                    <p className="text-xs text-amber-300">
                      Email/password signup is temporarily rate-limited.{" "}
                      {rateLimitHint ?? ""}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Use this if you prefer a password instead of magic links.
                  </p>
                </TabsContent>
              </Tabs>
            ) : !inviteLoading && !authLoading ? (
              <div className="rounded-xl border border-border/70 bg-secondary/30 p-4 text-sm text-muted-foreground">
                This invite cannot be used right now. Ask your coach for a fresh
                invite.
              </div>
            ) : null}

            <div className="h-px bg-border/60" />
            <div className="pt-0 text-center text-xs text-muted-foreground">
              By continuing, you agree to Terms &amp; Privacy.
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthBackdrop>
  );
}
