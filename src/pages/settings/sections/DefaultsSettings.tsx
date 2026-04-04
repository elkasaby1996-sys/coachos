import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { useWorkspace } from "../../../lib/use-workspace";
import { supabase } from "../../../lib/supabase";
import { safeSelect } from "../../../lib/supabase-safe";
import {
  SettingsActions,
  SettingsBlock,
  SettingsInlineSeparator,
  SettingsPageShell,
  SettingsRow,
  SettingsToast,
} from "./shared";

export function DefaultsSettings() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [defaultTemplateId, setDefaultTemplateId] = useState("");
  const [savingDefault, setSavingDefault] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );

  const workspaceQuery = useQuery({
    queryKey: ["settings-defaults-workspace", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, default_checkin_template_id")
        .eq("id", workspaceId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        id: string;
        default_checkin_template_id: string | null;
      } | null;
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["settings-defaults-checkin-templates", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await safeSelect<{
        id: string;
        name: string | null;
        workspace_id: string;
        created_at?: string | null;
      }>({
        table: "checkin_templates",
        columns: "id, workspace_id, name, created_at",
        fallbackColumns: "id, workspace_id, name",
        filter: (query) =>
          query
            .eq("workspace_id", workspaceId ?? "")
            .order("created_at", { ascending: false }),
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!workspaceQuery.data) return;
    setDefaultTemplateId(workspaceQuery.data.default_checkin_template_id ?? "");
  }, [workspaceQuery.data]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const hasDefaultChanged =
    defaultTemplateId !==
    (workspaceQuery.data?.default_checkin_template_id ?? "");

  const handleSaveDefaultTemplate = async () => {
    if (!workspaceId || !hasDefaultChanged) return;
    setSavingDefault(true);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ default_checkin_template_id: defaultTemplateId || null })
        .eq("id", workspaceId);
      if (error) throw error;

      setToastVariant("success");
      setToastMessage("Default check-in template saved.");
      await queryClient.invalidateQueries({
        queryKey: ["settings-defaults-workspace", workspaceId],
      });
    } catch (error) {
      setToastVariant("error");
      setToastMessage(
        error instanceof Error
          ? error.message
          : "Unable to save default template.",
      );
    } finally {
      setSavingDefault(false);
    }
  };

  return (
    <>
      <SettingsToast message={toastMessage} variant={toastVariant} />
      <SettingsPageShell
        title="Defaults & Templates"
        description="Centralize workspace defaults that shape baseline, check-in, and workout flows."
      >
        <SettingsBlock
          title="Template controls"
          description="Keep defaults and template management in one place."
          noBorder
        >
          <SettingsRow
            label="Baseline templates"
            hint="Configure baseline marker templates used in onboarding."
          >
            <SettingsActions>
              <Button asChild variant="secondary" size="sm">
                <Link to="/pt/settings/baseline">Manage templates</Link>
              </Button>
            </SettingsActions>
          </SettingsRow>

          <SettingsInlineSeparator />

          <SettingsRow
            label="Check-in templates"
            hint="Pick the default template used for weekly check-ins."
          >
            {workspaceQuery.isLoading || templatesQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <select
                  value={defaultTemplateId}
                  onChange={(event) => setDefaultTemplateId(event.target.value)}
                  className="h-10 w-full app-field px-3 text-sm"
                >
                  <option value="">No default template</option>
                  {templatesQuery.data?.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name ?? "Template"}
                    </option>
                  ))}
                </select>
                <SettingsActions>
                  <Button
                    type="button"
                    onClick={handleSaveDefaultTemplate}
                    disabled={!hasDefaultChanged || savingDefault}
                  >
                    {savingDefault ? "Saving..." : "Save default"}
                  </Button>
                </SettingsActions>
              </>
            )}
          </SettingsRow>

          <SettingsInlineSeparator />

          <SettingsRow
            label="Exercise library"
            hint="Maintain exercises available to program and workout templates."
          >
            <SettingsActions>
              <Button asChild variant="secondary" size="sm">
                <Link to="/pt/settings/exercises">Manage exercises</Link>
              </Button>
            </SettingsActions>
          </SettingsRow>
        </SettingsBlock>
      </SettingsPageShell>
    </>
  );
}
