import { StatusPill } from "./StatusPill";

export function DashboardHeader({
  title,
  subtitle,
  status,
  lastSeen,
  actions,
}: {
  title: string;
  subtitle?: string;
  status: string | null;
  lastSeen?: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 rounded-2xl border border-border/70 bg-card/90 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <StatusPill status={status} />
            {lastSeen ? (
              <span className="text-xs text-muted-foreground">
                Last seen {lastSeen}
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}
