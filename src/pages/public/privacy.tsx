import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function PrivacyPage() {
  return (
    <AuthBackdrop contentClassName="max-w-3xl">
      <div className="auth-shell-card max-w-3xl text-sm text-muted-foreground sm:p-8">
        <Link
          to="/login"
          className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
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
