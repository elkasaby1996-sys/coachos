import { Outlet } from "react-router-dom";
import {
  SettingsHeader,
  SettingsPageShell,
  SettingsTabs,
  type SettingsTabLink,
} from "../../../features/settings/components/settings-primitives";
import { ptHubSettingsTabs } from "../../../features/settings/lib/settings-route-mapping";

export function PtHubSettingsLayoutPage() {
  const tabs: SettingsTabLink[] = ptHubSettingsTabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    description: tab.description,
    to: `/pt-hub/settings/${tab.path}`,
  }));

  return (
    <SettingsPageShell
      header={
        <SettingsHeader
          scope="PT Hub"
          title="PT Hub Settings"
          description="Manage your account, business profile, and global PT Hub behavior."
        />
      }
      tabs={<SettingsTabs tabs={tabs} />}
    >
      <Outlet />
    </SettingsPageShell>
  );
}
