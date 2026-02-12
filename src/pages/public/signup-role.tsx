import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

function extractInviteToken(input: string): string {
  const value = input.trim();
  if (!value) return "";

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value);
      const parts = url.pathname.split("/").filter(Boolean);
      const inviteIndex = parts.findIndex((p) => p === "invite" || p === "join");
      if (inviteIndex >= 0 && parts[inviteIndex + 1]) return parts[inviteIndex + 1];
      return "";
    } catch {
      return "";
    }
  }

  return value;
}

export function SignupRolePage() {
  const navigate = useNavigate();
  const [inviteInput, setInviteInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onContinueClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = extractInviteToken(inviteInput);
    if (!token) {
      setError("Enter a valid invite code or invite link.");
      return;
    }
    setError(null);
    navigate(`/invite/${token}`);
  };

  return (
    <AuthBackdrop contentClassName="max-w-2xl">
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-border/70 bg-card/85 p-6 shadow-[0_30px_60px_-40px_oklch(var(--primary)/0.5)] backdrop-blur-xl">
        <div className="space-y-2 text-center">
          <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">Create your account</h1>
          <p className="text-sm text-muted-foreground">Select your role to continue.</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/55 p-4">
            <h3 className="text-base font-semibold text-foreground">I am a PT</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Coaches can create a new account and set up their workspace.
            </p>
            <Button asChild className="mt-4 h-11 w-full">
              <Link to="/signup/pt">Continue as PT</Link>
            </Button>
          </div>

          <form className="rounded-xl border border-border/70 bg-background/55 p-4" onSubmit={onContinueClient}>
            <h3 className="text-base font-semibold text-foreground">I am a client</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Clients must join using an invite code or invite link from their PT.
            </p>
            <Input
              className="mt-4 h-11 border-border/70 bg-background/80"
              placeholder="Paste invite code or full invite link"
              value={inviteInput}
              onChange={(event) => setInviteInput(event.target.value)}
            />
            {error ? (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <Button className="mt-3 h-11 w-full" type="submit">
              Continue with invite
            </Button>
          </form>
        </div>
      </div>
    </AuthBackdrop>
  );
}
