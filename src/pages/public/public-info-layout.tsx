import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { AppFooter } from "../../components/common/app-footer";
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
  useEffect(() => {
    document.body.classList.add("public-info-portal-light");

    return () => {
      document.body.classList.remove("public-info-portal-light");
    };
  }, []);

  return (
    <div className="light public-info-shell flex min-h-dvh flex-col bg-white text-slate-950">
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-5">
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border/80 bg-card px-4 text-sm font-semibold text-muted-foreground shadow-sm transition-colors hover:border-border hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            >
              RepSync
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </header>

          <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="space-y-8">
              <div className="max-w-3xl space-y-5">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">
                  {eyebrow}
                </p>
                <h1 className="text-balance text-4xl font-bold leading-[1.04] tracking-normal text-foreground sm:text-5xl lg:text-6xl">
                  {title}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {description}
                </p>
                {updated ? (
                  <p className="text-sm font-medium text-muted-foreground">
                    Last updated: {updated}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">{children}</div>
            </div>

            {aside ? (
              <aside className="rounded-2xl border border-border/70 bg-secondary/50 p-5 shadow-sm lg:sticky lg:top-8">
                {aside}
              </aside>
            ) : null}
          </section>
        </div>
      </main>

      <AppFooter className="border-border/70 bg-card text-muted-foreground" />
    </div>
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
        "rounded-2xl border border-border/70 bg-card p-5 text-sm leading-6 text-muted-foreground shadow-sm transition-colors hover:border-border",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-3">
        {icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            {icon}
          </span>
        ) : null}
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </article>
  );
}
