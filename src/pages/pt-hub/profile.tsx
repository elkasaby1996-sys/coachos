import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubProfileEditor } from "../../features/pt-hub/components/pt-hub-profile-editor";
import {
  savePtHubProfile,
  savePtHubSettings,
  setPtHubProfilePublication,
  usePtHubProfile,
  usePtHubPublicationState,
  usePtHubProfileReadiness,
  usePtHubSettings,
} from "../../features/pt-hub/lib/pt-hub";
import { useSessionAuth } from "../../lib/auth";
import { useWorkspace } from "../../lib/use-workspace";

export function PtHubProfilePage() {
  const queryClient = useQueryClient();
  const { user } = useSessionAuth();
  const { workspaceId } = useWorkspace();
  const profileQuery = usePtHubProfile();
  const settingsQuery = usePtHubSettings();
  const readinessQuery = usePtHubProfileReadiness();
  const publicationQuery = usePtHubPublicationState();
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  if (
    !profileQuery.data ||
    !settingsQuery.data ||
    !readinessQuery.data ||
    !publicationQuery.data ||
    !user?.id
  ) {
    return (
      <section className="space-y-6">
        <PtHubPageHeader
          eyebrow="Coach Profile"
          title="Coach profile"
          description="Loading your PT Hub profile..."
        />
      </section>
    );
  }

  const profile = profileQuery.data;
  const settings = settingsQuery.data;

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow="Coach Profile"
        title="Edit your coach profile"
        description="Update the public trainer page clients will see."
        actions={
          <>
            {publicationQuery.data.publicUrl ? (
              <Button asChild variant="ghost">
                <a
                  href={publicationQuery.data.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open public page
                </a>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link to="/pt-hub/profile/preview">Open preview</Link>
            </Button>
          </>
        }
      />

      {message ? (
        <div
          className={
            messageTone === "success"
              ? "rounded-[24px] border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"
              : "rounded-[24px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          }
        >
          {message}
        </div>
      ) : null}

      <PtHubProfileEditor
        profile={profile}
        readiness={readinessQuery.data}
        publicationState={publicationQuery.data}
        profileVisibility={settings.profileVisibility}
        saving={saving}
        publishing={publishing}
        updatingVisibility={updatingVisibility}
        onProfileVisibilityChange={async (nextVisibility) => {
          if (nextVisibility === settings.profileVisibility) return;

          setUpdatingVisibility(true);
          setMessage(null);
          try {
            await savePtHubSettings({
              userId: user.id,
              settings: {
                ...settings,
                profileVisibility: nextVisibility,
              },
            });
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ["pt-hub-settings"],
              }),
              queryClient.invalidateQueries({
                queryKey: ["pt-hub-publication-state"],
              }),
              queryClient.invalidateQueries({
                queryKey: ["pt-hub-overview"],
              }),
            ]);
            setMessageTone("success");
            setMessage(
              `Profile visibility set to ${
                nextVisibility === "listed"
                  ? "Ready to list"
                  : nextVisibility === "private"
                    ? "Private"
                    : "Draft"
              }.`,
            );
            window.setTimeout(() => setMessage(null), 2200);
          } catch (error) {
            setMessageTone("error");
            setMessage(
              error instanceof Error
                ? error.message
                : "Unable to update profile visibility.",
            );
          } finally {
            setUpdatingVisibility(false);
          }
        }}
        onSave={async (draft) => {
          setSaving(true);
          setMessage(null);
          try {
            await savePtHubProfile({
              userId: user.id,
              workspaceId,
              profile: draft,
            });
            await queryClient.invalidateQueries({
              queryKey: ["pt-hub-profile"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["pt-hub-overview"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["pt-hub-publication-state"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["public-pt-profile"],
            });
            setMessageTone("success");
            setMessage("Coach profile saved.");
            window.setTimeout(() => setMessage(null), 2200);
          } catch (error) {
            setMessageTone("error");
            setMessage(
              error instanceof Error
                ? error.message
                : "Unable to save coach profile.",
            );
          } finally {
            setSaving(false);
          }
        }}
        onTogglePublish={async (nextPublished) => {
          setPublishing(true);
          setMessage(null);
          try {
            await setPtHubProfilePublication(nextPublished);
            await queryClient.invalidateQueries({
              queryKey: ["pt-hub-profile"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["pt-hub-publication-state"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["pt-hub-overview"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["public-pt-profile"],
            });
            setMessageTone("success");
            setMessage(
              nextPublished
                ? "Coach profile published."
                : "Coach profile unpublished.",
            );
            window.setTimeout(() => setMessage(null), 2600);
          } catch (error) {
            setMessageTone("error");
            setMessage(
              error instanceof Error
                ? error.message
                : "Unable to update publication state.",
            );
          } finally {
            setPublishing(false);
          }
        }}
      />
    </section>
  );
}
