import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { safeSelect } from "../../lib/supabase-safe";
import { supabase } from "../../lib/supabase";
import {
  applyTheme,
  getStoredThemePreference,
  nextThemePreference,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "../../lib/theme";

interface ThemeContextValue {
  theme: ResolvedTheme;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  compactDensity: boolean;
  isSaving: boolean;
  saveError: string | null;
  setTheme: (theme: ResolvedTheme) => Promise<void>;
  toggleTheme: () => Promise<void>;
  setThemePreference: (themePreference: ThemePreference, options?: { persist?: boolean }) => Promise<void>;
  setCompactDensity: (compactDensity: boolean, options?: { persist?: boolean }) => Promise<void>;
  updateAppearance: (payload: {
    themePreference?: ThemePreference;
    compactDensity?: boolean;
    persist?: boolean;
  }) => Promise<void>;
  cycleThemePreference: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const DENSITY_STORAGE_KEY = "coachos-compact-density";

const toThemePreference = (value: unknown): ThemePreference | null => {
  if (value === "system" || value === "dark" || value === "light") return value;
  return null;
};

function getStoredPreference(): ThemePreference {
  const stored = getStoredThemePreference("dark");
  return toThemePreference(stored) ?? "dark";
}

function getStoredCompactDensity(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DENSITY_STORAGE_KEY) === "1";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => getStoredPreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => applyTheme(getStoredPreference()));
  const [compactDensity, setCompactDensityState] = useState<boolean>(() => getStoredCompactDensity());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle("density-compact", compactDensity);
    window.localStorage.setItem(DENSITY_STORAGE_KEY, compactDensity ? "1" : "0");
  }, [compactDensity]);

  useEffect(() => {
    const nextResolved = applyTheme(themePreference);
    setResolvedTheme(nextResolved);
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (themePreference !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      setResolvedTheme(applyTheme("system"));
    };
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onSystemThemeChange);
    } else {
      mediaQuery.addListener(onSystemThemeChange);
    }
    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", onSystemThemeChange);
      } else {
        mediaQuery.removeListener(onSystemThemeChange);
      }
    };
  }, [themePreference]);

  const fetchAppearancePreference = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;

    const { data, error } = await safeSelect<{
      user_id: string;
      role: string | null;
      theme_preference?: string | null;
      compact_density?: boolean | null;
    }>({
      table: "workspace_members",
      columns: "user_id, role, theme_preference, compact_density",
      fallbackColumns: "user_id, role",
      filter: (query) =>
        query
          .eq("user_id", user.id)
          .like("role", "pt_%")
          .order("role", { ascending: true })
          .limit(1),
    });

    if (error) return;
    const row = data?.[0];
    if (!row) return;

    const dbThemePreference = toThemePreference(row.theme_preference) ?? "dark";
    setThemePreferenceState(dbThemePreference);
    if (typeof row.compact_density === "boolean") {
      setCompactDensityState(row.compact_density);
    }
  }, []);

  useEffect(() => {
    fetchAppearancePreference();
    const { data } = supabase.auth.onAuthStateChange(() => {
      fetchAppearancePreference();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [fetchAppearancePreference]);

  const persistAppearance = useCallback(async (nextTheme: ThemePreference, nextCompact: boolean) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase.rpc("set_my_appearance_preferences", {
        p_theme_preference: nextTheme,
        p_compact_density: nextCompact,
      });
      if (error) {
        setSaveError(error.message ?? "Failed to save appearance preference.");
      }
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateAppearance = useCallback(
    async (payload: {
      themePreference?: ThemePreference;
      compactDensity?: boolean;
      persist?: boolean;
    }) => {
      const nextTheme = payload.themePreference ?? themePreference;
      const nextCompact = typeof payload.compactDensity === "boolean" ? payload.compactDensity : compactDensity;
      const persist = payload.persist ?? true;

      setThemePreferenceState(nextTheme);
      setCompactDensityState(nextCompact);

      if (persist) {
        await persistAppearance(nextTheme, nextCompact);
      }
    },
    [compactDensity, persistAppearance, themePreference]
  );

  const setThemePreference = useCallback(
    async (nextThemePreference: ThemePreference, options?: { persist?: boolean }) => {
      await updateAppearance({ themePreference: nextThemePreference, persist: options?.persist });
    },
    [updateAppearance]
  );

  const setCompactDensity = useCallback(
    async (nextCompactDensity: boolean, options?: { persist?: boolean }) => {
      await updateAppearance({ compactDensity: nextCompactDensity, persist: options?.persist });
    },
    [updateAppearance]
  );

  const cycleThemePreference = useCallback(async () => {
    await setThemePreference(nextThemePreference(themePreference));
  }, [setThemePreference, themePreference]);

  const setTheme = useCallback(
    async (nextTheme: ResolvedTheme) => {
      await setThemePreference(nextTheme);
    },
    [setThemePreference]
  );

  const toggleTheme = useCallback(async () => {
    await setThemePreference(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setThemePreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolvedTheme,
      themePreference,
      resolvedTheme,
      compactDensity,
      isSaving,
      saveError,
      setTheme,
      toggleTheme,
      setThemePreference,
      setCompactDensity,
      updateAppearance,
      cycleThemePreference,
    }),
    [
      compactDensity,
      cycleThemePreference,
      isSaving,
      resolvedTheme,
      saveError,
      setCompactDensity,
      setTheme,
      setThemePreference,
      toggleTheme,
      themePreference,
      updateAppearance,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
