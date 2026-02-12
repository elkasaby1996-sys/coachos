import { useTheme } from "../components/common/theme-provider";

export function useThemePreference() {
  const {
    themePreference,
    resolvedTheme,
    compactDensity,
    isSaving,
    saveError,
    setThemePreference,
    setCompactDensity,
    updateAppearance,
    cycleThemePreference,
  } = useTheme();

  return {
    themePreference,
    resolvedTheme,
    compactDensity,
    isSaving,
    saveError,
    setThemePreference,
    setCompactDensity,
    updateAppearance,
    cycleThemePreference,
  };
}
