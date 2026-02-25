import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { useThemePreference } from "../../../lib/use-theme-preference";
import {
  SettingsActions,
  SettingsBlock,
  SettingsPageShell,
  SettingsRow,
  SettingsToast,
} from "./shared";

export function AppearanceSettings() {
  const { themePreference, compactDensity, updateAppearance, isSaving } =
    useThemePreference();
  const [selectedTheme, setSelectedTheme] = useState(themePreference);
  const [selectedCompact, setSelectedCompact] = useState(compactDensity);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");

  useEffect(() => {
    setSelectedTheme(themePreference);
  }, [themePreference]);

  useEffect(() => {
    setSelectedCompact(compactDensity);
  }, [compactDensity]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const hasChanges = useMemo(
    () => selectedTheme !== themePreference || selectedCompact !== compactDensity,
    [selectedTheme, themePreference, selectedCompact, compactDensity],
  );

  const applyThemeOptimistically = async (nextTheme: typeof selectedTheme) => {
    setSelectedTheme(nextTheme);
    await updateAppearance({
      themePreference: nextTheme,
      compactDensity: selectedCompact,
      persist: false,
    });
  };

  const applyDensityOptimistically = async (checked: boolean) => {
    setSelectedCompact(checked);
    await updateAppearance({
      themePreference: selectedTheme,
      compactDensity: checked,
      persist: false,
    });
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    try {
      await updateAppearance({
        themePreference: selectedTheme,
        compactDensity: selectedCompact,
        persist: true,
      });
      setToastVariant("success");
      setToastMessage("Appearance saved.");
    } catch {
      setToastVariant("error");
      setToastMessage("Unable to save appearance preferences.");
    }
  };

  return (
    <>
      <SettingsToast message={toastMessage} variant={toastVariant} />
      <SettingsPageShell
        title="Appearance"
        description="Set your visual preferences for PT workspace views."
      >
        <SettingsBlock
          title="Interface preferences"
          description="Theme applies immediately. Save to persist in your account profile."
          noBorder
        >
          <SettingsRow label="Theme" hint="Default mode is dark unless explicitly changed.">
            <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-1">
              {(["system", "dark", "light"] as const).map((theme) => (
                <Button
                  key={theme}
                  type="button"
                  size="sm"
                  variant={selectedTheme === theme ? "default" : "ghost"}
                  onClick={() => void applyThemeOptimistically(theme)}
                  data-testid={`theme-toggle-${theme}`}
                >
                  {theme[0].toUpperCase() + theme.slice(1)}
                </Button>
              ))}
            </div>
          </SettingsRow>

          <SettingsRow label="Density" hint="Compact mode reduces spacing in tables and cards.">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Compact mode</p>
                <p className="text-xs text-muted-foreground">Useful for data-dense coaching workflows.</p>
              </div>
              <Switch
                checked={selectedCompact}
                onCheckedChange={(checked) => void applyDensityOptimistically(checked)}
              />
            </div>
          </SettingsRow>

          <SettingsActions>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              data-testid="save-appearance-button"
            >
              {isSaving ? "Saving..." : "Save preferences"}
            </Button>
          </SettingsActions>
        </SettingsBlock>
      </SettingsPageShell>
    </>
  );
}
