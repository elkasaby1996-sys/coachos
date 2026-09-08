import { WorkspacePageHeader } from "../../../components/pt/workspace-page-header";
import { Outlet } from "react-router-dom";
import {
  SettingsPageShell,
  SettingsTabs,
  type SettingsTabLink,
} from "../../../features/settings/components/settings-primitives";
import { ptHubSettingsTabs } from "../../../features/settings/lib/settings-route-mapping";
import { useI18n } from "../../../lib/i18n-context";
import { routes, type PtHubSettingsTab } from "../../../lib/routes";

export function PtHubSettingsLayoutPage() {
  const { t } = useI18n();
  const tabs: SettingsTabLink[] = ptHubSettingsTabs.map((tab) => ({
    id: tab.id,
    label: t(`settings.tabs.${tab.id}.label`, tab.label),
    description: t(`settings.tabs.${tab.id}.description`, tab.description),
    to: routes.ptHubSettings(tab.path as PtHubSettingsTab),
  }));

  return (
    <SettingsPageShell
      header={
        <WorkspacePageHeader
          title="Account settings"
          description="Manage your account, preferences, and billing."
        />
      }
      tabs={<SettingsTabs tabs={tabs} />}
    >
      <Outlet />
    </SettingsPageShell>
  );
}
