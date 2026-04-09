import { Outlet } from "react-router-dom";
import {
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
    <SettingsPageShell tabs={<SettingsTabs tabs={tabs} />}>
      <Outlet />
    </SettingsPageShell>
  );
}
