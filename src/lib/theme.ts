export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";
export const THEME_STORAGE_KEY = "coachos-theme-preference";
export const LIGHT_MODE_ENABLED = false;
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
  if (typeof window === "undefined") return "dark";
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
  defaultPreference: ThemePreference = "dark",
): ThemePreference {
  const normalizedDefault = normalizeThemePreference(defaultPreference);
  if (typeof window === "undefined") return normalizedDefault;
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === "system" || raw === "dark" || raw === "light") {
    return normalizeThemePreference(raw);
  }
  return normalizedDefault;
}

export function initializeThemePreference(
  defaultPreference: ThemePreference = "dark",
): ThemePreference {
  const preference = getStoredThemePreference(defaultPreference);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }
  applyTheme(preference);
  return preference;
}
