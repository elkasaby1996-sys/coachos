import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { supabase, supabaseConfigured } from "../../lib/supabase";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      if (!supabaseConfigured) {
        setErrorMsg("Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const session = data.session ?? null;

      if (session) {
        const from = (location.state as { from?: unknown } | null)?.from;
        if (typeof from === "string" && from.startsWith("/join/")) {
          navigate(from, { replace: true });
          return;
        }

        try {
          const workspaceMember = await supabase
            .from("workspace_members")
            .select("workspace_id, role")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (workspaceMember.error) {
            setErrorMsg(workspaceMember.error.message);
            return;
          }

          const isPt =
            workspaceMember.data?.role && workspaceMember.data.role.startsWith("pt");

          if (workspaceMember.data && isPt) {
            if (location.pathname !== "/pt/dashboard") {
              navigate("/pt/dashboard", { replace: true });
            }
            return;
          }

          const clientMember = await supabase
            .from("clients")
            .select("id, workspace_id, status")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (clientMember.error) {
            setErrorMsg(clientMember.error.message);
            return;
          }

          if (clientMember.data) {
            if (location.pathname !== "/app/home") {
              navigate("/app/home", { replace: true });
            }
            return;
          }

          if (location.pathname !== "/no-workspace") {
            navigate("/no-workspace", { replace: true });
          }
          return;
        } catch (err) {
          console.error("ROLE ROUTE ERROR", err);
          setErrorMsg(err instanceof Error ? err.message : "Failed to route after login.");
          return;
        }
      }

      setErrorMsg("Sign-in succeeded, but no session was created.");
    } catch (err) {
      console.error("SIGN IN ERROR", err);
      setErrorMsg(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            LOGIN PAGE REAL FILE v9
          </div>
          <CardTitle>Welcome to CoachOS</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your athletes or access your client portal.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                placeholder="you@coachos.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {errorMsg ? (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {errorMsg}
              </div>
            ) : null}
            <Button
              className="w-full"
              type="submit"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              Joining a workspace?{" "}
              <Link className="text-foreground underline" to="/join/sample">
                Use your invite code
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
