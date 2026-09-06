import {
  ArrowUpRight,
  CheckCircle2,
  LifeBuoy,
  Mail,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { PublicInfoCard, PublicInfoLayout } from "./public-info-layout";

const supportEmail = "support@repsync.com";

export function SupportPage() {
  return (
    <PublicInfoLayout
      eyebrow="Help desk"
      title="Contact RepSync support."
      description="Describe the problem, include the email linked to your account, and attach relevant screenshots."
      aside={
        <div className="space-y-6 text-sm text-muted-foreground">
          <div className="space-y-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <p className="pt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Direct support
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Email the RepSync team
            </h2>
            <p className="leading-6">
              Account access and billing issues are reviewed first. Include the
              email linked to your account so we can help faster.
            </p>
          </div>
          <a
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            href={`mailto:${supportEmail}`}
          >
            {supportEmail}
            <ArrowUpRight className="h-4 w-4" />
          </a>
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-warning" />
              Keep your account safe
            </div>
            <p className="text-xs font-medium leading-5 text-foreground/75">
              Never send passwords, payment card numbers, or private client
              health details by email.
            </p>
          </div>
        </div>
      }
    >
      <PublicInfoCard
        icon={<LifeBuoy className="h-4 w-4" />}
        title="Include these details"
        className="sm:col-span-2"
      >
        <ul className="grid gap-2 sm:grid-cols-3">
          <li>Workspace or account email.</li>
          <li>Page, action, or workflow affected.</li>
          <li>What happened and what you expected instead.</li>
        </ul>
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
      >
        <p>
          RepSync support will never ask for your password. If you cannot sign
          in, use the password reset flow or email support from your account
          address.
        </p>
      </PublicInfoCard>
      <PublicInfoCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        title="Check before sending"
      >
        <p>
          Refresh the page, check your internet connection, and note any error
          message exactly as it appears.
        </p>
      </PublicInfoCard>
    </PublicInfoLayout>
  );
}
