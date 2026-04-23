import { useEffect, useState } from "react";

export const PT_HUB_DATE_FORMAT_STORAGE_KEY = "coachos-pt-hub-date-format";
export const PT_HUB_WEEK_START_STORAGE_KEY = "coachos-pt-hub-week-start-day";
export const PT_HUB_UNITS_STORAGE_KEY = "coachos-pt-hub-units";
export const PT_HUB_LANGUAGE_STORAGE_KEY = "coachos-pt-hub-language";
export const PT_HUB_REGION_STORAGE_KEY = "coachos-pt-hub-region";

const PT_HUB_PREFERENCES_EVENT = "coachos:pt-hub-preferences-changed";

export const DATE_FORMAT_OPTIONS = [
  { value: "dd-mm-yyyy", label: "DD/MM/YYYY" },
  { value: "mm-dd-yyyy", label: "MM/DD/YYYY" },
  { value: "yyyy-mm-dd", label: "YYYY-MM-DD" },
] as const;

export const WEEK_START_OPTIONS = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "saturday", label: "Saturday" },
] as const;

export const UNIT_PREFERENCE_OPTIONS = [
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial" },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
] as const;

export const REGION_OPTIONS = [
  { value: "us", label: "United States" },
  { value: "gb", label: "United Kingdom" },
  { value: "sa", label: "Saudi Arabia" },
  { value: "qa", label: "Qatar" },
  { value: "eg", label: "Egypt" },
] as const;

export type PtHubDateFormat = (typeof DATE_FORMAT_OPTIONS)[number]["value"];
export type PtHubWeekStartDay = (typeof WEEK_START_OPTIONS)[number]["value"];
export type PtHubUnitPreference =
  (typeof UNIT_PREFERENCE_OPTIONS)[number]["value"];
export type PtHubLanguage = (typeof LANGUAGE_OPTIONS)[number]["value"];
export type PtHubRegion = (typeof REGION_OPTIONS)[number]["value"];

export type PtHubRegionalPreferences = {
  dateFormat: PtHubDateFormat;
  language: PtHubLanguage;
  region: PtHubRegion;
  unitPreference: PtHubUnitPreference;
  weekStartDay: PtHubWeekStartDay;
};

export function readStoredPreference<TValue extends string>(
  key: string,
  options: ReadonlyArray<{ value: TValue }>,
  fallback: TValue,
) {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  return options.some((option) => option.value === stored)
    ? (stored as TValue)
    : fallback;
}

export function readPtHubRegionalPreferences(): PtHubRegionalPreferences {
  return {
    dateFormat: readStoredPreference(
      PT_HUB_DATE_FORMAT_STORAGE_KEY,
      DATE_FORMAT_OPTIONS,
      DATE_FORMAT_OPTIONS[0].value,
    ),
    language: readStoredPreference(
      PT_HUB_LANGUAGE_STORAGE_KEY,
      LANGUAGE_OPTIONS,
      LANGUAGE_OPTIONS[0].value,
    ),
    region: readStoredPreference(
      PT_HUB_REGION_STORAGE_KEY,
      REGION_OPTIONS,
      REGION_OPTIONS[0].value,
    ),
    unitPreference: readStoredPreference(
      PT_HUB_UNITS_STORAGE_KEY,
      UNIT_PREFERENCE_OPTIONS,
      UNIT_PREFERENCE_OPTIONS[0].value,
    ),
    weekStartDay: readStoredPreference(
      PT_HUB_WEEK_START_STORAGE_KEY,
      WEEK_START_OPTIONS,
      WEEK_START_OPTIONS[1].value,
    ),
  };
}

export function writePtHubRegionalPreferences(
  preferences: Partial<PtHubRegionalPreferences>,
) {
  if (typeof window === "undefined") return;

  if (preferences.dateFormat) {
    window.localStorage.setItem(
      PT_HUB_DATE_FORMAT_STORAGE_KEY,
      preferences.dateFormat,
    );
  }
  if (preferences.language) {
    window.localStorage.setItem(
      PT_HUB_LANGUAGE_STORAGE_KEY,
      preferences.language,
    );
    window.document.documentElement.lang = preferences.language;
  }
  if (preferences.region) {
    window.localStorage.setItem(PT_HUB_REGION_STORAGE_KEY, preferences.region);
  }
  if (preferences.unitPreference) {
    window.localStorage.setItem(
      PT_HUB_UNITS_STORAGE_KEY,
      preferences.unitPreference,
    );
  }
  if (preferences.weekStartDay) {
    window.localStorage.setItem(
      PT_HUB_WEEK_START_STORAGE_KEY,
      preferences.weekStartDay,
    );
  }

  window.dispatchEvent(new Event(PT_HUB_PREFERENCES_EVENT));
}

export function usePtHubRegionalPreferences() {
  const [preferences, setPreferences] = useState<PtHubRegionalPreferences>(() =>
    readPtHubRegionalPreferences(),
  );

  useEffect(() => {
    const syncPreferences = () =>
      setPreferences(readPtHubRegionalPreferences());

    syncPreferences();
    window.addEventListener("storage", syncPreferences);
    window.addEventListener(PT_HUB_PREFERENCES_EVENT, syncPreferences);
    return () => {
      window.removeEventListener("storage", syncPreferences);
      window.removeEventListener(PT_HUB_PREFERENCES_EVENT, syncPreferences);
    };
  }, []);

  return preferences;
}

export function getPreferenceLabel<TValue extends string>(
  options: ReadonlyArray<{ value: TValue; label: string }>,
  value: TValue,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}
