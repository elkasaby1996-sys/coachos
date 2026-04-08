import { ArrowUpRight } from "lucide-react";
import {
  getClientLifecycleMeta,
  getClientRiskFlagMeta,
  normalizeClientRiskFlags,
} from "../../../lib/client-lifecycle";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { useWindowedRows } from "../../../hooks/use-windowed-rows";
import { getSemanticToneClasses } from "../../../lib/semantic-status";
import type { PTClientSummary } from "../types";

export function PtHubClientTable({
  clients,
  onOpen,
}: {
  clients: PTClientSummary[];
  onOpen: (client: PTClientSummary) => void;
}) {
  const {
    visibleRows,
    hasHiddenRows,
    hiddenCount,
    showMore,
  } = useWindowedRows({
    rows: clients,
    initialCount: 16,
    step: 16,
    resetKey: clients.length,
  });

  return (
    <div className="space-y-2 rounded-[30px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.82),oklch(var(--bg-surface)/0.74))] p-2">
      <div className="hidden grid-cols-[minmax(0,1.2fr)_180px_220px_160px] gap-4 rounded-[22px] border border-border/60 bg-background/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:grid">
        <span>Client</span>
        <span>Coaching space</span>
        <span>Lifecycle</span>
        <span className="text-right">Action</span>
      </div>
      <div className="space-y-2">
        {visibleRows.map((client) => {
          const lifecycle = getClientLifecycleMeta(client.lifecycleState);
          const riskFlags = normalizeClientRiskFlags(client.riskFlags).slice(
            0,
            2,
          );
          const reason = client.pausedReason ?? client.churnReason;

          return (
            <div
              key={client.id}
              className="relative grid gap-4 rounded-[24px] border border-transparent bg-background/55 px-5 py-4 transition-colors hover:border-primary/18 hover:bg-background/75 lg:grid-cols-[minmax(0,1.2fr)_180px_220px_160px] lg:items-center"
            >
              <span
                aria-hidden
                className={`absolute bottom-4 left-1 top-4 w-[2px] rounded-full ${
                  getSemanticToneClasses(
                    client.hasOverdueCheckin ||
                      client.lifecycleState === "at_risk" ||
                      riskFlags.length > 0
                      ? "danger"
                      : client.onboardingIncomplete
                        ? "warning"
                        : "neutral",
                  ).marker
                }`}
              />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {client.displayName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {client.goal || "No goal captured yet"}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Recent activity {client.recentActivityLabel}</span>
                  {reason ? <span>- {reason}</span> : null}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="inline-flex rounded-full border border-border/70 bg-background/72 px-3 py-1">
                  {client.workspaceName}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                {client.onboardingIncomplete && client.onboardingStatus ? (
                  <Badge variant="warning">
                    {client.onboardingStatus.replace(/_/g, " ")}
                  </Badge>
                ) : null}
                {client.hasOverdueCheckin ? (
                  <Badge variant="warning">
                    {client.overdueCheckinsCount} overdue
                  </Badge>
                ) : null}
                {riskFlags.map((flag) => {
                  const meta = getClientRiskFlagMeta(flag);
                  if (!meta) return null;
                  return (
                    <Badge key={flag} variant={meta.variant}>
                      {meta.shortLabel}
                    </Badge>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpen(client)}
                >
                  Open client
                  <ArrowUpRight className="h-4 w-4 [stroke-width:1.7]" />
                </Button>
              </div>
            </div>
          );
        })}
        {hasHiddenRows ? (
          <div className="flex justify-center px-3 py-2">
            <Button variant="secondary" size="sm" onClick={showMore}>
              Show {Math.min(hiddenCount, 16)} more clients
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
