import { Check, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import {
  LANGUAGE_OPTIONS,
  REGION_OPTIONS,
  type PtHubLanguage,
  type PtHubRegion,
} from "../../features/pt-hub/lib/pt-hub-preferences";
import { useI18n } from "../../lib/i18n-context";
import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { PageContainer } from "./page-container";

type AppFooterProps = {
  className?: string;
  contentClassName?: string;
  enableRegionLanguageSwitcher?: boolean;
  size?: "default" | "portal";
  surface?: "default" | "transparent";
};

export function AppFooter({
  className,
  contentClassName,
  enableRegionLanguageSwitcher = true,
  size = "default",
  surface = "default",
}: AppFooterProps) {
  const { t } = useI18n();

  return (
    <footer
      className={cn(
        "relative z-20 py-3 sm:py-4",
        surface === "default"
          ? "border-t border-border/60 bg-[oklch(var(--bg-surface)/0.55)] backdrop-blur-xl"
          : "border-t-0 bg-transparent backdrop-blur-0",
        className,
      )}
    >
      <PageContainer
        size={size}
        className={cn(
          "grid gap-2 text-xs text-muted-foreground sm:grid-cols-[1fr_auto_1fr] sm:items-center",
          contentClassName,
        )}
      >
        <span className="justify-self-center sm:justify-self-start">
          © 2026 RepSync
        </span>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-self-center">
          <Link
            className="transition-colors hover:text-foreground"
            to="/support"
          >
            {t("footer.support", "Support")}
          </Link>
          <Link
            className="transition-colors hover:text-foreground"
            to="/privacy"
          >
            {t("footer.privacy", "Privacy policy")}
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/terms">
            {t("footer.terms", "Terms of use")}
          </Link>
        </nav>
        {enableRegionLanguageSwitcher ? (
          <RegionLanguageSwitcher />
        ) : (
          <span className="justify-self-center sm:justify-self-end sm:text-right">
            {t("footer.regionLanguage", "Region & language")}
          </span>
        )}
      </PageContainer>
    </footer>
  );
}

function RegionLanguageSwitcher() {
  const { language, region, setLanguage, setRegion, t } = useI18n();
  const languageLabel = t(`i18n.language.${language}`, language);
  const regionLabel = t(`i18n.region.${region}`, region);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-[oklch(var(--bg-surface-elevated)/0.38)] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 sm:ml-auto"
          aria-label={t(
            "i18n.changeRegionLanguage",
            "Change region and language",
          )}
        >
          <span className="max-w-[12rem] truncate">
            {languageLabel} / {regionLabel}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="max-h-[min(18rem,calc(100vh-6rem))] w-52 overflow-y-auto p-1"
      >
        <DropdownMenuLabel>{t("i18n.language", "Language")}</DropdownMenuLabel>
        {LANGUAGE_OPTIONS.map((option) => (
          <PreferenceOption
            key={option.value}
            active={language === option.value}
            label={t(`i18n.language.${option.value}`, option.label)}
            onSelect={() => setLanguage(option.value as PtHubLanguage)}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("i18n.region", "Region")}</DropdownMenuLabel>
        {REGION_OPTIONS.map((option) => (
          <PreferenceOption
            key={option.value}
            active={region === option.value}
            label={t(`i18n.region.${option.value}`, option.label)}
            onSelect={() => setRegion(option.value as PtHubRegion)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PreferenceOption({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onSelect} size="compact">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
    </DropdownMenuItem>
  );
}
