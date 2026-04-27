import { AlertTriangle, ClipboardCheck, ShieldAlert } from "lucide-react";
import { PublicInfoCard, PublicInfoLayout } from "./public-info-layout";

export function TermsPage() {
  return (
    <PublicInfoLayout
      eyebrow="Usage agreement"
      title="Terms of Use"
      description="These terms describe the expectations for using RepSync responsibly, protecting account access, and reviewing coaching outputs before relying on them."
      updated="February 17, 2026"
      aside={
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-3 text-foreground">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <span className="font-semibold">Applies to</span>
          </div>
          <p className="text-xs leading-5">
            Coaches, clients, workspace owners, and anyone accessing RepSync
            through an invited account.
          </p>
        </div>
      }
    >
      <PublicInfoCard
        icon={<ClipboardCheck className="h-4 w-4" />}
        title="Responsible use"
      >
        <p>
          Use RepSync lawfully and do not misuse accounts, coaching data, client
          information, or platform resources.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Training decisions"
      >
        <p>
          RepSync is provided as-is. Review outputs before relying on them for
          training, wellness, or health-related decisions.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Security"
        className="sm:col-span-2"
      >
        <p>
          We may suspend accounts that violate these terms, compromise platform
          security, or create risk for other users or workspaces.
        </p>
      </PublicInfoCard>
    </PublicInfoLayout>
  );
}
