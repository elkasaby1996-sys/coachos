import { ButtonHTMLAttributes } from "react";
import { formatRelativeTime } from "../../../lib/relative-time";
import { cn } from "../../../lib/utils";
import {
  getNotificationIcon,
  getNotificationIconClasses,
} from "../lib/notification-utils";
import type { NotificationRecord } from "../lib/types";

type NotificationItemProps = {
  notification: NotificationRecord;
  compact?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function NotificationItem({
  notification,
  className,
  compact = false,
  ...props
}: NotificationItemProps) {
  const Icon = getNotificationIcon(notification);

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
        notification.is_read
          ? "border-border/60 bg-secondary/18 hover:border-border hover:bg-secondary/26"
          : "border-primary/18 bg-primary/[0.06] hover:border-primary/30 hover:bg-primary/[0.09]",
        compact ? "rounded-xl px-3 py-2.5" : "",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
          getNotificationIconClasses(notification),
          compact ? "h-9 w-9 rounded-lg" : "",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <p className="line-clamp-1 text-sm font-medium text-foreground">
            {notification.title}
          </p>
          <div className="flex items-center gap-2">
            {!notification.is_read ? (
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
            ) : null}
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatRelativeTime(notification.created_at)}
            </span>
          </div>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {notification.body}
        </p>
      </div>
    </button>
  );
}
