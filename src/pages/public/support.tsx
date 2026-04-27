import { LifeBuoy, Mail, ShieldCheck, Timer } from "lucide-react";
import { PublicInfoCard, PublicInfoLayout } from "./public-info-layout";

const supportEmail = "support@repsync.com";

export function SupportPage() {
  return (
    <PublicInfoLayout
      eyebrow="Help desk"
      title="Support"
      description="Tell us what happened and we will help you get back into your RepSync workspace. Include the account email, what you were trying to do, and any relevant screenshots."
      aside={
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-3 text-foreground">
            <Mail className="h-4 w-4 text-primary" />
            <span className="font-semibold">Contact support</span>
          </div>
          <a
            className="inline-flex text-foreground underline decoration-white/25 underline-offset-4 transition-colors hover:text-primary"
            href={`mailto:${supportEmail}`}
          >
            {supportEmail}
          </a>
          <p className="text-xs leading-5">
            For account access, billing, or product issues, use the same email
            linked to your RepSync account.
          </p>
        </div>
      }
    >
      <PublicInfoCard
        icon={<LifeBuoy className="h-4 w-4" />}
        title="What to include"
      >
        <p>
          Share your workspace email, the page or workflow affected, and the
          exact result you expected.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<Timer className="h-4 w-4" />}
        title="Response priority"
      >
        <p>
          Access and billing issues are reviewed first. Product questions are
          handled with the details needed to reproduce the issue.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Account safety"
        className="sm:col-span-2"
      >
        <p>
          We will never ask for your password. If you cannot sign in, use the
          password reset flow or email support from your account address.
        </p>
      </PublicInfoCard>
    </PublicInfoLayout>
  );
}
