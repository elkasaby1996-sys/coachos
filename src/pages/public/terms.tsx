import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function TermsPage() {
  return (
    <AuthBackdrop contentClassName="max-w-3xl">
      <div className="rounded-2xl border border-border/70 bg-card/85 p-6 text-sm text-muted-foreground shadow-[0_30px_60px_-40px_oklch(var(--primary)/0.5)] backdrop-blur-xl sm:p-8">
        <h1 className="font-serif text-3xl text-foreground">
          Terms of Service
        </h1>
        <p className="mt-3">
          By using CoachOS, you agree to use the product lawfully and not misuse
          accounts, data, or platform resources.
        </p>
        <p className="mt-3">
          CoachOS is provided as-is. You are responsible for reviewing outputs
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
