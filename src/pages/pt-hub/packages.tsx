import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubPackageManager } from "../../features/pt-hub/components/pt-hub-package-manager";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import { usePtHubPublicationState, usePtPackages } from "../../features/pt-hub/lib/pt-hub";
import {
  isPackagePubliclySelectable,
  summarizePackageDisplayStates,
} from "../../features/pt-hub/lib/pt-hub-package-state";

export function PtHubPackagesPage() {
  const packagesQuery = usePtPackages();
  const publicationQuery = usePtHubPublicationState();
  const packages = packagesQuery.data ?? [];
  const packageStateSummary = summarizePackageDisplayStates(packages);
  const publiclySelectableCount = packages.filter((pkg) =>
    isPackagePubliclySelectable(pkg),
  ).length;

  return (
    <section className="space-y-6" data-testid="pt-hub-packages-page">
      <PtHubPageHeader
        eyebrow="Packages"
        title="Manage your packages"
        description="Create, publish, hide, archive, and reorder PT-scoped packages for your public profile and lead intake."
        actions={
          <>
            {publicationQuery.data?.publicUrl ? (
              <Button asChild variant="ghost">
                <a
                  href={publicationQuery.data.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open public page
                </a>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link to="/pt-hub/profile/preview">Preview public profile</Link>
            </Button>
          </>
        }
      />

      <PtHubSectionCard
        title="Public visibility sync"
        description="Only Active â€¢ Public packages are shown on your public profile and selectable in the Apply form."
      >
        <div className="grid gap-3 md:grid-cols-4">
          {packageStateSummary.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-border/60 bg-background/35 px-4 py-3"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {item.count}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Publicly selectable now: {publiclySelectableCount}
        </p>
      </PtHubSectionCard>

      <PtHubSectionCard
        title="Packages"
        description="Manage package details and state in one canonical PT Hub surface."
      >
        <PtHubPackageManager />
      </PtHubSectionCard>
    </section>
  );
}
