import { ButtonHTMLAttributes } from "react";
import { ChevronRight } from "lucide-react";
import { formatRelativeTime } from "../../../lib/relative-time";
import { cn } from "../../../lib/utils";
import {
  getNotificationIcon,
  getNotificationIconClasses,
  getNotificationModuleTone,
  getNotificationTypeLabel,
} from "../lib/notification-utils";
import type { NotificationRecord } from "../lib/types";
import {
  getModuleToneClasses,
  getModuleToneStyle,
} from "../../../lib/module-tone";

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
  const module = getNotificationModuleTone(notification);
  const moduleClasses = getModuleToneClasses(module);

  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        notification.is_read
          ? "border-border/60 bg-secondary/16 hover:border-border hover:bg-secondary/24"
          : "border-[var(--state-info-border)] bg-[var(--state-info-bg-soft)] shadow-[0_18px_40px_-34px_color-mix(in_oklab,var(--state-info-bg-soft)_88%,transparent)] hover:border-[var(--state-info-border)] hover:bg-[var(--state-info-bg-soft)]",
        compact ? "rounded-xl px-3 py-2.5" : "px-4 py-4",
        className,
      )}
      style={getModuleToneStyle(module)}
      {...props}
    >
      <div
        className={cn(
          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
          getNotificationIconClasses(notification),
          moduleClasses.iconBadge,
          compact ? "h-9 w-9 rounded-lg" : "",
        )}
      >
        <Icon className={cn("h-4 w-4", moduleClasses.title)} />
      </div>
      <div
        className={cn("min-w-0 flex-1", compact ? "space-y-1.5" : "space-y-2")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-xs font-medium", moduleClasses.text)}>
            {typeLabel}
          </span>
          {notification.priority === "high" ? (
            <span className="rounded-full border border-[var(--state-warning-border)] bg-[var(--state-warning-bg-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--state-warning-text)]">
              High priority
            </span>
          ) : null}
          {!notification.is_read ? (
            <span className="rounded-full border border-[var(--state-info-border)] bg-[var(--state-info-bg-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--state-info-text)]">
              New
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0 space-y-1">
            <p className="line-clamp-1 text-sm font-semibold text-foreground">
              {notification.title}
            </p>
            {!compact ? (
              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                {notification.body}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 sm:pl-2">
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
        {!compact ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{hasAction ? "Open update" : "For reference"}</span>
          </div>
        ) : null}
      </div>
    </button>
  );
}
