export const notificationTypes = [
  "workout_assigned",
  "workout_updated",
  "checkin_requested",
  "checkin_submitted",
  "message_received",
  "birthday_reminder",
  "milestone_achieved",
  "client_joined_workspace",
  "invite_accepted",
  "workout_due_today",
  "checkin_due_tomorrow",
  "client_inactive",
  "system",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export type NotificationCategory =
  | "general"
  | "workouts"
  | "checkins"
  | "messages"
  | "system";

export type NotificationPriority = "low" | "normal" | "high";

export type NotificationMetadata = Record<string, unknown>;

export type NotificationRecord = {
  id: string;
  recipient_user_id: string;
  type: NotificationType;
  category: NotificationCategory | string;
  priority: NotificationPriority | string;
  title: string;
  body: string;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  image_url: string | null;
  metadata: NotificationMetadata;
  is_read: boolean;
  read_at: string | null;
  delivery_in_app: boolean;
  delivery_email: boolean;
  delivery_push: boolean;
  created_at: string;
};

export type NotificationPreferences = {
  user_id: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  workout_assigned: boolean;
  workout_updated: boolean;
  checkin_requested: boolean;
  checkin_submitted: boolean;
  message_received: boolean;
  reminders_enabled: boolean;
  milestone_events: boolean;
  inactivity_alerts: boolean;
  system_events: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationFilter = "all" | "unread";
