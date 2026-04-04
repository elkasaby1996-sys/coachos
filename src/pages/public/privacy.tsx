import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function PrivacyPage() {
  return (
    <AuthBackdrop contentClassName="max-w-3xl">
      <div className="auth-shell-card max-w-3xl text-sm text-muted-foreground sm:p-8">
        <h1 className="auth-shell-title">Privacy Policy</h1>
        <p className="mt-3">
          Repsync stores account, training, and check-in data to provide
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
            href="mailto:support@repsync.com"
          >
            support@repsync.com
          </a>
          .
        </p>
        <p className="mt-6 text-xs">Last updated: February 17, 2026</p>
      </div>
    </AuthBackdrop>
  );
}
