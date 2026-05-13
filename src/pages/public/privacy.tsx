import { Database, FileKey2, LockKeyhole, Mail, UserCheck } from "lucide-react";
import { useEffect } from "react";
import { PublicInfoCard, PublicInfoLayout } from "./public-info-layout";

export function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy — RepSync";
  }, []);

  return (
    <PublicInfoLayout
      eyebrow="Data protection"
      title="Privacy Policy"
      description="This placeholder privacy structure needs legal review before production. It summarizes the product areas where RepSync may process account, coaching, training, and check-in data."
      updated="Legal review pending"
      aside={
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3 text-foreground">
            <Mail className="h-4 w-4 text-primary" />
            <span className="font-semibold">Privacy requests</span>
          </div>
          <a
            className="inline-flex font-semibold text-foreground underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary"
            href="mailto:support@repsync.com"
          >
            support@repsync.com
          </a>
          <p className="text-sm leading-6">
            Contact us for access, correction, deletion, or workspace data
            questions.
          </p>
          <div className="rounded-xl border border-border/70 bg-card p-3 text-xs font-medium leading-5 text-muted-foreground">
            Legal copy needs review before production publication.
          </div>
        </div>
      }
    >
      <PublicInfoCard title="Introduction">
        <p>
          This page is a safe placeholder for RepSync privacy information and
          should be reviewed by counsel before launch.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<Database className="h-4 w-4" />}
        title="Information we collect"
      >
        <ul className="space-y-2">
          <li>Account profile and authentication details.</li>
          <li>Programs, check-ins, notes, and workspace settings.</li>
          <li>Operational logs needed to secure and support the app.</li>
        </ul>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<UserCheck className="h-4 w-4" />}
        title="How information is used"
      >
        <p>
          Data is used to authenticate users, show the right workspace content,
          support coach-client collaboration, and operate product features.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<LockKeyhole className="h-4 w-4" />}
        title="Data storage and security"
      >
        <p>
          Role-based policies restrict access to the people and workspaces that
          need the information. We only process data necessary to operate and
          support the app.
        </p>
      </PublicInfoCard>
      <PublicInfoCard title="Third-party services">
        <p>
          RepSync may rely on configured infrastructure, authentication, hosting,
          analytics, messaging, storage, or payment providers where needed to
          operate the service.
        </p>
      </PublicInfoCard>
      <PublicInfoCard title="User rights">
        <p>
          Users may request access, correction, deletion, or export where
          available and legally required.
        </p>
      </PublicInfoCard>
      <PublicInfoCard icon={<FileKey2 className="h-4 w-4" />} title="Contact">
        <p>
          Contact support@repsync.com for privacy questions or data requests.
        </p>
      </PublicInfoCard>
    </PublicInfoLayout>
  );
}
