import { Database, LockKeyhole, Mail, UserCheck } from "lucide-react";
import { PublicInfoCard, PublicInfoLayout } from "./public-info-layout";

export function PrivacyPage() {
  return (
    <PublicInfoLayout
      eyebrow="Data protection"
      title="Privacy Policy"
      description="RepSync uses account, coaching, training, and check-in data to provide coach and client workflows. Access is limited by role and workspace permissions."
      updated="February 17, 2026"
      aside={
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-3 text-foreground">
            <Mail className="h-4 w-4 text-primary" />
            <span className="font-semibold">Privacy requests</span>
          </div>
          <a
            className="inline-flex text-foreground underline decoration-white/25 underline-offset-4 transition-colors hover:text-primary"
            href="mailto:support@repsync.com"
          >
            support@repsync.com
          </a>
          <p className="text-xs leading-5">
            Contact us for access, correction, deletion, or workspace data
            questions.
          </p>
        </div>
      }
    >
      <PublicInfoCard
        icon={<Database className="h-4 w-4" />}
        title="Data we process"
      >
        <p>
          We store the information needed to run coaching workflows, including
          account details, program activity, check-ins, and workspace settings.
        </p>
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
        className="sm:col-span-2"
      >
        <p>
          Role-based policies restrict access to the people and workspaces that
          need the information. We only process data necessary to operate and
          support the app.
        </p>
      </PublicInfoCard>
    </PublicInfoLayout>
  );
}
