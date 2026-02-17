import { AuthBackdrop } from "../../components/common/auth-backdrop";

const supportEmail =
  import.meta.env.VITE_SUPPORT_EMAIL || "support@coachos.com";

export function SupportPage() {
  return (
    <AuthBackdrop contentClassName="max-w-2xl">
      <div className="rounded-2xl border border-border/70 bg-card/85 p-6 text-sm text-muted-foreground shadow-[0_30px_60px_-40px_oklch(var(--primary)/0.5)] backdrop-blur-xl sm:p-8">
        <h1 className="font-serif text-3xl text-foreground">Support</h1>
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
