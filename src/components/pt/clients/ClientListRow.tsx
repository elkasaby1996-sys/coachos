import { StatusPill } from "../dashboard/StatusPill";

const makeInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export function ClientListRow({
  name,
  program,
  summary,
  status,
  lastActivity,
  nextAction,
  pausedReason,
  churnReason,
  onClick,
}: {
  name: string;
  program: string;
  summary: string;
  status: string | null;
  lastActivity: string;
  nextAction: string;
  pausedReason?: string | null;
  churnReason?: string | null;
  onClick: () => void;
}) {
  const secondaryLabel = pausedReason?.trim() || churnReason?.trim() || summary;

  return (
    <button
      type="button"
      onClick={onClick}
      className="ops-surface-strong group w-full px-4 py-4 text-left transition hover:border-border hover:bg-card/95"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-border/70 bg-background/75 text-xs font-semibold text-foreground">
            {makeInitials(name)}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-base font-semibold text-foreground">
                    {name}
                  </div>
                  <StatusPill status={status ?? "active"} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Last activity {lastActivity}
                </div>
                <div className="text-sm text-muted-foreground">
                  {program}
                  {secondaryLabel ? ` • ${secondaryLabel}` : ""}
                </div>
              </div>

              <div className="ops-stat min-w-[180px] max-w-full space-y-1 xl:w-[220px]">
                <div className="ops-kicker">Next Coach Move</div>
                <div className="text-sm font-semibold text-foreground">
                  {nextAction}
                </div>
                <div className="text-xs text-muted-foreground">
                  Open client workspace
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
