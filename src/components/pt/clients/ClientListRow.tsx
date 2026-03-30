import {
  getClientRiskFlagMeta,
  normalizeClientRiskFlags,
} from "../../../lib/client-lifecycle";
import { Badge } from "../../ui/badge";
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
  week,
  status,
  onboardingStatus,
  riskFlags,
  lastActivity,
  pausedReason,
  churnReason,
  onClick,
}: {
  name: string;
  program: string;
  week: string;
  status: string | null;
  onboardingStatus?: string | null;
  riskFlags?: string[] | null;
  lastActivity: string;
  pausedReason?: string | null;
  churnReason?: string | null;
  onClick: () => void;
}) {
  const normalizedRiskFlags = normalizeClientRiskFlags(riskFlags);
  const visibleRiskFlags = normalizedRiskFlags.slice(0, 2);
  const secondaryLabel = pausedReason?.trim() || churnReason?.trim() || week;

  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-subtle flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3 text-left transition hover:border-border hover:bg-background/70"
    >
      <div className="flex min-w-[220px] items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background/75 text-xs font-semibold">
          {makeInitials(name)}
        </div>
        <div className="space-y-1">
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-xs text-muted-foreground">
            {program} · {secondaryLabel}
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-2 text-xs">
        <StatusPill status={status ?? "active"} />
        {onboardingStatus && onboardingStatus !== "completed" ? (
          <StatusPill status={onboardingStatus} />
        ) : null}
        {visibleRiskFlags.map((flag) => {
          const meta = getClientRiskFlagMeta(flag);
          if (!meta) return null;
          return (
            <Badge key={flag} variant={meta.variant} className="text-[10px]">
              {meta.shortLabel}
            </Badge>
          );
        })}
        {normalizedRiskFlags.length > visibleRiskFlags.length ? (
          <Badge variant="muted" className="text-[10px]">
            +{normalizedRiskFlags.length - visibleRiskFlags.length} more
          </Badge>
        ) : null}
      </div>
      <div className="text-right">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Last activity
        </p>
        <p className="text-sm font-semibold text-foreground">{lastActivity}</p>
      </div>
    </button>
  );
}
