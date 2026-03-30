import { ButtonHTMLAttributes } from "react";
import { ChevronRight } from "lucide-react";
import { formatRelativeTime } from "../../../lib/relative-time";
import { cn } from "../../../lib/utils";
import {
  getNotificationIcon,
  getNotificationIconClasses,
  getNotificationTypeLabel,
} from "../lib/notification-utils";
import type { NotificationRecord } from "../lib/types";

type NotificationItemProps = {
  notification: NotificationRecord;
  compact?: boolean;
  audience?: "client" | "pt";
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function NotificationItem({
  notification,
  className,
  compact = false,
  audience = "pt",
  ...props
}: NotificationItemProps) {
  const Icon = getNotificationIcon(notification);
  const typeLabel = getNotificationTypeLabel(notification.type, audience);
  const hasAction = Boolean(notification.action_url);

  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
        notification.is_read
          ? "border-border/60 bg-secondary/16 hover:border-border hover:bg-secondary/24"
          : "border-primary/24 bg-primary/[0.07] shadow-[0_18px_40px_-34px_rgba(56,189,248,0.75)] hover:border-primary/38 hover:bg-primary/[0.1]",
        compact ? "rounded-xl px-3 py-2.5" : "px-4 py-4",
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
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium tracking-[0.04em] text-muted-foreground">
            {typeLabel}
          </span>
          {notification.priority === "high" ? (
            <span className="rounded-full border border-warning/30 bg-warning/12 px-2 py-0.5 text-[11px] font-medium text-warning">
              Priority
            </span>
          ) : null}
          {!notification.is_read ? (
            <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Unread
            </span>
          ) : null}
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="line-clamp-1 text-sm font-semibold text-foreground">
              {notification.title}
            </p>
            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
              {notification.body}
            </p>
          </div>
          <div className="flex items-center gap-2 pl-2">
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(notification.created_at)}
            </span>
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground",
                !hasAction && "opacity-50",
              )}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{hasAction ? "Open details" : "No action required"}</span>
          {!notification.is_read ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-primary" />
              New
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
