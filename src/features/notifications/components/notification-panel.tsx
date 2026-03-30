import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Separator } from "../../../components/ui/separator";
import { NotificationItem } from "./notification-item";
import type { NotificationRecord } from "../lib/types";

export function NotificationPanel({
  notifications,
  isLoading,
  onNotificationClick,
  onMarkAllRead,
  markAllDisabled,
  unreadCount,
  viewAllHref,
}: {
  notifications: NotificationRecord[];
  isLoading: boolean;
  onNotificationClick: (notification: NotificationRecord) => void;
  onMarkAllRead: () => void;
  markAllDisabled: boolean;
  unreadCount: number;
  viewAllHref: string;
}) {
  const audience = viewAllHref.startsWith("/app") ? "client" : "pt";

  return (
    <div className="w-[380px] max-w-[92vw] overflow-hidden rounded-2xl border border-border/70 bg-[oklch(0.2_0.015_255)] shadow-[0_22px_56px_-32px_rgb(0_0_0/0.8)]">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <p className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 px-2 text-xs ${markAllDisabled ? "opacity-50" : ""}`}
          onClick={onMarkAllRead}
          disabled={markAllDisabled}
        >
          Mark all as read
        </Button>
      </div>

      <div className="max-h-[420px] space-y-2 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-20 rounded-2xl border border-border/60 bg-secondary/20"
              />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-secondary/14 px-4 py-10 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-secondary/30 text-muted-foreground">
              <Bell className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground">
              No notifications yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              New updates will land here as they happen.
            </p>
          </div>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              audience={audience}
              compact
              onClick={() => onNotificationClick(notification)}
            />
          ))
        )}
      </div>

      <Separator className="bg-border/70" />
      <div className="flex justify-end px-4 py-3">
        <Button asChild variant="secondary" size="sm" className="h-9">
          <Link to={viewAllHref}>View all</Link>
        </Button>
      </div>
    </div>
  );
}
