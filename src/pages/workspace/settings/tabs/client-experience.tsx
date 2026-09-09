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
import { Input } from "../../../../components/ui/input";
import { NotificationToast } from "../../../../components/common/notification-toast";
import { WorkspaceWelcome } from "../../../../features/workspace-branding/components";
import { getInviteSenderName } from "../../../../features/workspace-branding/branding";

const WELCOME_MESSAGE_LIMIT = 2000;

type ClientExperienceFormState = {
  welcomeMessage: string;
  welcomeTitle: string;
  inviteSenderName: string;
};

const emptyState: ClientExperienceFormState = {
  welcomeMessage: "",
  welcomeTitle: "",
  inviteSenderName: "",
};

export function WorkspaceSettingsClientExperienceTab() {
  const queryClient = useQueryClient();
  const { workspace, workspaceId, canManage } =
    useWorkspaceSettingsOutletContext();
  const [form, setForm] = useState<ClientExperienceFormState>(emptyState);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const initialState = useMemo(
    () =>
      ({
        welcomeMessage: workspace?.client_welcome_message ?? "",
        welcomeTitle: workspace?.client_welcome_title ?? "",
        inviteSenderName: workspace?.invite_sender_name ?? "",
      }) satisfies ClientExperienceFormState,
    [
      workspace?.client_welcome_message,
      workspace?.client_welcome_title,
      workspace?.invite_sender_name,
    ],
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
    if (
      form.welcomeTitle.length > 120 ||
      form.inviteSenderName.length > 120 ||
      /[\r\n<>]/.test(form.inviteSenderName)
    ) {
      setErrorText(
        "Use up to 120 characters for the title and sender name. Sender names cannot contain line breaks or angle brackets.",
      );
      return false;
    }

    setSaving(true);
    setErrorText(null);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          client_welcome_message: form.welcomeMessage.trim(),
          client_welcome_title: form.welcomeTitle.trim(),
          invite_sender_name: form.inviteSenderName.trim(),
        })
        .eq("id", workspaceId)
        .select("id")
        .single();
      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: ["workspace-settings-shell", workspaceId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["workspace-branding", workspaceId],
      });
      setForm((current) => ({
        welcomeMessage: current.welcomeMessage.trim(),
        welcomeTitle: current.welcomeTitle.trim(),
        inviteSenderName: current.inviteSenderName.trim(),
      }));
      setMessage("Welcome banner and invite identity saved.");
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
      <NotificationToast message={message} onDismiss={() => setMessage(null)} />

      {errorText ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorText}
        </div>
      ) : null}

      <SettingsSectionCard
        title="Client welcome banner"
        description="A personal welcome on your invite page, client home, and onboarding screens. Leave both fields empty to hide it."
      >
        <SettingsFieldRow
          label="Welcome title"
          hint="Optional. Leave empty to use your workspace name."
        >
          <Input
            aria-label="Welcome title"
            value={form.welcomeTitle}
            maxLength={120}
            disabled={!canManage || saving}
            placeholder={`Welcome to ${workspace?.name || "your workspace"}`}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, welcomeTitle: event.target.value }))
            }
          />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="New client instructions"
          hint="Shown to new clients as the workspace welcome message."
        >
          <div className="relative">
            <Textarea
              aria-label="New client instructions"
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

      {workspace && (form.welcomeTitle.trim() || form.welcomeMessage.trim()) ? (
        <SettingsSectionCard title="Welcome preview">
          <WorkspaceWelcome
            branding={{
              ...workspace,
              client_welcome_title: form.welcomeTitle,
              client_welcome_message: form.welcomeMessage,
            }}
          />
        </SettingsSectionCard>
      ) : null}

      <SettingsSectionCard
        title="Invite sender identity"
        description="Use a recognisable name when inviting clients and team members."
      >
        <SettingsFieldRow
          label="Sender display name"
          hint="Leave empty to use the workspace name."
        >
          <Input
            aria-label="Invite sender display name"
            value={form.inviteSenderName}
            maxLength={120}
            disabled={!canManage || saving}
            placeholder={workspace?.name || "Your workspace"}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                inviteSenderName: event.target.value,
              }))
            }
          />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Sending address"
          hint="Invitations use RepSync’s configured no-reply email address. Replies are not monitored."
        >
          <p className="text-sm font-medium">RepSync no-reply</p>
        </SettingsFieldRow>
        <SettingsFieldRow label="Invite preview">
          <div className="space-y-2 rounded-xl border border-border bg-background p-4 text-sm">
            <p>
              <span className="text-muted-foreground">From: </span>
              {getInviteSenderName({
                name: workspace?.name ?? null,
                invite_sender_name: form.inviteSenderName,
              })}{" "}
              <span className="text-muted-foreground">
                via RepSync no-reply
              </span>
            </p>
            <p className="font-medium">
              You’re invited to join{" "}
              {workspace?.name || "your coaching workspace"}
            </p>
            <p className="text-muted-foreground">
              Your personal invitation includes your workspace logo and welcome
              message.
            </p>
          </div>
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
