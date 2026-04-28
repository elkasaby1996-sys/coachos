import { ArrowUpRight } from "lucide-react";
import {
  getClientRiskState,
  getClientRiskFlagMeta,
  isClientAtRisk,
  normalizeClientRiskFlags,
} from "../../../lib/client-lifecycle";
import { Button } from "../../../components/ui/button";
import {
  LifecycleBadge,
  RiskBadge,
  TagInfoBadge,
} from "../../../components/ui/coachos/status-pill";
import { useWindowedRows } from "../../../hooks/use-windowed-rows";
import { getSemanticToneClasses } from "../../../lib/semantic-status";
import { useI18n } from "../../../lib/i18n";
import type { PTClientSummary } from "../types";

const statusBadgePriority: Record<string, number> = {
  risk: 0,
  low_adherence_trend: 1,
  missed_checkins: 2,
  overdue_checkins: 2,
  no_recent_reply: 3,
  onboarding: 4,
  inactive_client: 5,
  lifecycle: 10,
};

export function PtHubClientTable({
  clients,
  onOpen,
  showWorkspaceColumn = true,
}: {
  clients: PTClientSummary[];
  onOpen: (client: PTClientSummary) => void;
  showWorkspaceColumn?: boolean;
}) {
  const { t } = useI18n();
  const { visibleRows, hasHiddenRows, hiddenCount, showMore } = useWindowedRows(
    {
      rows: clients,
      initialCount: 16,
      step: 16,
      resetKey: clients.length,
    },
  );

  return (
    <div className="space-y-2 rounded-[30px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.82),oklch(var(--bg-surface)/0.74))] p-2">
      <div
        className={`hidden gap-4 rounded-[22px] border border-border/60 bg-background/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:grid ${
          showWorkspaceColumn
            ? "lg:grid-cols-[minmax(220px,1.35fr)_180px_minmax(270px,0.85fr)_150px]"
            : "lg:grid-cols-[minmax(320px,1fr)_minmax(270px,0.75fr)_150px]"
        }`}
      >
        <span>{t("ptHub.clients.table.client", "Client")}</span>
        {showWorkspaceColumn ? (
          <span>
            {t("ptHub.clients.table.coachingSpace", "Coaching space")}
          </span>
        ) : null}
        <span>{t("ptHub.clients.table.lifecycle", "Lifecycle")}</span>
        <span className="text-right">
          {t("ptHub.clients.table.action", "Action")}
        </span>
      </div>
      <div className="space-y-2">
        {visibleRows.map((client) => {
          const riskFlags = normalizeClientRiskFlags(client.riskFlags);
          const riskState = getClientRiskState(client);
          const clientAtRisk = isClientAtRisk(client);
          const reason = client.pausedReason ?? client.churnReason;
          const statusBadges = [
            {
              key: "lifecycle",
              priority: statusBadgePriority.lifecycle,
              element: (
                <LifecycleBadge lifecycleState={client.lifecycleState} />
              ),
            },
            ...(clientAtRisk
              ? [
                  {
                    key: "risk",
                    priority: statusBadgePriority.risk,
                    element: <RiskBadge riskState={riskState} />,
                  },
                ]
              : []),
            ...(client.onboardingIncomplete && client.onboardingStatus
              ? [
                  {
                    key: "onboarding",
                    priority: statusBadgePriority.onboarding,
                    element: (
                      <TagInfoBadge
                        label={client.onboardingStatus.replace(/_/g, " ")}
                        variant="warning"
                        title={t(
                          "ptHub.clients.table.onboardingStatus",
                          "Onboarding status",
                        )}
                        description={t(
                          "ptHub.clients.table.onboardingStatusDescription",
                          "This client still has onboarding work pending before coaching is fully settled.",
                        )}
                      />
                    ),
                  },
                ]
              : []),
            ...(client.hasOverdueCheckin
              ? [
                  {
                    key: "overdue_checkins",
                    priority: statusBadgePriority.overdue_checkins,
                    element: (
                      <TagInfoBadge
                        label={`${client.overdueCheckinsCount} ${t("ptHub.clients.table.overdue", "overdue")}`}
                        variant="warning"
                        title={t(
                          "ptHub.clients.table.overdueCheckins",
                          "Overdue check-ins",
                        )}
                        description={t(
                          "ptHub.clients.table.overdueCheckinsDescription",
                          "One or more scheduled check-ins still need a submission or review.",
                        )}
                      />
                    ),
                  },
                ]
              : []),
            ...riskFlags.flatMap((flag) => {
              const meta = getClientRiskFlagMeta(flag);
              if (!meta) return [];
              return [
                {
                  key: flag,
                  priority: statusBadgePriority[flag] ?? 9,
                  element: (
                    <TagInfoBadge
                      label={meta.shortLabel}
                      variant={meta.variant}
                      title={meta.label}
                      description={meta.description}
                    />
                  ),
                },
              ];
            }),
          ]
            .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
            .slice(0, 2);

          return (
            <div
              key={client.id}
              className={`relative grid gap-3 rounded-[20px] border border-transparent bg-background/55 px-5 py-3 transition-colors hover:border-primary/18 hover:bg-background/75 lg:items-center lg:gap-4 ${
                showWorkspaceColumn
                  ? "lg:grid-cols-[minmax(220px,1.35fr)_180px_minmax(270px,0.85fr)_150px]"
                  : "lg:grid-cols-[minmax(320px,1fr)_minmax(270px,0.75fr)_150px]"
              }`}
            >
              <span
                aria-hidden
                className={`absolute bottom-3 left-1 top-3 w-[2px] rounded-full ${
                  getSemanticToneClasses(
                    client.hasOverdueCheckin || clientAtRisk
                      ? "danger"
                      : client.onboardingIncomplete
                        ? "warning"
                        : "neutral",
                  ).marker
                }`}
              />
              <div className="space-y-1 lg:flex lg:min-w-0 lg:items-center lg:gap-3 lg:space-y-0">
                <p className="text-sm font-medium text-foreground">
                  {client.displayName}
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground lg:flex-nowrap">
                  <span className="whitespace-nowrap">
                    {t("ptHub.clients.table.recentActivity", "Recent activity")}{" "}
                    {client.recentActivityLabel}
                  </span>
                  {reason ? (
                    <span className="min-w-0 truncate">- {reason}</span>
                  ) : null}
                </div>
              </div>
              {showWorkspaceColumn ? (
                <div className="text-sm text-muted-foreground">
                  <span className="inline-flex rounded-full border border-border/70 bg-background/72 px-3 py-1">
                    {client.workspaceName}
                  </span>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
                {statusBadges.map((badge) => (
                  <span key={badge.key} className="contents">
                    {badge.element}
                  </span>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpen(client)}
                >
                  {t("ptHub.clients.table.openClient", "Open client")}
                  <ArrowUpRight className="h-4 w-4 text-[var(--module-clients-text)] [stroke-width:1.7]" />
                </Button>
              </div>
            </div>
          );
        })}
        {hasHiddenRows ? (
          <div className="flex justify-center px-3 py-2">
            <Button variant="secondary" size="sm" onClick={showMore}>
              {t("ptHub.clients.table.showMore", "Show")}{" "}
              {Math.min(hiddenCount, 16)}{" "}
              {t("ptHub.clients.table.moreClients", "more clients")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
