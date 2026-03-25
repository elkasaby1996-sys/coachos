import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSettingsPanel } from "../../features/pt-hub/components/pt-hub-settings-panel";
import {
  savePtHubSettings,
  usePtHubSettings,
} from "../../features/pt-hub/lib/pt-hub";
import { useAuth } from "../../lib/auth";

export function PtHubSettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const settingsQuery = usePtHubSettings();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!user?.id || !settingsQuery.data) {
    return (
      <section className="space-y-6">
        <PtHubPageHeader
          eyebrow="PT Hub Settings"
          title="Account settings"
          description="Loading trainer business settings..."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow="PT Hub Settings"
        title="Account and business preferences"
        description="Trainer-level settings belong here, separate from workspace-specific configuration inside the coaching dashboard."
      />

      {message ? (
        <div className="rounded-[24px] border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>
      ) : null}

      <PtHubSettingsPanel
        email={user.email ?? "No email"}
        userId={user.id}
        initialSettings={settingsQuery.data}
        saving={saving}
        onSave={async (settings) => {
          setSaving(true);
          setMessage(null);
          try {
            await savePtHubSettings({ userId: user.id, settings });
            await queryClient.invalidateQueries({
              queryKey: ["pt-hub-settings"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["pt-hub-publication-state"],
            });
            setMessage("PT Hub settings saved.");
            window.setTimeout(() => setMessage(null), 2200);
          } finally {
            setSaving(false);
          }
        }}
      />
    </section>
  );
}
