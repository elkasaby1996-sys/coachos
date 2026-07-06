import { ArrowUpRight } from "lucide-react";
import type { BadgeVariant } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { TagInfoBadge } from "../../../components/ui/coachos/status-pill";
import { useWindowedRows } from "../../../hooks/use-windowed-rows";
import {
  getClientGlobalStatusDisplay,
  type ClientAttentionReason,
  type ClientStatusBadgeDisplay,
  type StatusTone,
} from "../../../lib/client-status-display";
import { getSemanticToneClasses } from "../../../lib/semantic-status";
import { useI18n } from "../../../lib/i18n-context";
import type { PTClientSummary } from "../types";

const toneBadgeVariant: Record<StatusTone, BadgeVariant> = {
  neutral: "neutral",
  muted: "muted",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

function getBadgeTitle(badge: ClientStatusBadgeDisplay) {
  if (badge.kind === "relationship") {
    return badge.key === "relationship:transferred_out"
      ? "Transferred-out relationship"
      : `${badge.label} relationship`;
  }

  if (badge.kind === "lifecycle") {
    return `${badge.label} lifecycle`;
  }

  return "Needs attention";
}

function getAttentionDescription(
  badge: ClientStatusBadgeDisplay,
  attentionReasons: ClientAttentionReason[],
) {
  if (badge.kind !== "attention") {
    return badge.description ?? badge.label;
  }

  if (attentionReasons.length === 0) {
    return (
      badge.description ??
      "Attention signal detected, but the reason could not be resolved."
    );
  }

  return badge.description ?? attentionReasons.map((reason) => reason.label).join(", ");
}

function isNonInteractiveLifecycleBadge(badge: ClientStatusBadgeDisplay) {
  return badge.kind === "lifecycle" && badge.key === "lifecycle:active";
}

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
        className={`hidden gap-4 rounded-[22px] border border-border/60 bg-background/60 px-5 py-3 text-xs font-semibold normal-case tracking-normal text-muted-foreground lg:grid ${
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
        <span aria-hidden="true" />
      </div>
      <div className="space-y-2">
        {visibleRows.map((client) => {
          const reason = client.pausedReason ?? client.churnReason;
          const statusDisplay = getClientGlobalStatusDisplay(client);
          const hasAttention = Boolean(statusDisplay.attentionBadge);

          return (
            <div
              key={client.id}
              className={`grid gap-3 rounded-[20px] border border-transparent bg-background/55 px-4 py-3 transition-colors hover:border-primary/18 hover:bg-background/75 lg:items-center lg:gap-4 ${
                showWorkspaceColumn
                  ? "lg:grid-cols-[minmax(220px,1.35fr)_180px_minmax(270px,0.85fr)_150px]"
                  : "lg:grid-cols-[minmax(320px,1fr)_minmax(270px,0.75fr)_150px]"
              }`}
            >
              <div className="space-y-1 lg:flex lg:min-w-0 lg:items-center lg:gap-3 lg:space-y-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className={`pt-hub-row-status-dot ${
                      getSemanticToneClasses(
                        hasAttention
                          ? "danger"
                          : client.onboardingIncomplete
                            ? "warning"
                            : "neutral",
                      ).marker
                    }`}
                  />
                  <p className="min-w-0 truncate text-sm font-medium text-foreground">
                    {client.displayName}
                  </p>
                </div>
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
                {statusDisplay.globalBadges.map((badge) => (
                  <span key={badge.key} className="contents">
                    <TagInfoBadge
                      label={badge.label}
                      variant={toneBadgeVariant[badge.tone]}
                      title={getBadgeTitle(badge)}
                      description={getAttentionDescription(
                        badge,
                        statusDisplay.attentionReasons,
                      )}
                      disabled={isNonInteractiveLifecycleBadge(badge)}
                    />
                  </span>
                ))}
              </div>
              <div className="flex justify-stretch lg:justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10 w-full rounded-2xl p-0 sm:w-10"
                  onClick={() => onOpen(client)}
                  aria-label={t(
                    "ptHub.clients.table.openClientAria",
                    `Open ${client.displayName}`,
                  )}
                >
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
