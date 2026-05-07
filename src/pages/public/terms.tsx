import {
  AlertTriangle,
  ClipboardCheck,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { PublicInfoCard, PublicInfoLayout } from "./public-info-layout";

export function TermsPage() {
  return (
    <PublicInfoLayout
      eyebrow="Usage agreement"
      title="Terms of Use"
      description="These terms describe the expectations for using RepSync responsibly, protecting account access, and reviewing coaching outputs before relying on them."
      updated="February 17, 2026"
      aside={
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3 text-foreground">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <span className="font-semibold">Applies to</span>
          </div>
          <p className="text-sm leading-6">
            Coaches, clients, workspace owners, and anyone accessing RepSync
            through an invited account.
          </p>
          <div className="rounded-xl border border-border/70 bg-card p-3 text-xs font-medium leading-5 text-muted-foreground">
            These terms are a product summary and do not replace written
            agreements signed separately.
          </div>
        </div>
      }
    >
      <PublicInfoCard
        icon={<ClipboardCheck className="h-4 w-4" />}
        title="Responsible use"
      >
        <ul className="space-y-2">
          <li>Use RepSync lawfully and respectfully.</li>
          <li>Keep account access and client information protected.</li>
          <li>Do not misuse platform resources or interfere with service.</li>
        </ul>
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
      >
        <p>
          We may suspend accounts that violate these terms, compromise platform
          security, or create risk for other users or workspaces.
        </p>
      </PublicInfoCard>
      <PublicInfoCard icon={<Scale className="h-4 w-4" />} title="Changes">
        <p>
          We may update these terms as the product changes. Continued use means
          the current terms apply to your account.
        </p>
      </PublicInfoCard>
    </PublicInfoLayout>
  );
}
