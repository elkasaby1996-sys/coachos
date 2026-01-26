import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

export function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, refreshRole } = useAuth();
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "joining" | "success" | "invalid" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [invite, setInvite] = useState<{
    id: string;
    workspace_id: string;
    role: string | null;
    code: string;
    expires_at: string | null;
    max_uses: number | null;
    uses: number | null;
  } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [goal, setGoal] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const inviteCode = useMemo(() => code ?? "", [code]);
  const isMissingCode = inviteCode.length === 0;
  const tagOptions = ["Bodybuilding", "CrossFit", "Strength", "Fat loss"];
  const contactHref = useMemo(
    () =>
      `mailto:?subject=${encodeURIComponent(
        "Invite issue"
      )}&body=${encodeURIComponent(`Invite code: ${inviteCode}`)}`,
    [inviteCode]
  );

  useEffect(() => {
    if (inviteCode) {
      localStorage.setItem("pendingInviteCode", inviteCode);
    }
  }, [inviteCode]);

  useEffect(() => {
    if (!session?.user || !inviteCode) return;

    const loadInvite = async () => {
      setStatus("loading");
      setMessage(null);
      setInvite(null);

      try {
        const { data: inviteData, error: inviteError } = await supabase
          .from("invites")
          .select("id, workspace_id, role, code, expires_at, max_uses, uses")
          .eq("code", inviteCode)
          .single();

        if (inviteError) {
          if (inviteError.code === "PGRST116") {
            setStatus("invalid");
            setMessage(`Invite ${inviteCode} is invalid. Please contact your coach.`);
            return;
          }
          throw inviteError;
        }

        if (inviteData.expires_at && new Date(inviteData.expires_at) <= new Date()) {
          setStatus("invalid");
          setMessage(`Invite ${inviteCode} has expired. Please contact your coach.`);
          return;
        }

        const maxUses = inviteData.max_uses ?? null;
        const currentUses = inviteData.uses ?? 0;
        if (maxUses !== null && currentUses >= maxUses) {
          setStatus("invalid");
          setMessage(`Invite ${inviteCode} has already been used. Please contact your coach.`);
          return;
        }

        const { data: existingClient, error: existingError } = await supabase
          .from("clients")
          .select("id")
          .eq("workspace_id", inviteData.workspace_id)
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (existingError) throw existingError;

        if (existingClient) {
          await refreshRole();
          setStatus("success");
          setMessage("You’re in. Your coach will assign your first workout.");
          return;
        }

        setInvite(inviteData);
        setStatus("ready");
      } catch (err) {
        console.error("Invite lookup failed", err);
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Failed to load invite.");
      }
    };

    loadInvite();
  }, [inviteCode, refreshRole, session]);

  useEffect(() => {
    if (status === "success") {
      const timeout = setTimeout(() => navigate("/app/home", { replace: true }), 1200);
      return () => clearTimeout(timeout);
    }
    return;
  }, [navigate, status]);

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!session?.user || !invite) return;
    if (!displayName.trim()) {
      setStatus("error");
      setMessage("Display name is required.");
      return;
    }

    setStatus("joining");

    try {
      const { data: existingClient, error: existingError } = await supabase
        .from("clients")
        .select("id")
        .eq("workspace_id", invite.workspace_id)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (!existingClient) {
        const { error: insertError } = await supabase
          .from("clients")
          .insert({
            workspace_id: invite.workspace_id,
            user_id: session.user.id,
            status: "active",
            display_name: displayName.trim(),
            goal: goal.trim() || null,
            tags,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;

        const nextUses = (invite.uses ?? 0) + 1;
        const { error: updateError } = await supabase
          .from("invites")
          .update({ uses: nextUses })
          .eq("id", invite.id);

        if (updateError) throw updateError;
      }

      await refreshRole();
      setStatus("success");
      setMessage("You’re in. Your coach will assign your first workout.");
    } catch (err) {
      console.error("Invite join failed", err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to join workspace.");
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
            <Alert
              className={
                status === "error" || status === "invalid"
                  ? "border-danger/30 bg-danger/10 text-danger"
                  : "border-success/30 bg-success/10 text-success"
              }
            >
              <AlertTitle>
                {status === "success" ? "Success" : status === "error" ? "Error" : "Notice"}
              </AlertTitle>
              <AlertDescription className="text-current">{message}</AlertDescription>
            </Alert>
          ) : null}

          {isMissingCode ? (
            <Alert className="border-danger/30 bg-danger/10 text-danger">
              <AlertTitle>Missing invite code</AlertTitle>
              <AlertDescription className="text-current">
                This invite link is missing a code. Please request a new link from your coach.
              </AlertDescription>
            </Alert>
          ) : loading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !session?.user ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in to accept this invite and join your coach&apos;s workspace.
              </p>
              <Button
                className="w-full"
                onClick={() =>
                  navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
                }
              >
                Sign in to join
              </Button>
            </div>
          ) : status === "invalid" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This invite can&apos;t be used. Please ask your coach for a new link.
              </p>
              <Button className="w-full" variant="secondary" asChild>
                <a href={contactHref}>Contact coach</a>
              </Button>
            </div>
          ) : status === "loading" || status === "idle" ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : status === "success" ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              You&apos;re in. Your coach will assign your first workout.
            </div>
          ) : status === "error" && !invite ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              We couldn&apos;t load this invite. Please contact your coach for a new link.
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleJoin}>
              <p className="text-sm text-muted-foreground">
                Signed in as <span className="font-semibold text-foreground">{session.user.email}</span>
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="display-name">
                  Display name
                </label>
                <Input
                  id="display-name"
                  placeholder="Alex Athlete"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="goal">
                  Goal (optional)
                </label>
                <textarea
                  id="goal"
                  className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="What do you want to focus on?"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Tags (optional)</div>
                <div className="flex flex-wrap gap-2">
                  {tagOptions.map((tag) => {
                    const selected = tags.includes(tag);
                    return (
                      <Button
                        key={tag}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "secondary"}
                        onClick={() =>
                          setTags((prev) =>
                            prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
                          )
                        }
                      >
                        {tag}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <Button className="w-full" type="submit" disabled={status === "joining"}>
                {status === "joining" ? "Joining..." : "Join workspace"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
