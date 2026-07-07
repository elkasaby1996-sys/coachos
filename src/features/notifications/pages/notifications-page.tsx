import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
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
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../../components/client/portal";
import {
  StaggerGroup,
  StaggerItem,
} from "../../../components/common/motion-primitives";
import {
  useInfiniteNotifications,
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationClicked,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useUnarchiveNotification,
  useUnreadNotificationCount,
  notificationsKeys,
} from "../hooks/use-notifications";
import { resolveNotificationActionUrl } from "../lib/notification-route-resolver";
import type { NotificationFilter, NotificationRecord } from "../lib/types";
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
  const [activeTab, setActiveTab] = useState<NotificationFilter>("all");
  const [inviteActionMessage, setInviteActionMessage] = useState<string | null>(
    null,
  );
  const allQuery = useInfiniteNotifications({
    userId: user?.id ?? null,
    filter: "all",
  });
  const unreadQuery = useInfiniteNotifications({
    userId: user?.id ?? null,
    filter: "unread",
  });
  const actionRequiredQuery = useInfiniteNotifications({
    userId: user?.id ?? null,
    filter: "action-required",
  });
  const archivedQuery = useInfiniteNotifications({
    userId: user?.id ?? null,
    filter: "archived",
  });
  const unreadCountQuery = useUnreadNotificationCount(user?.id ?? null);
  const markReadMutation = useMarkNotificationRead(user?.id ?? null);
  const markUnreadMutation = useMarkNotificationUnread(user?.id ?? null);
  const markClickedMutation = useMarkNotificationClicked(user?.id ?? null);
  const archiveMutation = useArchiveNotification(user?.id ?? null);
  const unarchiveMutation = useUnarchiveNotification(user?.id ?? null);
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
  const unreadNotifications = useMemo(() => {
    return unreadQuery.data?.pages.flat() ?? [];
  }, [unreadQuery.data?.pages]);
  const actionRequiredNotifications = useMemo(() => {
    return actionRequiredQuery.data?.pages.flat() ?? [];
  }, [actionRequiredQuery.data?.pages]);
  const archivedNotifications = useMemo(() => {
    return archivedQuery.data?.pages.flat() ?? [];
  }, [archivedQuery.data?.pages]);
  const notificationsError =
    allQuery.error ??
    unreadQuery.error ??
    actionRequiredQuery.error ??
    archivedQuery.error ??
    unreadCountQuery.error;
  const allWindow = useWindowedRows({
    rows: allNotifications,
    initialCount: 18,
    step: 18,
    resetKey: `all:${allNotifications.length}`,
  });
  const unreadWindow = useWindowedRows({
    rows: unreadNotifications,
    initialCount: 18,
    step: 18,
    resetKey: `unread:${unreadNotifications.length}`,
  });
  const actionRequiredWindow = useWindowedRows({
    rows: actionRequiredNotifications,
    initialCount: 18,
    step: 18,
    resetKey: `action-required:${actionRequiredNotifications.length}`,
  });
  const archivedWindow = useWindowedRows({
    rows: archivedNotifications,
    initialCount: 18,
    step: 18,
    resetKey: `archived:${archivedNotifications.length}`,
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
    const isArchived = Boolean(notification.archived_at);
    const isTeamInvite =
      audience === "pt" && isWorkspaceTeamInviteNotification(notification);
    const inviteId = notification.entity_id ?? "";
    return (
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-2",
          audience === "pt" ? "justify-end px-2 pb-2 sm:p-0" : "px-1 sm:px-0",
        )}
      >
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
          variant="secondary"
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
          size="sm"
          variant="ghost"
          onClick={() =>
            isArchived
              ? unarchiveMutation.mutate(notification.id)
              : archiveMutation.mutate(notification.id)
          }
          disabled={archiveMutation.isPending || unarchiveMutation.isPending}
        >
          {isArchived ? "Unarchive" : "Archive"}
        </Button>
      </div>
    );
  };

  const renderNotificationRow = (
    notification: NotificationRecord,
    audience: "client" | "pt",
  ) => {
    const isPtAudience = audience === "pt";

    return (
      <div
        className={cn(
          "flex flex-col gap-2 sm:flex-row sm:items-start",
          isPtAudience &&
            "rounded-2xl border border-border/70 bg-background/55 p-2 transition hover:border-border hover:bg-secondary/16 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3",
          isPtAudience &&
            !notification.is_read &&
            "border-[var(--state-info-border)] bg-[var(--state-info-bg-soft)]",
        )}
      >
        <NotificationItem
          notification={notification}
          audience={audience}
          showActionLabel={audience !== "pt"}
          showTitle={audience !== "pt"}
          showTypeLabel={audience !== "pt"}
          surface={audience === "pt" ? "embedded" : "card"}
          onClick={() => handleOpenNotification(notification)}
        />
        {renderNotificationActions(notification, audience)}
      </div>
    );
  };

  const clientStateText =
    unreadCount > 0
      ? `${unreadCount} new`
      : allNotifications.length > 0
        ? "Up to date"
        : "No updates yet";

  const pageHeader = isClientPortal ? (
    <PortalPageHeader
      title="Notifications"
      subtitle="Coach updates, plan changes, reminders, and messages in one place."
      stateText={clientStateText}
      module="settings"
      actions={
        <Button
          variant="secondary"
          className={unreadCount === 0 ? "opacity-55" : ""}
          onClick={() => markAllReadMutation.mutate()}
          disabled={unreadCount === 0 || markAllReadMutation.isPending}
        >
          Mark all as read
        </Button>
      }
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

      {isClientPortal ? (
        <StatusBanner
          variant={
            notificationsError
              ? "warning"
              : unreadCount > 0
                ? "info"
                : allNotifications.length > 0
                  ? "success"
                  : "info"
          }
          title={
            notificationsError
              ? "Notifications are partially unavailable"
              : unreadCount > 0
                ? `${unreadCount} updates need your attention`
                : allNotifications.length > 0
                  ? "You're all caught up"
                  : "No updates yet"
          }
          description={
            notificationsError
              ? notificationsError instanceof Error
                ? `${notificationsError.message} You can still review anything already loaded below.`
                : "We could not refresh every notification feed, but anything already loaded is still available below."
              : unreadCount > 0
                ? "Review anything that changes today's training, coach communication, or check-in timing."
                : allNotifications.length > 0
                  ? "You're caught up, but recent coach activity and schedule changes are still available below."
                  : "Coach updates, reminders, and schedule changes will appear here as they happen."
          }
        />
      ) : null}

      <SurfaceCard
        module="settings"
        className={isClientPortal ? "" : "rounded-[24px]"}
      >
        <SurfaceCardHeader className="gap-4 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <SurfaceCardTitle className="text-xl">
                {isClientPortal ? "Recent updates" : "Notifications"}
              </SurfaceCardTitle>
              {isClientPortal ? (
                <SurfaceCardDescription>
                  Open anything that changes what you should do next.
                </SurfaceCardDescription>
              ) : null}
            </div>
            {isClientPortal ? (
              <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3 text-sm lg:max-w-xs">
                <p className="font-semibold text-foreground">
                  {unreadCount > 0
                    ? `${unreadCount} new updates`
                    : allNotifications.length > 0
                      ? "You're all caught up"
                      : "No updates yet"}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {unreadCount > 0
                    ? "Start with anything unread, then use All to review the rest."
                    : allNotifications.length > 0
                      ? "Use All whenever you want a quick recap of recent changes."
                      : "This feed will populate as coach updates and reminders are created."}
                </p>
              </div>
            ) : (
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => markAllReadMutation.mutate()}
                disabled={unreadCount === 0 || markAllReadMutation.isPending}
              >
                Mark all as read
              </Button>
            )}
          </div>
        </SurfaceCardHeader>

        <SurfaceCardContent className="space-y-5">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as NotificationFilter)}
          >
            <TabsList className="grid h-auto w-full max-w-3xl grid-cols-1 gap-2 rounded-[var(--radius-lg)] bg-transparent p-0 sm:grid-cols-4">
              <TabsTrigger
                value="all"
                module="settings"
                className="justify-between rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3"
              >
                <span>All</span>
                <span className="text-xs text-muted-foreground">
                  {allNotifications.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="unread"
                module="settings"
                className="justify-between rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3"
              >
                <span>New</span>
                <span className="text-xs text-muted-foreground">
                  {unreadCount}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="action-required"
                module="settings"
                className="justify-between rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3"
              >
                <span>Action Required</span>
                <span className="text-xs text-muted-foreground">
                  {actionRequiredNotifications.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="archived"
                module="settings"
                className="justify-between rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3"
              >
                <span>Archived</span>
                <span className="text-xs text-muted-foreground">
                  {archivedNotifications.length}
                </span>
              </TabsTrigger>
            </TabsList>

            {(
              [
                "all",
                "unread",
                "action-required",
                "archived",
              ] as NotificationFilter[]
            ).map((filter) => {
              const isUnreadFilter = filter === "unread";
              const isActionRequiredFilter = filter === "action-required";
              const isArchivedFilter = filter === "archived";
              const query = isUnreadFilter
                ? unreadQuery
                : isActionRequiredFilter
                  ? actionRequiredQuery
                  : isArchivedFilter
                    ? archivedQuery
                    : allQuery;
              const rows = isUnreadFilter
                ? unreadNotifications
                : isActionRequiredFilter
                  ? actionRequiredNotifications
                  : isArchivedFilter
                    ? archivedNotifications
                    : allNotifications;
              const windowed = isUnreadFilter
                ? unreadWindow
                : isActionRequiredFilter
                  ? actionRequiredWindow
                  : isArchivedFilter
                    ? archivedWindow
                    : allWindow;
              const visibleRows = windowed.visibleRows;
              const emptyTitle =
                filter === "unread"
                  ? "No new notifications"
                  : filter === "action-required"
                    ? "No action required"
                    : filter === "archived"
                      ? "No archived notifications"
                      : "No recent updates";
              const emptyDescription =
                filter === "unread"
                  ? isClientPortal
                    ? allNotifications.length > 0
                      ? "You're caught up. Switch to All to review recent updates."
                      : "New updates from your coach will show up here."
                    : "Everything has been reviewed."
                  : filter === "action-required"
                    ? "High-priority or action-required updates will appear here."
                    : filter === "archived"
                      ? "Archived notifications will appear here after you file them away."
                      : isClientPortal
                        ? "Coach updates and reminders will appear here as they happen."
                        : "New activity will show up here.";

              return (
                <TabsContent key={filter} value={filter} className="mt-0">
                  {query.isLoading ? (
                    <StaggerGroup className="space-y-3" stagger={0.05}>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <StaggerItem key={index}>
                          <Skeleton className="h-28 rounded-[var(--radius-lg)] border border-border/60" />
                        </StaggerItem>
                      ))}
                    </StaggerGroup>
                  ) : rows.length === 0 ? (
                    <EmptyStateBlock
                      centered
                      icon={
                        filter === "unread" || filter === "action-required" ? (
                          <BellRing className="h-5 w-5" />
                        ) : (
                          <Bell className="h-5 w-5" />
                        )
                      }
                      title={emptyTitle}
                      description={emptyDescription}
                      actions={
                        filter === "unread" &&
                        isClientPortal &&
                        allNotifications.length > 0 ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setActiveTab("all")}
                          >
                            View all updates
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : isClientPortal ? (
                    <StaggerGroup className="space-y-3" stagger={0.04}>
                      {visibleRows.map((notification) => (
                        <StaggerItem key={notification.id}>
                          {renderNotificationRow(notification, "client")}
                        </StaggerItem>
                      ))}
                      {windowed.hasHiddenRows ? (
                        <StaggerItem className="flex justify-center pt-1">
                          <Button
                            variant="secondary"
                            onClick={windowed.showMore}
                          >
                            Show {Math.min(windowed.hiddenCount, 18)} more
                          </Button>
                        </StaggerItem>
                      ) : null}
                      {query.hasNextPage ? (
                        <StaggerItem className="flex justify-center pt-2">
                          <Button
                            variant="secondary"
                            onClick={() => query.fetchNextPage()}
                            disabled={query.isFetchingNextPage}
                          >
                            {query.isFetchingNextPage
                              ? "Loading..."
                              : "Load more"}
                          </Button>
                        </StaggerItem>
                      ) : null}
                    </StaggerGroup>
                  ) : (
                    <StaggerGroup className="space-y-5" stagger={0.06}>
                      {groupPtNotifications(visibleRows).map((group) => (
                        <StaggerItem key={group.label} className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground">
                                {group.label}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {group.rows.length} update
                                {group.rows.length > 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>
                          <StaggerGroup className="space-y-3" stagger={0.04}>
                            {group.rows.map((notification) => (
                              <StaggerItem key={notification.id}>
                                {renderNotificationRow(notification, "pt")}
                              </StaggerItem>
                            ))}
                          </StaggerGroup>
                        </StaggerItem>
                      ))}
                      {windowed.hasHiddenRows ? (
                        <StaggerItem className="flex justify-center pt-1">
                          <Button
                            variant="secondary"
                            onClick={windowed.showMore}
                          >
                            Show {Math.min(windowed.hiddenCount, 18)} more
                          </Button>
                        </StaggerItem>
                      ) : null}
                      {query.hasNextPage ? (
                        <StaggerItem className="flex justify-center pt-2">
                          <Button
                            variant="secondary"
                            onClick={() => query.fetchNextPage()}
                            disabled={query.isFetchingNextPage}
                          >
                            {query.isFetchingNextPage
                              ? "Loading..."
                              : "Load more"}
                          </Button>
                        </StaggerItem>
                      ) : null}
                    </StaggerGroup>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </SurfaceCardContent>
      </SurfaceCard>
    </div>
  );
}
