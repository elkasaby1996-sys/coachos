import { Check, ChevronDown, Globe2 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  LANGUAGE_OPTIONS,
  REGION_OPTIONS,
  type PtHubLanguage,
  type PtHubRegion,
} from "../../features/pt-hub/lib/pt-hub-preferences";
import { useI18n } from "../../lib/i18n";
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
};

export function AppFooter({
  className,
  contentClassName,
  enableRegionLanguageSwitcher = true,
  size = "default",
}: AppFooterProps) {
  const { t } = useI18n();

  return (
    <footer
      className={cn(
        "relative z-20 border-t border-border/60 bg-[oklch(var(--bg-surface)/0.55)] py-3 backdrop-blur-xl sm:py-4",
        className,
      )}
    >
      <PageContainer
        size={size}
        className={cn(
          "flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
          contentClassName,
        )}
      >
        <span>c 2026 RepSync</span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
          <span className="sm:text-right">
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
          <Globe2 className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[12rem] truncate">
            {languageLabel} / {regionLabel}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-64">
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
