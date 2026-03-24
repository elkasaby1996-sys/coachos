import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { useAuth } from "../../../lib/auth";
import { NotificationItem } from "../components/notification-item";
import {
  useInfiniteNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "../hooks/use-notifications";
import type { NotificationFilter, NotificationRecord } from "../lib/types";

export function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const activeQuery = activeTab === "unread" ? unreadQuery : allQuery;
  const notifications = useMemo(() => {
    return activeQuery.data?.pages.flat() ?? [];
  }, [activeQuery.data?.pages]);

  const unreadCount = useMemo(() => {
    return (allQuery.data?.pages.flat() ?? []).filter((row) => !row.is_read)
      .length;
  }, [allQuery.data?.pages]);

  const handleOpenNotification = async (notification: NotificationRecord) => {
    if (!notification.is_read) {
      await markReadMutation.mutateAsync(notification.id);
    }
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Activity across clients, messages, invites, and schedule changes.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => markAllReadMutation.mutate()}
          disabled={unreadCount === 0 || markAllReadMutation.isPending}
        >
          Mark all as read
        </Button>
      </div>

      <Card className="border-border/70 bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as NotificationFilter)}
          >
            <TabsList className="mb-4 flex h-auto flex-wrap gap-2 rounded-xl bg-transparent p-0">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
            </TabsList>

            {(["all", "unread"] as NotificationFilter[]).map((filter) => {
              const query = filter === "unread" ? unreadQuery : allQuery;
              const rows = query.data?.pages.flat() ?? [];
              return (
                <TabsContent key={filter} value={filter} className="mt-0">
                  {query.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div
                          key={index}
                          className="h-24 rounded-2xl border border-border/60 bg-secondary/18"
                        />
                      ))}
                    </div>
                  ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-secondary/14 px-5 py-12 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-secondary/28 text-muted-foreground">
                        <Bell className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {filter === "unread"
                          ? "No unread notifications"
                          : "No notifications yet"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {filter === "unread"
                          ? "Everything has been reviewed."
                          : "New activity will show up here."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {rows.map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onClick={() => handleOpenNotification(notification)}
                        />
                      ))}
                      {query.hasNextPage ? (
                        <div className="flex justify-center pt-2">
                          <Button
                            variant="secondary"
                            onClick={() => query.fetchNextPage()}
                            disabled={query.isFetchingNextPage}
                          >
                            {query.isFetchingNextPage
                              ? "Loading..."
                              : "Load more"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
