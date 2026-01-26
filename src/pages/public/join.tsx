import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";

export function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { session, refreshRole } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const inviteCode = useMemo(() => code ?? "", [code]);
  const isMissingCode = inviteCode.length === 0;

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc("accept_invite", {
        p_code: inviteCode,
        p_display_name: displayName || null,
      });

      if (error) {
        console.error("accept_invite error", error);
        setStatus("error");
        setMessage(error.message);
        return;
      }

      if (!data) {
        setStatus("error");
        setMessage("Invite accepted, but no response was returned.");
        return;
      }

      if (refreshRole) {
        await refreshRole();
      }
      setStatus("success");
      setMessage("You’re in. Your coach will assign your first workout.");
      setTimeout(() => navigate("/app/home", { replace: true }), 1200);
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
            <Alert className={status === "error" ? "border-danger/30 bg-danger/10 text-danger" : "border-success/30 bg-success/10 text-success"}>
              <AlertTitle>{status === "error" ? "Unable to join invite" : "Invite accepted"}</AlertTitle>
              <AlertDescription className={status === "error" ? "text-danger" : "text-success"}>
                {message}
              </AlertDescription>
            </Alert>
          ) : null}

          {isMissingCode ? (
            <Alert className="border-danger/30 bg-danger/10 text-danger">
              <AlertTitle>Invalid invite</AlertTitle>
              <AlertDescription className="text-danger">
                This invite link is missing a code. Please request a new link from your coach.
              </AlertDescription>
            </Alert>
          ) : session?.user ? (
            <form className="space-y-3" onSubmit={handleAuth}>
              <div className="space-y-2">
                <label className="text-sm font-medium">Display name (optional)</label>
                <Input
                  placeholder="Alex Athlete"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={status === "loading"}>
                {status === "loading" ? "Joining..." : "Accept invite"}
              </Button>
            </form>
          ) : (
            <Alert className="border-warning/30 bg-warning/10 text-warning">
              <AlertTitle>Sign in required</AlertTitle>
              <AlertDescription className="text-warning">
                Please sign in to accept this invite.
                <div className="mt-3">
                  <Button asChild variant="secondary">
                    <Link to={`/login?redirect=/join/${inviteCode}`}>Go to login</Link>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
