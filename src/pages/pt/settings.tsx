import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { EmptyState, Skeleton } from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import { safeSelect } from "../../lib/supabase-safe";
import { useThemePreference } from "../../lib/use-theme-preference";
import { useWorkspace } from "../../lib/use-workspace";

export function PtSettingsPage() {
  const navigate = useNavigate();
  const { workspaceId, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const queryClient = useQueryClient();
  const [defaultTemplateId, setDefaultTemplateId] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");
  const {
    themePreference,
    compactDensity,
    updateAppearance,
    isSaving: appearanceSaving,
    saveError: appearanceSaveError,
  } = useThemePreference();
  const [appearanceTheme, setAppearanceTheme] = useState(themePreference);
  const [appearanceCompactDensity, setAppearanceCompactDensity] = useState(compactDensity);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
        .select("id, default_checkin_template_id")
        .eq("id", workspaceId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; default_checkin_template_id: string | null } | null;
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
  }, [workspaceQuery.data]);

  useEffect(() => {
    setAppearanceTheme(themePreference);
  }, [themePreference]);

  useEffect(() => {
    setAppearanceCompactDensity(compactDensity);
  }, [compactDensity]);

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
    await queryClient.invalidateQueries({ queryKey: ["pt-settings-workspace", workspaceId] });
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

  return (
    <div className="space-y-8">
      {toastMessage ? (
        <div className="fixed right-6 top-6 z-50 w-[260px]">
          <Alert className={toastVariant === "error" ? "border-danger/30" : "border-emerald-200"}>
            <AlertTitle>{toastVariant === "error" ? "Error" : "Success"}</AlertTitle>
            <AlertDescription>{toastMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage workspace branding and account access.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Workspace branding</CardTitle>
            <p className="text-sm text-muted-foreground">
              Customize the workspace name and logo shown to clients.
            </p>
          </div>
          <Button variant="secondary" size="sm">
            Upload logo
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input defaultValue="Velocity PT Lab" />
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
            Logo placeholder
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <p className="text-sm text-muted-foreground">Signed in as coach@velocitylab.com</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Email</p>
            <p className="text-xs text-muted-foreground">coach@velocitylab.com</p>
          </div>
          <Button variant="secondary" size="sm">
            Change password
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
            Select your default color theme and density preference.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Theme</p>
            <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1">
              <Button
                size="sm"
                variant={appearanceTheme === "system" ? "default" : "ghost"}
                onClick={() => setAppearanceTheme("system")}
              >
                System
              </Button>
              <Button
                size="sm"
                variant={appearanceTheme === "dark" ? "default" : "ghost"}
                onClick={() => setAppearanceTheme("dark")}
              >
                Dark
              </Button>
              <Button
                size="sm"
                variant={appearanceTheme === "light" ? "default" : "ghost"}
                onClick={() => setAppearanceTheme("light")}
              >
                Light
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Compact density</p>
              <p className="text-xs text-muted-foreground">Store reduced spacing preference.</p>
            </div>
            <Button
              size="sm"
              variant={appearanceCompactDensity ? "default" : "secondary"}
              onClick={() => setAppearanceCompactDensity((prev) => !prev)}
            >
              {appearanceCompactDensity ? "On" : "Off"}
            </Button>
          </div>

          {appearanceSaveError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {appearanceSaveError}
            </div>
          ) : null}

          <Button size="sm" onClick={handleSaveAppearance} disabled={appearanceSaving}>
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
          {workspaceLoading || templatesQuery.isLoading || workspaceQuery.isLoading ? (
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
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={defaultTemplateId}
                  onChange={(event) => setDefaultTemplateId(event.target.value)}
                >
                  <option value="">No default</option>
                  {templatesQuery.data?.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name ?? "Template"}
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
          <p className="text-sm text-muted-foreground">Log out of this workspace.</p>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut ? "Logging out..." : "Logout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
