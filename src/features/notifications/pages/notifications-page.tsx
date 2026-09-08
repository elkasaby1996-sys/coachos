import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { useBootstrapAuth, useSessionAuth } from "../../../lib/auth";
import { useWindowedRows } from "../../../hooks/use-windowed-rows";
import { WorkspacePageHeader } from "../../../components/pt/workspace-page-header";
import { NotificationItem } from "../components/notification-item";
import {
  EmptyStateBlock,
  PortalPageHeader,
  StatusBanner,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../../components/client/portal";
import {
  useInfiniteNotifications,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationClicked,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useUnreadNotificationCount,
  notificationsKeys,
} from "../hooks/use-notifications";
import { resolveNotificationActionUrl } from "../lib/notification-route-resolver";
import type { NotificationRecord } from "../lib/types";
import { declineWorkspaceTeamInvite } from "../../workspace-team/invite-api";
import { cn } from "../../../lib/utils";

const getPtNotificationPeriodLabel = (createdAt: string) => {
  const created = new Date(createdAt);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  if (created >= startOfToday) return "Today";
  if (created >= startOfYesterday) return "Yesterday";
  if (created >= startOfWeek) return "Last 7 days";
  return "Earlier";
};

const groupPtNotifications = (rows: NotificationRecord[]) => {
  const groups = new Map<string, NotificationRecord[]>();
  rows.forEach((row) => {
    const key = getPtNotificationPeriodLabel(row.created_at);
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  });
  return ["Today", "Yesterday", "Last 7 days", "Earlier"]
    .map((label) => ({
      label,
      rows: groups.get(label) ?? [],
    }))
    .filter((group) => group.rows.length > 0);
};

function isWorkspaceTeamInviteNotification(notification: NotificationRecord) {
  return (
    notification.type === "team_invite_received" &&
    notification.entity_type === "workspace_member_invite" &&
    Boolean(notification.entity_id)
  );
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSessionAuth();
  const { role } = useBootstrapAuth();
  const isClientPortal = role === "client";
  const [inviteActionMessage, setInviteActionMessage] = useState<string | null>(
    null,
  );
  const allQuery = useInfiniteNotifications({
    userId: user?.id ?? null,
    filter: "all",
  });
  const unreadCountQuery = useUnreadNotificationCount(user?.id ?? null);
  const markReadMutation = useMarkNotificationRead(user?.id ?? null);
  const markUnreadMutation = useMarkNotificationUnread(user?.id ?? null);
  const markClickedMutation = useMarkNotificationClicked(user?.id ?? null);
  const deleteMutation = useDeleteNotification(user?.id ?? null);
  const markAllReadMutation = useMarkAllNotificationsRead(user?.id ?? null);
  const declineInviteMutation = useMutation({
    mutationFn: declineWorkspaceTeamInvite,
    onSuccess: async () => {
      setInviteActionMessage("Invite declined.");
      if (user?.id) {
        await queryClient.invalidateQueries({
          queryKey: notificationsKeys.infiniteRoot(user.id),
        });
        await queryClient.invalidateQueries({
          queryKey: notificationsKeys.unreadCount(user.id),
        });
      }
    },
    onError: (error) => {
      setInviteActionMessage(
        error instanceof Error ? error.message : "Unable to decline invite.",
      );
    },
  });

  const allNotifications = useMemo(() => {
    return allQuery.data?.pages.flat() ?? [];
  }, [allQuery.data?.pages]);

  const unreadCount = unreadCountQuery.data ?? 0;
  const notificationsError = allQuery.error ?? unreadCountQuery.error;
  const actionError =
    deleteMutation.error ??
    markReadMutation.error ??
    markUnreadMutation.error ??
    markAllReadMutation.error ??
    markClickedMutation.error;
  const allWindow = useWindowedRows({
    rows: allNotifications,
    initialCount: 18,
    step: 18,
    resetKey: `all:${allNotifications.length}`,
  });
  const handleOpenNotification = async (notification: NotificationRecord) => {
    const audience = isClientPortal ? "client" : "pt";
    const target = resolveNotificationActionUrl(notification, audience);
    await (notification.action_url
      ? markClickedMutation.mutateAsync(notification.id)
      : !notification.is_read
        ? markReadMutation.mutateAsync(notification.id)
        : Promise.resolve(null));
    navigate(target);
  };

  const openInviteNotification = async (notification: NotificationRecord) => {
    const inviteRoute = resolveNotificationActionUrl(notification, "pt");
    await markClickedMutation.mutateAsync(notification.id);
    navigate(inviteRoute);
  };

  const renderNotificationActions = (
    notification: NotificationRecord,
    audience: "client" | "pt",
  ) => {
    const isTeamInvite =
      audience === "pt" && isWorkspaceTeamInviteNotification(notification);
    const inviteId = notification.entity_id ?? "";
    return (
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-2 pb-2 sm:p-0">
        {isTeamInvite ? (
          <>
            <Button
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                void openInviteNotification(notification);
              }}
              disabled={markClickedMutation.isPending}
            >
              Open invitation
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                declineInviteMutation.mutate(inviteId);
              }}
              disabled={declineInviteMutation.isPending}
            >
              {declineInviteMutation.isPending ? "Declining..." : "Decline"}
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant={audience === "client" ? "ghost" : "secondary"}
          className="w-28"
          onClick={() =>
            notification.is_read
              ? markUnreadMutation.mutate(notification.id)
              : markReadMutation.mutate(notification.id)
          }
          disabled={markReadMutation.isPending || markUnreadMutation.isPending}
        >
          {notification.is_read ? "Mark unread" : "Mark read"}
        </Button>
        <Button
          size={audience === "client" ? "icon" : "sm"}
          variant="ghost"
          onClick={() => deleteMutation.mutate(notification.id)}
          disabled={deleteMutation.isPending}
          aria-label="Delete notification"
          title="Delete notification"
          className="text-muted-foreground hover:text-danger"
        >
          {audience === "client" ? (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            "Delete"
          )}
        </Button>
      </div>
    );
  };

  const renderNotificationRow = (
    notification: NotificationRecord,
    audience: "client" | "pt",
  ) => {
    return (
      <div
        data-notification-id={notification.id}
        data-unread={!notification.is_read}
        className={cn(
          "flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/55 p-2 transition hover:border-border hover:bg-secondary/16 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3",
          !notification.is_read &&
            "border-[var(--state-info-border)] bg-[var(--state-info-bg-soft)]",
          audience === "client" && "client-notification-row",
        )}
      >
        <NotificationItem
          notification={notification}
          audience={audience}
          showActionLabel={audience !== "pt"}
          showTitle
          showTypeLabel
          surface="embedded"
          onClick={() => handleOpenNotification(notification)}
        />
        {renderNotificationActions(notification, audience)}
      </div>
    );
  };

  const clientStateText = unreadCount > 0 ? `${unreadCount} new` : "Up to date";

  const pageHeader = isClientPortal ? (
    <PortalPageHeader
      title="Notifications"
      subtitle="Coach updates, plan changes, reminders, and messages in one place."
      stateText={clientStateText}
      module="settings"
    />
  ) : (
    <WorkspacePageHeader
      module="settings"
      title="Notifications"
      description="Review client activity, coach communication, invites, and schedule changes in one notification center."
    />
  );

  return (
    <div className={isClientPortal ? "portal-shell-tight" : "space-y-6"}>
      {pageHeader}

      {!isClientPortal && inviteActionMessage ? (
        <StatusBanner
          variant={
            inviteActionMessage === "Invite declined." ? "success" : "warning"
          }
          title={inviteActionMessage}
          description="Workspace invitations open on the secure invite page."
        />
      ) : null}

      {notificationsError ? (
        <StatusBanner
          variant="warning"
          title="Notifications are partially unavailable"
          description={
            notificationsError instanceof Error
              ? `${notificationsError.message} You can still review anything already loaded below.`
              : "We could not refresh every notification feed, but anything already loaded is still available below."
          }
        />
      ) : null}

      <SurfaceCard
        module="settings"
        className={isClientPortal ? "" : "rounded-[var(--ui-radius-card)]"}
      >
        {isClientPortal ? (
          <SurfaceCardHeader className="items-end pb-2">
            <Button
              variant="secondary"
              className={unreadCount === 0 ? "opacity-55" : ""}
              onClick={() => markAllReadMutation.mutate()}
              disabled={unreadCount === 0 || markAllReadMutation.isPending}
            >
              Mark all as read
            </Button>
          </SurfaceCardHeader>
        ) : (
          <SurfaceCardHeader className="gap-4 pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <SurfaceCardTitle className="text-xl">
                Notifications
              </SurfaceCardTitle>
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => markAllReadMutation.mutate()}
                disabled={unreadCount === 0 || markAllReadMutation.isPending}
              >
                Mark all as read
              </Button>
            </div>
          </SurfaceCardHeader>
        )}

        <SurfaceCardContent className="space-y-5">
          {actionError ? (
            <StatusBanner
              variant="warning"
              title="Unable to update notification"
              description={actionError.message || "Please try again."}
            />
          ) : null}
          {allQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-2xl" />
              ))}
            </div>
          ) : !allNotifications.length ? (
            <EmptyStateBlock
              centered
              icon={<Bell className="h-5 w-5" />}
              title="No recent updates"
            />
          ) : (
            <div className="space-y-5">
              {(isClientPortal
                ? [{ label: "Recent updates", rows: allWindow.visibleRows }]
                : groupPtNotifications(allWindow.visibleRows)
              ).map((group) => (
                <section
                  key={group.label}
                  className="space-y-3"
                  aria-label={group.label}
                >
                  <h2 className="text-sm font-semibold text-foreground">
                    {group.label}
                  </h2>
                  <div className="space-y-3">
                    {group.rows.map((notification) => (
                      <div key={notification.id}>
                        {renderNotificationRow(
                          notification,
                          isClientPortal ? "client" : "pt",
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {allWindow.hasHiddenRows ? (
                <div className="flex justify-center">
                  <Button variant="secondary" onClick={allWindow.showMore}>
                    Show {Math.min(allWindow.hiddenCount, 18)} more
                  </Button>
                </div>
              ) : null}
              {allQuery.hasNextPage ? (
                <div className="flex justify-center">
                  <Button
                    variant="secondary"
                    onClick={() => allQuery.fetchNextPage()}
                    disabled={allQuery.isFetchingNextPage}
                  >
                    {allQuery.isFetchingNextPage ? "Loading..." : "Load more"}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </SurfaceCardContent>
      </SurfaceCard>
    </div>
  );
}
