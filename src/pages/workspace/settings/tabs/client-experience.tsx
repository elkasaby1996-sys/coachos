import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "../../../../components/ui/textarea";
import {
  SettingsFieldRow,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";
import { supabase } from "../../../../lib/supabase";
import { useWorkspaceSettingsOutletContext } from "../outlet-context";

const WELCOME_MESSAGE_LIMIT = 2000;

type ClientExperienceFormState = {
  welcomeMessage: string;
};

const emptyState: ClientExperienceFormState = {
  welcomeMessage: "",
};

export function WorkspaceSettingsClientExperienceTab() {
  const queryClient = useQueryClient();
  const { workspace, workspaceId, canManage } =
    useWorkspaceSettingsOutletContext();
  const [form, setForm] = useState<ClientExperienceFormState>(emptyState);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const initialState = useMemo(
    () =>
      ({
        welcomeMessage: workspace?.client_welcome_message ?? "",
      }) satisfies ClientExperienceFormState,
    [workspace?.client_welcome_message],
  );

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const count = form.welcomeMessage.length;
  const welcomeMessageError =
    count > WELCOME_MESSAGE_LIMIT
      ? `Welcome message must be ${WELCOME_MESSAGE_LIMIT} characters or fewer.`
      : null;
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialState);

  const saveClientExperience = async () => {
    if (!canManage || !workspaceId || welcomeMessageError) return false;

    setSaving(true);
    setErrorText(null);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          client_welcome_message: form.welcomeMessage.trim(),
        })
        .eq("id", workspaceId);
      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: ["workspace-settings-shell", workspaceId],
      });
      return true;
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : "Unable to save client welcome message.",
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
    onSave: saveClientExperience,
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
        title="Welcome Message"
        description="Instructions shown to new clients when they join this workspace."
      >
        <SettingsFieldRow
          label="New client instructions"
          hint="Shown to new clients as the workspace welcome message."
        >
          <div className="relative">
            <Textarea
              value={form.welcomeMessage}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  welcomeMessage: event.target.value,
                }))
              }
              disabled={!canManage}
              isInvalid={Boolean(welcomeMessageError)}
              maxLength={WELCOME_MESSAGE_LIMIT + 1}
              rows={8}
              className="pb-9"
              placeholder="Welcome to your coaching workspace. Start by reviewing your plan, completing your first check-in, and sending any questions here."
            />
            <span
              className={[
                "pointer-events-none absolute bottom-2 right-3 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                welcomeMessageError
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-border/80 bg-background/85 text-muted-foreground",
              ].join(" ")}
              title={`Max ${WELCOME_MESSAGE_LIMIT} chars`}
              aria-label={`Character count ${count} out of ${WELCOME_MESSAGE_LIMIT}`}
            >
              {count}/{WELCOME_MESSAGE_LIMIT}
            </span>
          </div>
          {welcomeMessageError ? (
            <p role="alert" className="text-xs text-danger">
              {welcomeMessageError}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Keep this practical: what the client should do first, what they can
            expect from you, and where to ask questions.
          </p>
          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              You do not have permission to edit client experience settings.
            </p>
          ) : null}
        </SettingsFieldRow>
      </SettingsSectionCard>

      <StickySaveBar
        isDirty={isDirty && !welcomeMessageError}
        isSaving={saving}
        onSave={saveClientExperience}
        onDiscard={discard}
      />
    </div>
  );
}
