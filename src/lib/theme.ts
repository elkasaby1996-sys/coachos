export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";
export const THEME_STORAGE_KEY = "coachos-theme-preference";

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  if (typeof document === "undefined") {
    return resolveTheme(preference);
  }

  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(resolved);
  root.setAttribute("data-theme-preference", preference);
  root.style.colorScheme = resolved;
  return resolved;
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  if (current === "system") return "dark";
  if (current === "dark") return "light";
  return "system";
}

export function getStoredThemePreference(defaultPreference: ThemePreference = "dark"): ThemePreference {
  if (typeof window === "undefined") return defaultPreference;
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === "system" || raw === "dark" || raw === "light") return raw;
  return defaultPreference;
}

export function initializeThemePreference(defaultPreference: ThemePreference = "dark"): ThemePreference {
  const preference = getStoredThemePreference(defaultPreference);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }
  applyTheme(preference);
  return preference;
}
