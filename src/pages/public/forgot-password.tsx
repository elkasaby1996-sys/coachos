import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Mail } from "lucide-react";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  buildAuthCallbackUrl,
  sendPasswordRecoveryEmail,
} from "../../lib/auth-helpers";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setError(null);
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      const { error: recoveryError } = await sendPasswordRecoveryEmail(
        email,
        buildAuthCallbackUrl({
          type: "recovery",
          next: "/auth/reset-password",
        }),
      );
      if (recoveryError) throw recoveryError;
      setNotice(
        "If an account exists for that email, a recovery link will arrive shortly.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to send recovery email.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthBackdrop contentClassName="max-w-md">
      <Card className="w-full rounded-[28px] border-border/70 bg-card/90 shadow-[0_32px_90px_-52px_rgba(0,0,0,0.72)] backdrop-blur-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl">Recover your account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email and we will send a secure reset link if the account
            exists.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="recovery-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
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
            <Button className="h-11 w-full" type="submit" disabled={busy}>
              <Mail className="h-4 w-4" />
              {busy ? "Sending..." : "Send recovery link"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link className="text-foreground underline" to="/login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}
