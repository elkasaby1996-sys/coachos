import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

export function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { session, refreshRole } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [shouldJoin, setShouldJoin] = useState(false);

  const inviteCode = useMemo(() => code ?? "", [code]);
  const isMissingCode = inviteCode.length === 0;

  useEffect(() => {
    if (inviteCode) {
      localStorage.setItem("pendingInviteCode", inviteCode);
    }
  }, [inviteCode]);

  useEffect(() => {
    if (!session?.user || !inviteCode || !shouldJoin) return;

    const acceptInvite = async () => {
      setStatus("loading");
      setMessage(null);

      try {
        const { data: invite, error: inviteError } = await supabase
          .from("invites")
          .select("id, code, workspace_id, expires_at, max_uses, uses")
          .eq("code", inviteCode)
          .maybeSingle();

        if (inviteError) throw inviteError;
        if (!invite) {
          setStatus("error");
          setMessage("This invite is invalid. Please request a new link.");
          return;
        }

        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
          setStatus("error");
          setMessage("This invite has expired. Please request a new link.");
          return;
        }

        const maxUses = invite.max_uses ?? 1;
        const currentUses = invite.uses ?? 0;
        if (currentUses >= maxUses) {
          setStatus("error");
          setMessage("This invite has already been used.");
          return;
        }

        const { data: existingClient } = await supabase
          .from("clients")
          .select("id, workspace_id")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!existingClient) {
          const { error: insertError } = await supabase.from("clients").insert({
            workspace_id: invite.workspace_id,
            user_id: session.user.id,
            status: "active",
            joined_at: new Date().toISOString(),
            name: session.user.user_metadata?.full_name ?? fullName ?? null,
            email: session.user.email,
          });

          if (insertError) throw insertError;
        }

        await supabase
          .from("invites")
          .update({ uses: currentUses + 1, used_at: new Date().toISOString() })
          .eq("id", invite.id);

        await refreshRole();
        setStatus("success");
        setMessage("You’re in. Your coach will assign your first workout.");
        setTimeout(() => navigate("/app/home", { replace: true }), 1500);
      } catch (err) {
        console.error("Invite join failed", err);
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Failed to join workspace.");
      }
    };

    acceptInvite();
  }, [inviteCode, navigate, refreshRole, session, shouldJoin, fullName]);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) throw error;

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setStatus("success");
          setMessage("Check your email to confirm your account, then return to this invite.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      setShouldJoin(true);
    } catch (err) {
      console.error("Auth failed", err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to continue.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Join your coach</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your details to accept the invite and access your plan.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-sm">
            <span>Invite code</span>
            <Badge variant={isMissingCode ? "danger" : "success"}>{inviteCode || "Missing"}</Badge>
          </div>
          {message ? (
            <div
              className={`rounded-lg border p-3 text-sm ${
                status === "error"
                  ? "border-danger/30 bg-danger/10 text-danger"
                  : "border-success/30 bg-success/10 text-success"
              }`}
            >
              {message}
            </div>
          ) : null}

          {isMissingCode ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              This invite link is missing a code. Please request a new link from your coach.
            </div>
          ) : session?.user ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Signed in as <span className="font-semibold text-foreground">{session.user.email}</span>
              </p>
              <Button
                className="w-full"
                onClick={() => setShouldJoin(true)}
                disabled={status === "loading"}
              >
                {status === "loading" ? "Joining..." : "Accept invite"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === "signup" ? "default" : "secondary"}
                  onClick={() => setMode("signup")}
                  className="flex-1"
                >
                  Sign up
                </Button>
                <Button
                  type="button"
                  variant={mode === "signin" ? "default" : "secondary"}
                  onClick={() => setMode("signin")}
                  className="flex-1"
                >
                  Log in
                </Button>
              </div>
              <form className="space-y-3" onSubmit={handleAuth}>
                {mode === "signup" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Full name</label>
                    <Input
                      placeholder="Alex Athlete"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    placeholder="athlete@email.com"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    placeholder="••••••••"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
                <Button className="w-full" type="submit" disabled={status === "loading"}>
                  {status === "loading"
                    ? "Continuing..."
                    : mode === "signup"
                      ? "Create account & join"
                      : "Log in & join"}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
