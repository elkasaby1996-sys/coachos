import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubPackageManager } from "../../features/pt-hub/components/pt-hub-package-manager";

export function PtHubPackagesPage() {
  return (
    <section className="pt-hub-page-stack" data-testid="pt-hub-packages-page">
      <PtHubPageHeader
        eyebrow="Packages"
        title="Packages"
        description="Your coaching offers, pricing, and public availability."
      />

      <PtHubPackageManager />
    </section>
  );
}
