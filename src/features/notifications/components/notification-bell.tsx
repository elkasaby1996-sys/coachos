import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { useBootstrapAuth, useSessionAuth } from "../../../lib/auth";
import { cn } from "../../../lib/utils";
import { NotificationPanel } from "./notification-panel";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationClicked,
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadNotificationCount,
} from "../hooks/use-notifications";
import { useSyncNotificationReminders } from "../hooks/use-sync-notification-reminders";
import { resolveNotificationActionUrl } from "../lib/notification-route-resolver";
import type { NotificationRecord } from "../lib/types";

export function NotificationBell({
  viewAllHref,
  buttonClassName,
  iconClassName,
}: {
  viewAllHref: string;
  buttonClassName?: string;
  iconClassName?: string;
}) {
  const navigate = useNavigate();
  const { user } = useSessionAuth();
  const { role } = useBootstrapAuth();
  const [open, setOpen] = useState(false);
  const notificationsQuery = useNotificationsList({
    userId: user?.id ?? null,
    limit: 8,
  });
  const unreadCountQuery = useUnreadNotificationCount(user?.id ?? null);
  const markReadMutation = useMarkNotificationRead(user?.id ?? null);
  const markClickedMutation = useMarkNotificationClicked(user?.id ?? null);
  const markAllReadMutation = useMarkAllNotificationsRead(user?.id ?? null);

  useSyncNotificationReminders({
    userId: user?.id ?? null,
    role,
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadCountQuery.data ?? 0;

  const handleNotificationClick = async (notification: NotificationRecord) => {
    const audience = role === "client" ? "client" : "pt";
    const target = resolveNotificationActionUrl(notification, audience);
    await (notification.action_url
      ? markClickedMutation.mutateAsync(notification.id)
      : !notification.is_read
        ? markReadMutation.mutateAsync(notification.id)
        : Promise.resolve(null));
    setOpen(false);
    navigate(target);
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative", buttonClassName)}
            aria-label="Notifications"
          >
            <Bell className={cn("h-4 w-4", iconClassName)} />
            {unreadCount > 0 ? (
              <>
                <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-accent" />
                <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              </>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          variant="panel"
          align="end"
          sideOffset={10}
          className="w-[380px] max-w-[92vw]"
        >
          <NotificationPanel
            notifications={notifications}
            isLoading={notificationsQuery.isLoading}
            unreadCount={unreadCount}
            viewAllHref={viewAllHref}
            onNotificationClick={handleNotificationClick}
            onMarkAllRead={() => markAllReadMutation.mutate()}
            markAllDisabled={unreadCount === 0 || markAllReadMutation.isPending}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
