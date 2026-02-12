import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function PtWorkspaceOnboardingPage() {
  const navigate = useNavigate();
  const { session, loading, role, refreshRole } = useAuth();
  const [workspaceName, setWorkspaceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.email) {
      const local = window.localStorage.getItem("coachos_pt_workspace_name");
      if (local && !workspaceName) setWorkspaceName(local);
    }
  }, [session?.user?.email, workspaceName]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (role === "client") return <Navigate to="/app/home" replace />;
  if (role === "pt") return <Navigate to="/pt/dashboard" replace />;

  const handleCreateWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = workspaceName.trim();
    if (!name) {
      setError("Workspace name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { error: createError } = await supabase.rpc("create_workspace", {
        p_name: name,
      });
      if (createError) throw createError;

      window.localStorage.removeItem("coachos_pt_workspace_name");
      window.localStorage.removeItem("coachos_signup_intent");
      await refreshRole?.();
      navigate("/pt/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthBackdrop contentClassName="max-w-lg">
      <Card className="w-full max-w-lg rounded-2xl border-border/70 bg-card/85 shadow-[0_30px_60px_-40px_oklch(var(--primary)/0.5)] backdrop-blur-xl">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <p className="text-sm text-muted-foreground">
            Set up your PT workspace to continue into CoachOS.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleCreateWorkspace}>
            <div className="space-y-2">
              <label htmlFor="workspace-name" className="text-sm font-medium">
                Workspace name
              </label>
              <Input
                id="workspace-name"
                value={workspaceName}
                onChange={(event) => {
                  const value = event.target.value;
                  setWorkspaceName(value);
                  window.localStorage.setItem("coachos_pt_workspace_name", value);
                }}
                placeholder="Velocity PT Lab"
                required
              />
            </div>
            {error ? (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Creating..." : "Create workspace"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}
