import {
  AlertTriangle,
  ClipboardCheck,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { useEffect } from "react";
import { PublicInfoCard, PublicInfoLayout } from "./public-info-layout";

export function TermsPage() {
  useEffect(() => {
    document.title = "Terms of Service — RepSync";
  }, []);

  return (
    <PublicInfoLayout
      eyebrow="Usage agreement"
      title="Terms of Service"
      description="This placeholder terms structure needs legal review before production. It outlines expected areas for service use, accounts, payments, acceptable use, and limitations."
      updated="Legal review pending"
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
            Legal copy needs review before production publication.
          </div>
        </div>
      }
    >
      <PublicInfoCard title="Introduction">
        <p>
          This page is a safe placeholder for RepSync service terms and should
          be reviewed by counsel before launch.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<ClipboardCheck className="h-4 w-4" />}
        title="Use of the service"
      >
        <ul className="space-y-2">
          <li>Use RepSync lawfully and respectfully.</li>
          <li>Keep account access and client information protected.</li>
          <li>Do not misuse platform resources or interfere with service.</li>
        </ul>
      </PublicInfoCard>
      <PublicInfoCard title="Accounts">
        <p>
          Users are responsible for keeping account access secure and for
          ensuring workspace members have appropriate permissions.
        </p>
      </PublicInfoCard>
      <PublicInfoCard title="Payments">
        <p>
          Payment and subscription terms should reflect the final billing setup
          once pricing and provider configuration are confirmed.
        </p>
      </PublicInfoCard>
      <PublicInfoCard title="Acceptable use">
        <p>
          Do not misuse platform resources, attempt unauthorized access, or
          upload content that violates law or the rights of others.
        </p>
      </PublicInfoCard>
      <PublicInfoCard title="Intellectual property">
        <p>
          RepSync product materials remain RepSync property. Users retain
          responsibility for content they provide to their own clients.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Disclaimers"
      >
        <p>
          RepSync is provided as-is. Review outputs before relying on them for
          training, wellness, or health-related decisions.
        </p>
      </PublicInfoCard>
      <PublicInfoCard title="Limitation of liability">
        <p>
          Any limitation language should be finalized by legal counsel before
          production use.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Termination"
      >
        <p>
          We may suspend accounts that violate these terms, compromise platform
          security, or create risk for other users or workspaces.
        </p>
      </PublicInfoCard>
      <PublicInfoCard icon={<Scale className="h-4 w-4" />} title="Contact">
        <p>Contact support@repsync.com for terms or account questions.</p>
      </PublicInfoCard>
    </PublicInfoLayout>
  );
}
