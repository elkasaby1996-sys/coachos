import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert";
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
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadNotificationCount,
} from "../hooks/use-notifications";
import { useNotificationRealtime } from "../hooks/use-notification-realtime";
import { useSyncNotificationReminders } from "../hooks/use-sync-notification-reminders";
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
  const [toastNotification, setToastNotification] =
    useState<NotificationRecord | null>(null);
  const reduceMotion = useReducedMotion();
  const notificationsQuery = useNotificationsList({
    userId: user?.id ?? null,
    limit: 8,
  });
  const unreadCountQuery = useUnreadNotificationCount(user?.id ?? null);
  const markReadMutation = useMarkNotificationRead(user?.id ?? null);
  const markAllReadMutation = useMarkAllNotificationsRead(user?.id ?? null);

  useSyncNotificationReminders({
    userId: user?.id ?? null,
    role,
  });

  useNotificationRealtime({
    userId: user?.id ?? null,
    onHighPriority: (notification) => setToastNotification(notification),
  });

  useEffect(() => {
    if (!toastNotification) return;
    const timeout = window.setTimeout(() => setToastNotification(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toastNotification]);

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadCountQuery.data ?? 0;

  const handleNotificationClick = async (notification: NotificationRecord) => {
    if (!notification.is_read) {
      await markReadMutation.mutateAsync(notification.id);
    }
    setOpen(false);
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  return (
    <>
      <AnimatePresence>
        {toastNotification ? (
          <motion.div
            initial={
              reduceMotion ? { opacity: 1 } : { opacity: 0, y: -18, scale: 0.98 }
            }
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }
            }
            transition={{ duration: reduceMotion ? 0.16 : 0.24, ease: "easeOut" }}
            className="fixed right-4 top-4 z-[70]"
          >
            <Alert className="w-[360px] max-w-[calc(100vw-2rem)] border-warning/30 bg-[oklch(0.2_0.02_255)] shadow-[0_20px_44px_-28px_rgb(0_0_0/0.85)]">
              <AlertTitle>{toastNotification.title}</AlertTitle>
              <AlertDescription>{toastNotification.body}</AlertDescription>
            </Alert>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
