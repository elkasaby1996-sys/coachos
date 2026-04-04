import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function TermsPage() {
  return (
    <AuthBackdrop contentClassName="max-w-3xl">
      <div className="auth-shell-card max-w-3xl text-sm text-muted-foreground sm:p-8">
        <h1 className="auth-shell-title">Terms of Service</h1>
        <p className="mt-3">
          By using Repsync, you agree to use the product lawfully and not misuse
          accounts, data, or platform resources.
        </p>
        <p className="mt-3">
          Repsync is provided as-is. You are responsible for reviewing outputs
          before relying on them in training or health contexts.
        </p>
        <p className="mt-3">
          We may suspend accounts that violate these terms or compromise
          platform security.
        </p>
        <p className="mt-6 text-xs">Last updated: February 17, 2026</p>
      </div>
    </AuthBackdrop>
  );
}
