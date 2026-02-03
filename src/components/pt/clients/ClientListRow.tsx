import { StatusPill } from "../dashboard/StatusPill";
import { Sparkline } from "./Sparkline";

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
  week,
  status,
  adherence,
  lastActivity,
  trend,
  onClick,
}: {
  name: string;
  program: string;
  week: string;
  status: string | null;
  adherence: string;
  lastActivity: string;
  trend?: number[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-left transition hover:border-border hover:bg-muted/40"
    >
      <div className="flex min-w-[220px] items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/70 text-xs font-semibold">
          {makeInitials(name)}
        </div>
        <div>
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-xs text-muted-foreground">
            {program} · {week}
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center gap-2 text-xs">
        <StatusPill status={status ?? "active"} />
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Adherence</p>
          <p className="text-sm font-semibold text-accent">{adherence}</p>
          <p className="text-[10px] text-muted-foreground">{lastActivity}</p>
        </div>
        <Sparkline points={trend} />
      </div>
    </button>
  );
}