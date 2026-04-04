import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

const supportEmail = "support@repsync.com";

export function SupportPage() {
  return (
    <AuthBackdrop contentClassName="max-w-2xl">
      <div className="auth-shell-card max-w-2xl text-sm text-muted-foreground sm:p-8">
        <Link
          to="/login"
          className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <h1 className="auth-shell-title">Support</h1>
        <p className="mt-3">
          For account, billing, or product issues, contact support and include
          your account email plus a short description of the problem.
        </p>
        <p className="mt-4">
          <a
            className="text-foreground underline"
            href={`mailto:${supportEmail}`}
          >
            {supportEmail}
          </a>
        </p>
      </div>
    </AuthBackdrop>
  );
}
