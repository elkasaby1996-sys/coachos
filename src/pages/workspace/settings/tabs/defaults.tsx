import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../../components/ui/button";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";
import { safeSelect } from "../../../../lib/supabase-safe";
import { supabase } from "../../../../lib/supabase";
import { useWorkspaceSettingsOutletContext } from "../outlet-context";

type DefaultsFormState = {
  defaultCheckinTemplateId: string;
};

const emptyState: DefaultsFormState = {
  defaultCheckinTemplateId: "",
};

export function WorkspaceSettingsDefaultsTab() {
  const queryClient = useQueryClient();
  const { workspaceId, canManage } = useWorkspaceSettingsOutletContext();
  const [form, setForm] = useState<DefaultsFormState>(emptyState);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const workspaceQuery = useQuery({
    queryKey: ["workspace-settings-defaults-workspace", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, default_checkin_template_id")
        .eq("id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        id: string;
        default_checkin_template_id: string | null;
      } | null;
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["workspace-settings-defaults-checkin-templates", workspaceId],
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
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false }),
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const initialState = useMemo(
    () =>
      ({
        defaultCheckinTemplateId:
          workspaceQuery.data?.default_checkin_template_id ?? "",
      }) satisfies DefaultsFormState,
    [workspaceQuery.data?.default_checkin_template_id],
  );

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialState);

  const saveDefaults = async () => {
    if (!canManage) return false;

    setSaving(true);
    setErrorText(null);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          default_checkin_template_id: form.defaultCheckinTemplateId || null,
        })
        .eq("id", workspaceId);
      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: ["workspace-settings-defaults-workspace", workspaceId],
      });
      return true;
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : "Unable to save workspace defaults.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setForm(initialState);
    setErrorText(null);
  };

  const { guardDialog } = useDirtyNavigationGuard({
    isDirty,
    onDiscard: discard,
    onSave: saveDefaults,
  });

  return (
    <div className="space-y-4">
      {guardDialog}

      {errorText ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorText}
        </div>
      ) : null}

      <SettingsSectionCard
        title="Template Defaults"
        description="Workspace defaults for templates and operational behavior."
      >
        <SettingsFieldRow
          label="Default check-in template"
          hint="Source: workspaces.default_checkin_template_id"
        >
          {templatesQuery.isLoading || workspaceQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading templates...</p>
          ) : (
            <select
              className="h-10 w-full app-field px-3 text-sm"
              value={form.defaultCheckinTemplateId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  defaultCheckinTemplateId: event.target.value,
                }))
              }
              disabled={!canManage}
            >
              <option value="">No default template</option>
              {templatesQuery.data?.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name ?? "Template"}
                </option>
              ))}
            </select>
          )}
          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              You do not have permission to edit defaults.
            </p>
          ) : null}
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Default program template"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Workout / nutrition / habit defaults"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Template library behavior"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/pt/checkins/templates">Manage check-in templates</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/pt/settings/baseline">Manage performance markers</Link>
          </Button>
        </div>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Ownership boundary"
        body="Template and workflow defaults stay at workspace scope. Account and billing settings remain in PT Hub."
      />

      <StickySaveBar
        isDirty={isDirty}
        isSaving={saving}
        onSave={saveDefaults}
        onDiscard={discard}
      />
    </div>
  );
}
