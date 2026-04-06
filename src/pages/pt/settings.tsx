import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { EmptyState, Skeleton } from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import { safeSelect } from "../../lib/supabase-safe";
import { useThemePreference } from "../../lib/use-theme-preference";
import { useWorkspace } from "../../lib/use-workspace";
import { useSessionAuth } from "../../lib/auth";
import { refreshWorkspaceNameAcrossApp } from "../../lib/workspace-query";
import {
  AVAILABLE_THEME_PREFERENCES,
  LIGHT_MODE_ENABLED,
} from "../../lib/theme";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";

export function PtSettingsPage() {
  const navigate = useNavigate();
  const {
    workspaceId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();
  const { session } = useSessionAuth();
  const queryClient = useQueryClient();
  const [defaultTemplateId, setDefaultTemplateId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [brandingSaveStatus, setBrandingSaveStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );
  const {
    themePreference,
    compactDensity,
    updateAppearance,
    isSaving: appearanceSaving,
  } = useThemePreference();
  const [appearanceTheme, setAppearanceTheme] = useState(themePreference);
  const [appearanceCompactDensity, setAppearanceCompactDensity] =
    useState(compactDensity);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaveStatus, setPasswordSaveStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const workspaceQuery = useQuery({
    queryKey: ["pt-settings-workspace", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, default_checkin_template_id")
        .eq("id", workspaceId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        name: string | null;
        default_checkin_template_id: string | null;
      } | null;
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["pt-settings-checkin-templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await safeSelect<{
        id: string;
        workspace_id: string;
        name: string | null;
        description?: string | null;
        is_active?: boolean | null;
        created_at?: string | null;
      }>({
        table: "checkin_templates",
        columns: "id, workspace_id, name, description, is_active, created_at",
        fallbackColumns: "id, workspace_id, name, created_at",
        filter: (query) =>
          query
            .eq("workspace_id", workspaceId ?? "")
            .order("created_at", { ascending: false }),
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        workspace_id: string;
        name: string | null;
        description?: string | null;
        is_active?: boolean | null;
        created_at?: string | null;
      }>;
    },
  });

  useEffect(() => {
    if (!workspaceQuery.data) return;
    setDefaultTemplateId(workspaceQuery.data.default_checkin_template_id ?? "");
    setWorkspaceName(workspaceQuery.data.name ?? "");
  }, [workspaceQuery.data]);

  useEffect(() => {
    setAppearanceTheme(themePreference);
  }, [themePreference]);

  useEffect(() => {
    setAppearanceCompactDensity(compactDensity);
  }, [compactDensity]);

  const availableDefaultTemplates = useMemo(() => {
    const rows = templatesQuery.data ?? [];
    return rows.filter(
      (template) =>
        template.is_active !== false || template.id === defaultTemplateId,
    );
  }, [defaultTemplateId, templatesQuery.data]);

  const handleSaveDefaultTemplate = async () => {
    if (!workspaceId) return;
    setSaveStatus("saving");
    const nextId = defaultTemplateId || null;
    const { error } = await supabase
      .from("workspaces")
      .update({ default_checkin_template_id: nextId })
      .eq("id", workspaceId);
    if (error) {
      setSaveStatus("error");
      setToastVariant("error");
      setToastMessage("Unable to save default check-in template.");
      return;
    }
    setSaveStatus("idle");
    setToastVariant("success");
    setToastMessage("Default check-in template updated.");
    await queryClient.invalidateQueries({
      queryKey: ["pt-settings-workspace", workspaceId],
    });
  };

  const handleSaveWorkspaceName = async () => {
    if (!workspaceId) return;
    const nextName = workspaceName.trim();
    if (!nextName) {
      setToastVariant("error");
      setToastMessage("Workspace name is required.");
      return;
    }
    setBrandingSaveStatus("saving");
    const { error } = await supabase
      .from("workspaces")
      .update({ name: nextName })
      .eq("id", workspaceId);
    if (error) {
      setBrandingSaveStatus("error");
      setToastVariant("error");
      setToastMessage("Unable to update workspace name.");
      return;
    }
    setBrandingSaveStatus("idle");
    setToastVariant("success");
    setToastMessage("Workspace name updated.");
    await refreshWorkspaceNameAcrossApp(queryClient, workspaceId, nextName);
  };

  const handleSaveAppearance = async () => {
    await updateAppearance({
      themePreference: appearanceTheme,
      compactDensity: appearanceCompactDensity,
      persist: true,
    });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setToastVariant("error");
      setToastMessage(error.message || "Unable to log out right now.");
      setIsLoggingOut(false);
      return;
    }
    navigate("/login", { replace: true });
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      setPasswordSaveStatus("error");
      setToastVariant("error");
      setToastMessage("Current password is required.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordSaveStatus("error");
      setToastVariant("error");
      setToastMessage("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordSaveStatus("error");
      setToastVariant("error");
      setToastMessage("Passwords do not match.");
      return;
    }

    setPasswordSaveStatus("saving");
    const email = session?.user?.email;
    if (!email) {
      setPasswordSaveStatus("error");
      setToastVariant("error");
      setToastMessage(
        "Password change requires an email/password account session.",
      );
      return;
    }

    const { data: reauthData, error: reauthError } =
      await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
    if (reauthError || !reauthData.user) {
      setPasswordSaveStatus("error");
      setToastVariant("error");
      setToastMessage("Current password is incorrect.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordSaveStatus("error");
      setToastVariant("error");
      setToastMessage(error.message || "Unable to change password.");
      return;
    }

    setPasswordSaveStatus("idle");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setToastVariant("success");
    setToastMessage("Password updated.");
  };

  return (
    <div className="space-y-8">
      {toastMessage ? (
        <div className="fixed right-6 top-6 z-50 w-[260px]">
          <Alert
            className={
              toastVariant === "error"
                ? "border-danger/30"
                : "border-emerald-200"
            }
          >
            <AlertTitle>
              {toastVariant === "error" ? "Error" : "Success"}
            </AlertTitle>
            <AlertDescription>{toastMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <WorkspacePageHeader
        title="Settings"
        description="Manage workspace identity, account access, defaults, and personal workspace preferences."
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Workspace branding</CardTitle>
            <p className="text-sm text-muted-foreground">
              Set the workspace name shown to clients.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Workspace name
            </label>
            <Input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Workspace name"
            />
          </div>
          <Button
            size="sm"
            onClick={handleSaveWorkspaceName}
            disabled={brandingSaveStatus === "saving"}
          >
            {brandingSaveStatus === "saving"
              ? "Saving..."
              : "Save workspace name"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            {session?.user?.email ?? session?.user?.phone ?? "Unknown account"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Email</p>
            <p className="text-xs text-muted-foreground">
              {session?.user?.email ?? "No email available"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Current password
              </label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                New password
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Confirm password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter password"
              />
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleChangePassword}
            disabled={passwordSaveStatus === "saving"}
          >
            {passwordSaveStatus === "saving"
              ? "Updating..."
              : "Change password"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Subscription management will be available in a future update.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <p className="text-sm text-muted-foreground">
            {LIGHT_MODE_ENABLED
              ? "Select your default color theme and density preference."
              : "Dark mode is currently the only available theme while the shared theme system is being corrected."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Theme</p>
            <div className="inline-flex items-center rounded-2xl border border-border/70 bg-secondary/35 p-1">
              {AVAILABLE_THEME_PREFERENCES.map((theme) => (
                <Button
                  key={theme}
                  size="sm"
                  variant={appearanceTheme === theme ? "default" : "ghost"}
                  onClick={() => setAppearanceTheme(theme)}
                >
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <div className="surface-subtle flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Compact density</p>
              <p className="text-xs text-muted-foreground">
                Store reduced spacing preference.
              </p>
            </div>
            <Button
              size="sm"
              variant={appearanceCompactDensity ? "default" : "secondary"}
              onClick={() => setAppearanceCompactDensity((prev) => !prev)}
            >
              {appearanceCompactDensity ? "On" : "Off"}
            </Button>
          </div>

          <Button
            size="sm"
            onClick={handleSaveAppearance}
            disabled={appearanceSaving}
          >
            {appearanceSaving ? "Saving..." : "Save appearance"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Baseline templates</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage performance marker templates shown in the baseline wizard.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/pt/settings/baseline">Manage templates</Link>
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Check-in templates</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select the default template for new check-ins.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {workspaceLoading ||
          templatesQuery.isLoading ||
          workspaceQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-40" />
            </div>
          ) : workspaceError || workspaceQuery.error || templatesQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              Unable to load check-in templates.
            </div>
          ) : templatesQuery.data && templatesQuery.data.length === 0 ? (
            <EmptyState
              title="No check-in templates yet"
              description="Create a template to set a default."
            />
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Default template
                </label>
                <p className="text-xs text-muted-foreground">
                  Used when a client has no direct override. If no default is
                  set, Repsync falls back to the latest active template.
                </p>
                <select
                  className="w-full"
                  value={defaultTemplateId}
                  onChange={(event) => setDefaultTemplateId(event.target.value)}
                >
                  <option value="">No default</option>
                  {availableDefaultTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name ?? "Template"}
                      {template.is_active === false ? " (Inactive)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                onClick={handleSaveDefaultTemplate}
                disabled={saveStatus === "saving"}
              >
                {saveStatus === "saving" ? "Saving..." : "Save default"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Exercise library</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create and manage exercises used in workout templates.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/pt/settings/exercises">Manage exercises</Link>
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <p className="text-sm text-muted-foreground">
            Log out of this workspace.
          </p>
        </CardHeader>
        <CardContent>
          <Button
            variant="secondary"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Logging out..." : "Logout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
