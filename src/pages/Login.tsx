import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  const redirectMessage = searchParams.get("message");

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setDebugMessage(null);
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
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
            <Button
              className="w-full"
              type="submit"
              disabled={loading}
              onClick={() => console.log("BUTTON CLICKED")}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
