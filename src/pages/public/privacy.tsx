import { Database, FileKey2, LockKeyhole, Mail, UserCheck } from "lucide-react";
import { PublicInfoCard, PublicInfoLayout } from "./public-info-layout";

export function PrivacyPage() {
  return (
    <PublicInfoLayout
      eyebrow="Data protection"
      title="Privacy Policy"
      description="RepSync uses account, coaching, training, and check-in data to provide coach and client workflows. Access is limited by role and workspace permissions."
      updated="February 17, 2026"
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
            We use privacy requests to verify identity before changing or
            deleting account data.
          </div>
        </div>
      }
    >
      <PublicInfoCard
        icon={<Database className="h-4 w-4" />}
        title="Data we process"
      >
        <ul className="space-y-2">
          <li>Account profile and authentication details.</li>
          <li>Programs, check-ins, notes, and workspace settings.</li>
          <li>Operational logs needed to secure and support the app.</li>
        </ul>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<UserCheck className="h-4 w-4" />}
        title="How it is used"
      >
        <p>
          Data is used to authenticate users, show the right workspace content,
          support coach-client collaboration, and operate product features.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<LockKeyhole className="h-4 w-4" />}
        title="Access controls"
      >
        <p>
          Role-based policies restrict access to the people and workspaces that
          need the information. We only process data necessary to operate and
          support the app.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<FileKey2 className="h-4 w-4" />}
        title="Retention"
      >
        <p>
          We keep information while an account or workspace needs it, then
          remove or de-identify data when it is no longer required.
        </p>
      </PublicInfoCard>
    </PublicInfoLayout>
  );
}
