import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  Gift,
  MessageCircle,
  ShieldAlert,
  Trophy,
  UserPlus,
} from "lucide-react";
import type { NotificationRecord, NotificationType } from "./types";
import type { ModuleTone } from "../../../lib/module-tone";

export function getNotificationTypeLabel(
  type: NotificationType | string,
  audience: "client" | "pt" = "pt",
) {
  switch (type) {
    case "workout_assigned":
      return "Workout assigned";
    case "workout_updated":
      return "Workout updated";
    case "checkin_requested":
      return "Check-in requested";
    case "checkin_submitted":
      return "Check-in submitted";
    case "message_received":
      return "Message received";
    case "birthday_reminder":
      return "Birthday reminder";
    case "milestone_achieved":
      return "Milestone";
    case "client_joined_workspace":
      return audience === "client" ? "Access ready" : "Client joined";
    case "invite_accepted":
      return "Invite accepted";
    case "workout_due_today":
      return "Workout due";
    case "checkin_due_tomorrow":
      return "Check-in reminder";
    case "client_inactive":
      return audience === "client" ? "Activity reminder" : "Client inactive";
    default:
      return "Notification";
  }
}

export function getNotificationIcon(notification: NotificationRecord) {
  switch (notification.type) {
    case "workout_assigned":
    case "workout_updated":
    case "workout_due_today":
      return Dumbbell;
    case "checkin_requested":
    case "checkin_submitted":
    case "checkin_due_tomorrow":
      return ClipboardList;
    case "message_received":
      return MessageCircle;
    case "birthday_reminder":
      return Gift;
    case "milestone_achieved":
      return Trophy;
    case "client_joined_workspace":
    case "invite_accepted":
      return UserPlus;
    case "client_inactive":
      return ShieldAlert;
    case "system":
      return Bell;
    default:
      return CalendarClock;
  }
}

export function getNotificationIconClasses(notification: NotificationRecord) {
  if (!notification.is_read) {
    return "border-[var(--state-info-border)] bg-[var(--state-info-bg-soft)] text-[var(--state-info-text)]";
  }
  if (notification.priority === "high") {
    return "border-[var(--state-warning-border)] bg-[var(--state-warning-bg-soft)] text-[var(--state-warning-text)]";
  }
  return "border-border/70 bg-secondary/40 text-muted-foreground";
}

export function getNotificationModuleTone(
  notification: NotificationRecord,
): ModuleTone {
  switch (notification.type) {
    case "workout_assigned":
    case "workout_updated":
    case "message_received":
      return "coaching";
    case "checkin_requested":
    case "checkin_submitted":
    case "checkin_due_tomorrow":
    case "workout_due_today":
      return "checkins";
    case "milestone_achieved":
      return "analytics";
    case "client_joined_workspace":
    case "invite_accepted":
      return "clients";
    case "birthday_reminder":
      return "profile";
    case "client_inactive":
      return "clients";
    default:
      return "settings";
  }
}

export function sortNotifications<T extends { created_at: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
