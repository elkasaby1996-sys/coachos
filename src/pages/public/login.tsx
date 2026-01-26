import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { supabase } from "../../lib/supabase";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugMsg, setDebugMsg] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("SUBMIT FIRED");
    setLoading(true);
    setErrorMsg(null);
    setDebugMsg(null);

    const stateFrom = (location.state as { from?: string } | null)?.from;
    const joinTarget = stateFrom && stateFrom.startsWith("/join/") ? stateFrom : null;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.log("SIGN IN RESULT", { data, error });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setDebugMsg(`Login success: ${data.user?.id ?? "unknown user"}`);

    const { data: s } = await supabase.auth.getSession();
    console.log("SESSION AFTER LOGIN", s.session);

    if (s.session) {
      setDebugMsg(
        `Login success: ${data.user?.id ?? "unknown user"} (session: yes)`
      );

      if (joinTarget) {
        navigate(joinTarget, { replace: true });
        setLoading(false);
        return;
      }

      const workspaceMember = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", s.session.user.id)
        .maybeSingle();

      if (workspaceMember.data) {
        navigate("/pt/dashboard", { replace: true });
        setLoading(false);
        return;
      }

      const clientMember = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", s.session.user.id)
        .maybeSingle();

      if (clientMember.data) {
        navigate("/app/home", { replace: true });
        setLoading(false);
        return;
      }

      navigate("/no-workspace", { replace: true });
      setLoading(false);
      return;
    }

    setDebugMsg(
      `Login success: ${data.user?.id ?? "unknown user"} (session: no)`
    );
    setLoading(false);
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
            {debugMsg ? (
              <div className="text-xs text-muted-foreground">{debugMsg}</div>
            ) : null}
            <Button
              className="w-full"
              type="submit"
              disabled={loading}
              onClick={() =>
                console.log("BUTTON CLICKED", {
                  email,
                  passwordLen: password.length,
                  loading,
                })
              }
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
            <p className="text-xs text-muted-foreground">
              If nothing happens, check console logs.
            </p>
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
