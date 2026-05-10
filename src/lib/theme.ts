export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";
export const THEME_STORAGE_KEY = "coachos-theme-preference";
const LIGHT_DEFAULT_MIGRATION_KEY = "coachos-theme-light-default-migrated";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";
export const LIGHT_MODE_ENABLED = true;
export const AVAILABLE_THEME_PREFERENCES = LIGHT_MODE_ENABLED
  ? (["system", "dark", "light"] as const)
  : (["dark"] as const);

export function normalizeThemePreference(
  preference: ThemePreference,
): ThemePreference {
  if (!LIGHT_MODE_ENABLED) return "dark";
  return preference;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  const normalizedPreference = normalizeThemePreference(preference);
  if (normalizedPreference === "dark") return "dark";
  if (normalizedPreference === "light") return "light";
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  if (typeof document === "undefined") {
    return resolveTheme(preference);
  }

  const normalizedPreference = normalizeThemePreference(preference);
  const resolved = resolveTheme(normalizedPreference);
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(resolved);
  root.setAttribute("data-theme-preference", normalizedPreference);
  root.style.colorScheme = resolved;
  return resolved;
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  if (!LIGHT_MODE_ENABLED) return "dark";
  if (current === "system") return "dark";
  if (current === "dark") return "light";
  return "system";
}

export function getStoredThemePreference(
  defaultPreference: ThemePreference = DEFAULT_THEME_PREFERENCE,
): ThemePreference {
  const normalizedDefault = normalizeThemePreference(defaultPreference);
  if (typeof window === "undefined") return normalizedDefault;
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  const hasMigratedLightDefault =
    window.localStorage.getItem(LIGHT_DEFAULT_MIGRATION_KEY) === "1";
  if (raw === "dark" && !hasMigratedLightDefault) {
    window.localStorage.setItem(LIGHT_DEFAULT_MIGRATION_KEY, "1");
    window.localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME_PREFERENCE);
    return DEFAULT_THEME_PREFERENCE;
  }
  if (raw === "system" || raw === "dark" || raw === "light") {
    window.localStorage.setItem(LIGHT_DEFAULT_MIGRATION_KEY, "1");
    return normalizeThemePreference(raw);
  }
  window.localStorage.setItem(LIGHT_DEFAULT_MIGRATION_KEY, "1");
  return normalizedDefault;
}

export function initializeThemePreference(
  defaultPreference: ThemePreference = DEFAULT_THEME_PREFERENCE,
): ThemePreference {
  const preference = getStoredThemePreference(defaultPreference);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }
  applyTheme(preference);
  return preference;
}
