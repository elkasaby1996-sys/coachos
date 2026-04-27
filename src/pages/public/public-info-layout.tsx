import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import { cn } from "../../lib/utils";

type PublicInfoLayoutProps = {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
  updated?: string;
};

export function PublicInfoLayout({
  title,
  eyebrow,
  description,
  children,
  aside,
  updated,
}: PublicInfoLayoutProps) {
  return (
    <AuthBackdrop contentClassName="max-w-5xl py-6 sm:items-center sm:py-8">
      <main className="w-full">
        <section className="relative overflow-hidden rounded-[28px] border border-white/18 bg-[linear-gradient(180deg,rgba(15,23,32,0.76),rgba(7,12,20,0.66))] p-5 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.66),inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-xl sm:p-7">
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <div>
              <Link
                to="/login"
                className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                  {eyebrow}
                </p>
                <h1 className="auth-shell-title">{title}</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  {description}
                </p>
              </div>

              {updated ? (
                <p className="mt-4 text-xs font-medium text-muted-foreground">
                  Last updated: {updated}
                </p>
              ) : null}
            </div>

            {aside ? (
              <aside className="rounded-2xl border border-white/14 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                {aside}
              </aside>
            ) : null}
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">{children}</div>
        </section>
      </main>
    </AuthBackdrop>
  );
}

type PublicInfoCardProps = {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
};

export function PublicInfoCard({
  icon,
  title,
  children,
  className,
}: PublicInfoCardProps) {
  return (
    <article
      className={cn(
        "rounded-2xl border border-white/12 bg-white/[0.035] p-4 text-sm leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-3">
        {icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.06] text-primary">
            {icon}
          </span>
        ) : null}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </article>
  );
}
