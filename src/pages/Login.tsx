import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  const [submitFiredAt, setSubmitFiredAt] = useState<string | null>(null);
  const [lastClickAt, setLastClickAt] = useState<string | null>(null);
  const redirectMessage = searchParams.get("message");
  const canSubmit = email.trim().length > 3 && password.length > 0 && !loading;

  useEffect(() => {
    if (redirectMessage) {
      setErrorMessage(redirectMessage);
    }
  }, [redirectMessage]);

  const resolveRoleAndNavigate = useCallback(
    async (userId: string) => {
      console.log("resolveRoleAndNavigate", userId);
      const { data: member, error: memberError } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      console.log("workspace_members lookup", { member, memberError });

      if (memberError) {
        setErrorMessage(memberError.message);
      }

      if (member) {
        navigate("/pt/dashboard", { replace: true });
        return;
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      console.log("clients lookup", { client, clientError });

      if (clientError) {
        setErrorMessage(clientError.message);
      }

      if (client) {
        navigate("/app/home", { replace: true });
        return;
      }

      navigate("/no-workspace", { replace: true });
    },
    [navigate]
  );

  useEffect(() => {
    const checkExistingSession = async () => {
      console.log("CHECK EXISTING SESSION");
      const { data, error } = await supabase.auth.getSession();
      console.log("EXISTING SESSION RESULT", { data, error });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session?.user) {
        setDebugMessage("Already signed in, redirecting...");
        await resolveRoleAndNavigate(data.session.user.id);
      }
    };

    checkExistingSession();
  }, [resolveRoleAndNavigate]);

  useEffect(() => {
    const handleWindowClick = () => {
      console.log("WINDOW CLICK");
    };
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setDebugMessage(null);
    setSubmitFiredAt(new Date().toLocaleTimeString());
    console.log("SUBMIT FIRED");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log("signInWithPassword", { data, error });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const userId = data.session?.user?.id;
      setDebugMessage(
        `Login success. Session user id: ${userId ?? "unknown"}`
      );

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log("SESSION AFTER LOGIN", sessionData, sessionError);

      if (sessionError) {
        setErrorMessage(sessionError.message);
        return;
      }

      if (sessionData.session?.user?.id) {
        setDebugMessage(
          `Login success. Session user id: ${sessionData.session.user.id}`
        );
        await resolveRoleAndNavigate(sessionData.session.user.id);
      } else {
        setDebugMessage("Login success. Session not available yet.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10 outline outline-2 outline-dashed outline-accent/60">
      <div className="absolute left-4 top-4 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
        LOGIN REAL COMPONENT v6
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to your CoachOS workspace.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@coachos.com"
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
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {errorMessage ? (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {errorMessage}
              </div>
            ) : null}
            {debugMessage ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {debugMessage}
              </div>
            ) : null}
            {submitFiredAt ? (
              <div className="text-xs text-muted-foreground">Submit fired at {submitFiredAt}</div>
            ) : null}
            <button
              className="w-full cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground outline outline-2 outline-dashed outline-accent/60 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={!canSubmit}
              onClick={() => {
                console.log("BUTTON CLICKED", {
                  disabled: !canSubmit,
                  email,
                  passwordLen: password.length,
                  loading,
                });
                setLastClickAt(new Date().toLocaleTimeString());
              }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <div className="text-xs text-muted-foreground">
              {loading
                ? "Signing in..."
                : email.trim().length <= 3
                ? "Enter your email"
                : password.length === 0
                ? "Enter your password"
                : "Ready to sign in"}
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="fixed bottom-4 right-4 z-50 w-56 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground shadow-card">
        <div className="font-medium text-foreground">Login Debug</div>
        <div>loading: {loading ? "true" : "false"}</div>
        <div>buttonDisabled: {loading ? "true" : "false"}</div>
        <div>route: {location.pathname}</div>
        <div>lastClick: {lastClickAt ?? "never"}</div>
      </div>
    </div>
  );
}
