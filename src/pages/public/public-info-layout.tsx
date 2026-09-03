import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  AuthFlowBackground,
  authFooterClassName,
  authFooterContentClassName,
} from "../../components/common/auth-backdrop";
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
    document.title = `${title} | RepSync`;

    const existingDescription = document.head.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const descriptionTag =
      existingDescription ?? document.createElement("meta");
    descriptionTag.setAttribute("name", "description");
    descriptionTag.setAttribute("content", description);
    if (!existingDescription) {
      document.head.appendChild(descriptionTag);
    }

    return () => {
      document.body.classList.remove("public-info-portal-light");
    };
  }, [description, title]);

  return (
    <div className="light public-info-shell pt-hub-theme pt-hub-theme-light auth-flow-canvas relative isolate flex min-h-dvh flex-col overflow-hidden text-foreground">
      <AuthFlowBackground />

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[74rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <header className="surface-panel-strong pt-hub-shell-header relative overflow-hidden rounded-[30px] border border-border/70 px-5 py-3 shadow-[var(--surface-shadow)]">
            <div className="pt-hub-shell-header-wash pointer-events-none absolute inset-0" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-lg text-[1.65rem] font-semibold uppercase leading-none tracking-[0.07em] text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Support
              </Link>
              <Link
                to="/login"
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-4 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-primary/35 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Link>
            </div>
          </header>

          <section className="surface-panel pt-hub-surface-work relative overflow-hidden rounded-[28px] border border-border/70 shadow-[var(--surface-shadow)]">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(var(--primary)/0.32),transparent)]" />
            <div className="relative grid lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-7 p-5 sm:p-7 lg:p-9">
                <div className="max-w-3xl space-y-4">
                  <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-primary"
                    />
                    {eyebrow}
                  </p>
                  <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-foreground sm:text-5xl">
                    {title}
                  </h1>
                  <p className="max-w-[68ch] text-base leading-7 text-muted-foreground">
                    {description}
                  </p>
                  {updated ? (
                    <p className="text-sm font-medium text-muted-foreground">
                      Last updated: {updated}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">{children}</div>
              </div>

              {aside ? (
                <aside className="border-t border-border/60 bg-secondary/25 p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
                  {aside}
                </aside>
              ) : null}
            </div>
          </section>
        </div>
      </main>

      <AppFooter
        surface="transparent"
        className={authFooterClassName}
        contentClassName={authFooterContentClassName}
      />
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
        "rounded-[20px] border border-border/60 bg-background/38 p-4 text-sm leading-6 text-muted-foreground transition-colors duration-200 hover:border-primary/30 hover:bg-background/58",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-3">
        {icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            {icon}
          </span>
        ) : null}
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </article>
  );
}
