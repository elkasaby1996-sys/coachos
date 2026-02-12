export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  if (typeof document === "undefined") {
    return preference === "system" ? "dark" : preference;
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
