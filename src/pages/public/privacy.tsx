import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function PrivacyPage() {
  return (
    <AuthBackdrop contentClassName="max-w-3xl">
      <div className="rounded-2xl border border-border/70 bg-card/85 p-6 text-sm text-muted-foreground shadow-[0_30px_60px_-40px_oklch(var(--primary)/0.5)] backdrop-blur-xl sm:p-8">
        <h1 className="font-serif text-3xl text-foreground">Privacy Policy</h1>
        <p className="mt-3">
          CoachOS stores account, training, and check-in data to provide
          coaching workflows. Access is restricted by role-based policies in
          Supabase.
        </p>
        <p className="mt-3">
          We only process data necessary to operate the app and support coach
          and client features.
        </p>
        <p className="mt-3">
          For privacy requests, contact{" "}
          <a
            className="text-foreground underline"
            href="mailto:support@coachos.com"
          >
            support@coachos.com
          </a>
          .
        </p>
        <p className="mt-6 text-xs">Last updated: February 17, 2026</p>
      </div>
    </AuthBackdrop>
  );
}
