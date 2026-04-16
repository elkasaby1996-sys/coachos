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
    accent: false,
    className:
      "h-full before:absolute before:inset-x-5 before:top-0 before:h-1 before:rounded-b-full before:bg-amber-500 after:pointer-events-none after:absolute after:-right-10 after:-top-10 after:h-28 after:w-28 after:rounded-full after:bg-amber-500/16 after:blur-3xl",
  },
  hidden: {
    label: "Active-Hidden",
    helper: "Live in PT Hub, hidden from your public profile.",
    icon: EyeOff,
    accent: false,
    className:
      "h-full before:absolute before:inset-x-5 before:top-0 before:h-1 before:rounded-b-full before:bg-slate-500 after:pointer-events-none after:absolute after:-right-10 after:-top-10 after:h-28 after:w-28 after:rounded-full after:bg-slate-500/14 after:blur-3xl",
  },
  public: {
    label: "Active-Public",
    helper: "Visible on the public profile and lead intake flow.",
    icon: Globe2,
    className:
      "h-full before:absolute before:inset-x-5 before:top-0 before:h-1 before:rounded-b-full before:bg-emerald-500 after:pointer-events-none after:absolute after:-right-10 after:-top-10 after:h-28 after:w-28 after:rounded-full after:bg-emerald-500/18 after:blur-3xl",
    accent: true,
  },
  archived: {
    label: "Archived",
    helper: "Retired offers kept for historical package context.",
    icon: Archive,
    accent: false,
    className:
      "h-full before:absolute before:inset-x-5 before:top-0 before:h-1 before:rounded-b-full before:bg-rose-500 after:pointer-events-none after:absolute after:-right-10 after:-top-10 after:h-28 after:w-28 after:rounded-full after:bg-rose-500/16 after:blur-3xl",
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
    <section className="space-y-6" data-testid="pt-hub-packages-page">
      <PtHubPageHeader
        eyebrow="Packages"
        title="Manage your packages"
        description="Create, publish, hide, archive, and reorder PT-scoped packages for your public profile and lead intake."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
