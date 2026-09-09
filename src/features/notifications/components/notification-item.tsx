import { ButtonHTMLAttributes } from "react";
import { ChevronRight } from "../../../lib/icons";
import { formatRelativeTime } from "../../../lib/relative-time";
import { cn } from "../../../lib/utils";
import {
  getNotificationIcon,
  getNotificationModuleTone,
  getNotificationSource,
  getNotificationTitle,
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
  showActionLabel?: boolean;
  showTitle?: boolean;
  showTypeLabel?: boolean;
  surface?: "card" | "embedded";
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function NotificationItem({
  notification,
  className,
  compact = false,
  audience = "pt",
  showActionLabel = true,
  showTitle = true,
  showTypeLabel = true,
  surface = "card",
  ...props
}: NotificationItemProps) {
  const Icon = getNotificationIcon(notification);
  const typeLabel = getNotificationTypeLabel(notification.type, audience);
  const source = getNotificationSource(notification);
  const title = getNotificationTitle(notification, audience);
  const body = notification.body.trim();
  const hasAction = Boolean(notification.action_url);
  const module = getNotificationModuleTone(notification);
  const moduleClasses = getModuleToneClasses(module);
  if (compact && audience === "client") {
    const previewTitle = title || typeLabel;
    return (
      <button
        type="button"
        data-notification-read={notification.is_read}
        className={cn("client-notification-preview", className)}
        {...props}
      >
        <span className="client-notification-preview-icon">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-5 text-foreground">
              {previewTitle}
            </span>
            {!notification.is_read ? (
              <span className="client-notification-unread-dot">
                <span className="sr-only">Unread</span>
              </span>
            ) : null}
          </span>
          {body && body !== previewTitle ? (
            <span className="mt-1 line-clamp-2 break-words text-[13px] leading-5 text-muted-foreground">
              {body}
            </span>
          ) : null}
          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {source !== "Sender unavailable" ? <span>{source}</span> : null}
            {source !== "Sender unavailable" ? (
              <span aria-hidden="true">·</span>
            ) : null}
            <time dateTime={notification.created_at}>
              {formatRelativeTime(notification.created_at)}
            </time>
            {notification.priority === "high" ? (
              <span className="text-[var(--state-warning-text)]">
                High priority
              </span>
            ) : null}
          </span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      data-notification-read={notification.is_read}
      className={cn(
        "group grid w-full min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_7.5rem]",
        surface === "card"
          ? cn(
              "rounded-2xl border px-3 py-3",
              notification.is_read
                ? "border-border/60 bg-secondary/16 hover:border-border hover:bg-secondary/24"
                : "border-[var(--state-info-border)] bg-[var(--state-info-bg-soft)]",
              compact ? "px-3 py-2.5" : "px-4 py-4",
            )
          : "rounded-xl border border-transparent bg-transparent px-2 py-2 hover:bg-secondary/20",
        className,
      )}
      style={getModuleToneStyle(module)}
      {...props}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
        <Icon
          aria-hidden="true"
          className={cn("h-4 w-4", moduleClasses.title)}
        />
      </span>
      <span className="min-w-0 space-y-1">
        <span className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-words text-sm font-semibold text-foreground">
            {source}
          </span>
          {showTypeLabel ? (
            <span className={cn("text-xs font-medium", moduleClasses.text)}>
              {typeLabel}
            </span>
          ) : null}
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
        </span>
        {audience === "client" &&
        showTitle &&
        title !== typeLabel &&
        !title.toLowerCase().includes(source.toLowerCase()) ? (
          <span className="block text-sm font-semibold text-foreground">
            {title}
          </span>
        ) : null}
        <span
          className={cn(
            "block break-words text-sm leading-6",
            compact ? "line-clamp-1" : "line-clamp-2",
            showTitle ? "text-muted-foreground" : "font-medium text-foreground",
          )}
        >
          {body || title}
        </span>
        {!compact && showActionLabel ? (
          <span className="block text-xs text-muted-foreground">
            {hasAction
              ? notification.entity_type === "assigned_workout"
                ? notification.metadata?.day_type === "rest"
                  ? "View rest day"
                  : "View assignment"
                : (notification.action_label ?? "Open update")
              : "For reference"}
          </span>
        ) : null}
      </span>
      <span className="col-start-2 flex items-center gap-2 sm:col-start-3 sm:row-start-1 sm:justify-end">
        <time
          dateTime={notification.created_at}
          className="whitespace-nowrap text-xs text-muted-foreground"
        >
          {formatRelativeTime(notification.created_at)}
        </time>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground",
            !hasAction && "opacity-50",
          )}
        />
      </span>
    </button>
  );
}
