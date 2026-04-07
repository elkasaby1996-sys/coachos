import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "../hooks/use-notifications";
import type { NotificationFilter, NotificationRecord } from "../lib/types";

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

export function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useSessionAuth();
  const { role } = useBootstrapAuth();
  const isClientPortal = role === "client";
  const [activeTab, setActiveTab] = useState<NotificationFilter>("all");
  const allQuery = useInfiniteNotifications({
    userId: user?.id ?? null,
    filter: "all",
  });
  const unreadQuery = useInfiniteNotifications({
    userId: user?.id ?? null,
    filter: "unread",
  });
  const markReadMutation = useMarkNotificationRead(user?.id ?? null);
  const markAllReadMutation = useMarkAllNotificationsRead(user?.id ?? null);

  const allNotifications = useMemo(() => {
    return allQuery.data?.pages.flat() ?? [];
  }, [allQuery.data?.pages]);

  const unreadCount = useMemo(() => {
    return allNotifications.filter((row) => !row.is_read).length;
  }, [allNotifications]);
  const unreadNotifications = useMemo(() => {
    return unreadQuery.data?.pages.flat() ?? [];
  }, [unreadQuery.data?.pages]);
  const notificationsError = allQuery.error ?? unreadQuery.error;
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

  const handleOpenNotification = async (notification: NotificationRecord) => {
    if (!notification.is_read) {
      await markReadMutation.mutateAsync(notification.id);
    }
    if (notification.action_url) {
      navigate(notification.action_url);
    }
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
      title="Notifications"
      description="Review client activity, coach communication, invites, and schedule changes in one notification center."
      actions={
        <Button
          variant="secondary"
          onClick={() => markAllReadMutation.mutate()}
          disabled={unreadCount === 0 || markAllReadMutation.isPending}
        >
          Mark all as read
        </Button>
      }
    />
  );

  return (
    <div className={isClientPortal ? "portal-shell-tight" : "space-y-6"}>
      {pageHeader}

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

      <SurfaceCard className={isClientPortal ? "" : "rounded-[24px]"}>
        <SurfaceCardHeader className="gap-4 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <SurfaceCardTitle className="text-xl">
                {isClientPortal ? "Recent updates" : "Notifications"}
              </SurfaceCardTitle>
              <SurfaceCardDescription>
                {isClientPortal
                  ? "Open anything that changes what you should do next."
                  : "Track the latest workspace activity and open anything that needs attention."}
              </SurfaceCardDescription>
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
              <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3 text-sm lg:min-w-[14rem]">
                <p className="font-semibold text-foreground">
                  {unreadCount > 0
                    ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
                    : allNotifications.length > 0
                      ? "Everything reviewed"
                      : "No notifications yet"}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {unreadCount > 0
                    ? "Use Unread to clear anything new first, then switch back to All for the full activity stream."
                    : allNotifications.length > 0
                      ? "Use All to revisit recent workspace activity whenever you need context."
                      : "Client, invite, and schedule activity will appear here as it happens."}
                </p>
              </div>
            )}
          </div>
        </SurfaceCardHeader>

        <SurfaceCardContent className="space-y-5">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as NotificationFilter)}
          >
            <TabsList className="grid h-auto w-full max-w-md grid-cols-1 gap-2 rounded-[var(--radius-lg)] bg-transparent p-0 sm:grid-cols-2">
              <TabsTrigger
                value="all"
                className="justify-between rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3"
              >
                <span>All</span>
                <span className="text-xs text-muted-foreground">
                  {allNotifications.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="unread"
                className="justify-between rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3"
              >
                <span>New</span>
                <span className="text-xs text-muted-foreground">
                  {unreadCount}
                </span>
              </TabsTrigger>
            </TabsList>

            {(["all", "unread"] as NotificationFilter[]).map((filter) => {
              const isUnreadFilter = filter === "unread";
              const query = isUnreadFilter ? unreadQuery : allQuery;
              const rows = isUnreadFilter ? unreadNotifications : allNotifications;
              const windowed = isUnreadFilter ? unreadWindow : allWindow;
              const visibleRows = windowed.visibleRows;
              const emptyTitle =
                filter === "unread"
                  ? "No new notifications"
                  : "No recent updates";
              const emptyDescription =
                filter === "unread"
                  ? isClientPortal
                    ? allNotifications.length > 0
                      ? "You're caught up. Switch to All to review recent updates."
                      : "New updates from your coach will show up here."
                    : "Everything has been reviewed."
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
                        filter === "unread" ? (
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
                          <NotificationItem
                            notification={notification}
                            audience="client"
                            onClick={() => handleOpenNotification(notification)}
                          />
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
                                <NotificationItem
                                  notification={notification}
                                  audience="pt"
                                  onClick={() =>
                                    handleOpenNotification(notification)
                                  }
                                />
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
