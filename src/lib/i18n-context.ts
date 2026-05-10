import { createContext, useContext } from "react";
import type {
  PtHubLanguage,
  PtHubRegion,
} from "../features/pt-hub/lib/pt-hub-preferences";

export type I18nContextValue = {
  dir: "ltr" | "rtl";
  language: PtHubLanguage;
  locale: string;
  region: PtHubRegion;
  setLanguage: (language: PtHubLanguage) => void;
  setRegion: (region: PtHubRegion) => void;
  t: (key: string, fallback?: string) => string;
};

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
