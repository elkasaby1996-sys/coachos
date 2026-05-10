export const notificationTypes = [
  "workout_assigned",
  "program_assigned",
  "habit_assigned",
  "task_assigned",
  "workout_updated",
  "checkin_requested",
  "checkin_submitted",
  "message_received",
  "file_shared",
  "birthday_reminder",
  "milestone_achieved",
  "client_joined_workspace",
  "client_assigned_workspace",
  "invite_accepted",
  "invite_sent",
  "team_invite_received",
  "team_invite_accepted",
  "team_invite_declined",
  "join_request_submitted",
  "join_request_approved",
  "join_request_declined",
  "workout_due_today",
  "checkin_due_tomorrow",
  "client_inactive",
  "security",
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
  event_id?: string | null;
  recipient_user_id: string;
  actor_type?: "pt" | "client" | "system" | "global" | string;
  type: NotificationType;
  category: NotificationCategory | string;
  priority: NotificationPriority | string;
  title: string;
  body: string;
  action_label?: string | null;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  image_url: string | null;
  metadata: NotificationMetadata;
  status?: NotificationDeliveryStatus;
  is_read: boolean;
  seen_at?: string | null;
  read_at: string | null;
  archived_at?: string | null;
  clicked_at?: string | null;
  delivery_in_app: boolean;
  delivery_email: boolean;
  delivery_push: boolean;
  created_at: string;
};

export type NotificationPreferences = {
  user_id: string;
  actor_type?: "pt" | "client" | "unknown";
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  lead_alerts?: boolean;
  join_requests?: boolean;
  client_escalation?: boolean;
  missed_checkins?: boolean;
  client_onboarding?: boolean;
  weekly_digest?: boolean;
  product_updates?: boolean;
  program_assigned?: boolean;
  habit_reminders?: boolean;
  files_resources?: boolean;
  appointment_reminders?: boolean;
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

export type NotificationFilter =
  | "all"
  | "unread"
  | "action-required"
  | "archived";

export type NotificationChannel = "in_app" | "email" | "push";

export type NotificationDeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "retrying"
  | "suppressed_preference"
  | "suppressed_unsubscribed"
  | "suppressed_no_channel"
  | "bounced";

export type NotificationDeliveryLog = {
  event_id: string;
  recipient_user_id: string;
  recipient_email: string | null;
  notification_type: NotificationType;
  template_key: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  provider: string | null;
  provider_message_id: string | null;
  retry_count: number;
  failure_code: string | null;
  failure_reason: string | null;
  idempotency_key: string;
};

export type NotificationEvent = {
  id?: string;
  recipient_user_id: string;
  actor_type: "pt" | "client" | "system";
  type: NotificationType;
  title: string;
  body: string;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: NotificationMetadata;
  transactional: boolean;
  idempotency_key: string;
};

export type PushSubscriptionInput = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
};

export type PushSubscriptionPayload = PushSubscriptionInput & {
  status: "active";
  last_seen_at: string;
};

export type PushSubscriptionStatusUpdate = {
  status: "active" | "invalid" | "revoked";
  last_seen_at?: string;
  last_success_at?: string;
  last_failure_at?: string;
  failure_reason?: string | null;
  updated_at: string;
};
