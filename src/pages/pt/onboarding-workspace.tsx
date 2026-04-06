import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  ensurePtProfile,
  getUserDisplayName,
  updatePtProfile,
} from "../../lib/account-profiles";
import { supabase } from "../../lib/supabase";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function PtWorkspaceOnboardingPage() {
  const navigate = useNavigate();
  const { session, authLoading } = useSessionAuth();
  const {
    accountType,
    hasWorkspaceMembership,
    patchBootstrap,
    ptProfile,
    refreshRole,
  } = useBootstrapAuth();
  const [workspaceName, setWorkspaceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id || workspaceName) return;
    let active = true;

    const load = async () => {
      const local = window.localStorage.getItem("coachos_pt_workspace_name");
      if (local) {
        setWorkspaceName(local);
      }

      try {
        const storedFullName =
          window.localStorage.getItem("coachos_pt_signup_full_name") ??
          getUserDisplayName(session.user);
        const storedCountry =
          window.localStorage.getItem("coachos_pt_signup_country") ?? "";
        const storedCity =
          window.localStorage.getItem("coachos_pt_signup_city") ?? "";
        const storedPhone =
          window.localStorage.getItem("coachos_pt_signup_phone") ?? "";

        const ensuredProfile =
          ptProfile ??
          (await ensurePtProfile({
            userId: session.user.id,
            fullName: storedFullName,
          }));

        if (
          storedFullName ||
          storedCountry ||
          storedCity ||
          storedPhone ||
          !ensuredProfile.onboarding_completed_at
        ) {
          await updatePtProfile(session.user.id, {
            full_name: storedFullName || ensuredProfile.full_name,
            phone: storedPhone || ensuredProfile.phone,
            location_country: storedCountry || ensuredProfile.location_country,
            location_city: storedCity || ensuredProfile.location_city,
            onboarding_completed_at:
              ensuredProfile.onboarding_completed_at ?? new Date().toISOString(),
          });
        }

        if (!active) return;
      } catch (nextError) {
        if (!active) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load your PT profile.",
        );
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [ptProfile, session?.user, workspaceName]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (accountType === "client") return <Navigate to="/app/home" replace />;
  if (hasWorkspaceMembership) {
    return <Navigate to="/pt-hub" replace />;
  }

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
      const { data, error: createError } = await supabase.rpc("create_workspace", {
        p_name: name,
      });
      if (createError) throw createError;

      const createdWorkspaceId = Array.isArray(data)
        ? ((data[0] as { workspace_id?: string } | undefined)?.workspace_id ??
          null)
        : ((data as { workspace_id?: string } | null)?.workspace_id ?? null);

      window.localStorage.removeItem("coachos_pt_workspace_name");
      window.localStorage.removeItem("coachos_signup_intent");
      window.localStorage.removeItem("coachos_pt_signup_full_name");
      window.localStorage.removeItem("coachos_pt_signup_country");
      window.localStorage.removeItem("coachos_pt_signup_city");
      window.localStorage.removeItem("coachos_pt_signup_phone");
      patchBootstrap({
        accountType: "pt",
        role: "pt",
        hasWorkspaceMembership: true,
        ptWorkspaceComplete: true,
        activeWorkspaceId: createdWorkspaceId,
        ptProfile: ptProfile
          ? {
              ...ptProfile,
              onboarding_completed_at:
                ptProfile.onboarding_completed_at ?? new Date().toISOString(),
            }
          : ptProfile,
        ptProfileComplete:
          ptProfile?.onboarding_completed_at !== null &&
          ptProfile?.onboarding_completed_at !== undefined,
      });
      await refreshRole?.();
      navigate("/pt-hub", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create workspace.",
      );
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
            Set up your PT workspace to continue into Repsync.
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
                  window.localStorage.setItem(
                    "coachos_pt_workspace_name",
                    value,
                  );
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
