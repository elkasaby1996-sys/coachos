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
  summary,
  status,
  onboardingStatus,
  riskFlags,
  lastActivity,
  healthLabel,
  healthVariant = "muted",
  nextAction,
  coachingSignal,
  pausedReason,
  churnReason,
  onClick,
}: {
  name: string;
  program: string;
  summary: string;
  status: string | null;
  onboardingStatus?: string | null;
  riskFlags?: string[] | null;
  lastActivity: string;
  healthLabel: string;
  healthVariant?: "success" | "warning" | "danger" | "muted" | "secondary";
  nextAction: string;
  coachingSignal: string;
  pausedReason?: string | null;
  churnReason?: string | null;
  onClick: () => void;
}) {
  const normalizedRiskFlags = normalizeClientRiskFlags(riskFlags);
  const visibleRiskFlags = normalizedRiskFlags.slice(0, 2);
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
                  {onboardingStatus && onboardingStatus !== "completed" ? (
                    <StatusPill status={onboardingStatus} />
                  ) : null}
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

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="ops-stat space-y-1">
                <div className="ops-kicker">Health</div>
                <Badge
                  variant={healthVariant}
                  className="w-fit px-2.5 py-1 text-[10px]"
                >
                  {healthLabel}
                </Badge>
              </div>

              <div className="ops-stat space-y-1">
                <div className="ops-kicker">Last Activity</div>
                <div className="text-sm font-semibold text-foreground">
                  {lastActivity}
                </div>
              </div>

              <div className="ops-stat space-y-1">
                <div className="ops-kicker">Coach Signal</div>
                <div className="text-sm font-semibold text-foreground">
                  {coachingSignal}
                </div>
              </div>

              <div className="ops-stat space-y-1">
                <div className="ops-kicker">Risk Board</div>
                <div className="flex flex-wrap gap-1.5">
                  {visibleRiskFlags.map((flag) => {
                    const meta = getClientRiskFlagMeta(flag);
                    if (!meta) return null;
                    return (
                      <Badge
                        key={flag}
                        variant={meta.variant}
                        className="px-2 py-0.5 text-[10px]"
                      >
                        {meta.shortLabel}
                      </Badge>
                    );
                  })}
                  {normalizedRiskFlags.length > visibleRiskFlags.length ? (
                    <Badge variant="muted" className="px-2 py-0.5 text-[10px]">
                      +{normalizedRiskFlags.length - visibleRiskFlags.length}
                    </Badge>
                  ) : null}
                  {normalizedRiskFlags.length === 0 ? (
                    <span className="text-sm font-medium text-muted-foreground">
                      Clear
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
