import { Archive, EyeOff, FileText, Globe2 } from "lucide-react";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubPackageManager } from "../../features/pt-hub/components/pt-hub-package-manager";
import { usePtPackages } from "../../features/pt-hub/lib/pt-hub";
import { summarizePackageDisplayStates } from "../../features/pt-hub/lib/pt-hub-package-state";
import { StatCard } from "../../components/ui/coachos/stat-card";

const PACKAGE_KPI_META = {
  draft: {
    label: "Draft",
    helper: "Internal concepts not visible anywhere public.",
    icon: FileText,
    iconClassName: "text-amber-500/80 dark:text-amber-300/80",
    accent: false,
    className: "h-full border-border/55 bg-background/35 shadow-none",
  },
  hidden: {
    label: "Active-Hidden",
    helper: "Live in PT Hub, hidden from your public profile.",
    icon: EyeOff,
    iconClassName: "text-muted-foreground",
    accent: false,
    className: "h-full border-border/55 bg-background/35 shadow-none",
  },
  public: {
    label: "Active-Public",
    helper: "Visible on the public profile and lead intake flow.",
    icon: Globe2,
    iconClassName: "text-emerald-500/80 dark:text-emerald-300/80",
    className: "h-full border-border/55 bg-background/35 shadow-none",
    accent: false,
  },
  archived: {
    label: "Archived",
    helper: "Retired offers kept for historical package context.",
    icon: Archive,
    iconClassName: "text-rose-500/75 dark:text-rose-300/75",
    accent: false,
    className: "h-full border-border/55 bg-background/35 shadow-none",
  },
} as const;

function resolvePackageKpiMeta(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("draft")) return PACKAGE_KPI_META.draft;
  if (normalized.includes("arch")) return PACKAGE_KPI_META.archived;
  if (normalized.includes("public")) return PACKAGE_KPI_META.public;
  if (normalized.includes("hidden")) return PACKAGE_KPI_META.hidden;

  return PACKAGE_KPI_META.draft;
}

export function PtHubPackagesPage() {
  const packagesQuery = usePtPackages();
  const packages = packagesQuery.data ?? [];
  const packageStateSummary = summarizePackageDisplayStates(packages);

  return (
    <section className="pt-hub-page-stack" data-testid="pt-hub-packages-page">
      <PtHubPageHeader
        eyebrow="Packages"
        title="Manage your packages"
        description="Create, publish, hide, archive, and reorder PT-scoped packages for your public profile and lead intake."
      />

      <div className="page-kpi-block pt-hub-kpi-grid" data-columns="4">
        {packageStateSummary.map((item) => {
          const meta = resolvePackageKpiMeta(item.label);
          const Icon = meta.icon;

          return (
            <StatCard
              key={item.label}
              surface="pt-hub"
              label={meta.label}
              value={item.count}
              helper={meta.helper}
              icon={Icon}
              iconClassName={meta.iconClassName}
              accent={meta.accent}
              className={meta.className}
            />
          );
        })}
      </div>

      <PtHubPackageManager />
    </section>
  );
}
