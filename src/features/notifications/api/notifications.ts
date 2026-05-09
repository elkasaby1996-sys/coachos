import { supabase } from "../../../lib/supabase";
import type {
  NotificationFilter,
  NotificationMetadata,
  NotificationPreferences,
  NotificationRecord,
} from "../lib/types";
import { buildProfileNotificationPreferenceDefaults } from "../lib/notification-service";

const notificationColumns =
  "id, event_id, recipient_user_id, channel, status, seen_at, read_at, archived_at, clicked_at, action_label, created_at, notification_events!inner(id, actor_type, type, notification_class, category, priority, title, body, action_url, action_label, entity_type, entity_id, image_url, metadata, transactional, created_at)";

const preferenceColumns =
  "user_id, actor_type, in_app_enabled, email_enabled, push_enabled, lead_alerts, join_requests, client_escalation, missed_checkins, client_onboarding, weekly_digest, product_updates, program_assigned, habit_reminders, files_resources, appointment_reminders, workout_assigned, workout_updated, checkin_requested, checkin_submitted, message_received, reminders_enabled, milestone_events, inactivity_alerts, system_events, created_at, updated_at";

export const defaultNotificationPreferences = (
  userId: string,
  actorType: "pt" | "client" | "unknown" = "unknown",
): NotificationPreferences => ({
  ...buildProfileNotificationPreferenceDefaults(userId, actorType),
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
});

type NotificationEventRow = {
  id: string;
  actor_type?: string | null;
  type?: NotificationRecord["type"] | string | null;
  notification_class?: string | null;
  category?: string | null;
  priority?: string | null;
  title?: string | null;
  body?: string | null;
  action_url?: string | null;
  action_label?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  image_url?: string | null;
  metadata?: NotificationMetadata | null;
  transactional?: boolean | null;
  created_at?: string | null;
};

type NotificationDeliveryRow = {
  id: string;
  event_id: string | null;
  recipient_user_id: string;
  channel: string;
  status: NotificationRecord["status"];
  seen_at: string | null;
  read_at: string | null;
  archived_at: string | null;
  clicked_at: string | null;
  action_label: string | null;
  created_at: string;
  notification_events?: NotificationEventRow | NotificationEventRow[] | null;
};

function getJoinedEvent(row: NotificationDeliveryRow) {
  const joined = row.notification_events;
  return Array.isArray(joined) ? (joined[0] ?? null) : (joined ?? null);
}

function metadataValue(
  metadata: NotificationMetadata | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function mapDeliveryToNotification(
  row: NotificationDeliveryRow,
): NotificationRecord {
  const event = getJoinedEvent(row);
  const metadata = event?.metadata ?? {};

  return {
    id: row.id,
    event_id: row.event_id ?? event?.id ?? null,
    recipient_user_id: row.recipient_user_id,
    actor_type: event?.actor_type ?? "system",
    type: (event?.type ?? "system") as NotificationRecord["type"],
    category:
      event?.category ?? metadataValue(metadata, "category") ?? "general",
    priority:
      event?.priority ?? metadataValue(metadata, "priority") ?? "normal",
    title: event?.title ?? "Notification",
    body: event?.body ?? "",
    action_label:
      row.action_label ??
      event?.action_label ??
      metadataValue(metadata, "action_label"),
    action_url: event?.action_url ?? metadataValue(metadata, "action_url"),
    entity_type: event?.entity_type ?? metadataValue(metadata, "entity_type"),
    entity_id: event?.entity_id ?? metadataValue(metadata, "entity_id"),
    image_url: event?.image_url ?? metadataValue(metadata, "image_url"),
    metadata,
    status: row.status,
    is_read: Boolean(row.read_at),
    seen_at: row.seen_at,
    read_at: row.read_at,
    archived_at: row.archived_at,
    clicked_at: row.clicked_at,
    delivery_in_app:
      row.channel === "in_app" && row.status !== "suppressed_preference",
    delivery_email: false,
    delivery_push: false,
    created_at:
      row.created_at ?? event?.created_at ?? new Date(0).toISOString(),
  };
}

export async function fetchNotifications({
  userId,
  filter = "all",
  limit = 10,
  offset = 0,
}: {
  userId: string;
  filter?: NotificationFilter;
  limit?: number;
  offset?: number;
}) {
  let query = supabase
    .from("notification_deliveries")
    .select(notificationColumns)
    .eq("recipient_user_id", userId)
    .eq("channel", "in_app")
    .neq("status", "suppressed_preference")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter === "unread") {
    query = query.is("read_at", null).is("archived_at", null);
  } else if (filter === "action-required") {
    query = query
      .eq("notification_events.priority", "high")
      .is("archived_at", null);
  } else if (filter === "archived") {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as NotificationDeliveryRow[]).map(
    mapDeliveryToNotification,
  );
}

export async function fetchUnreadNotificationCount() {
  const { data, error } = await supabase.rpc("get_unread_notification_count");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function markNotificationRead(notificationId: string) {
  const { data, error } = await supabase
    .from("notification_deliveries")
    .update({
      read_at: new Date().toISOString(),
      seen_at: new Date().toISOString(),
    })
    .eq("id", notificationId)
    .select(notificationColumns)
    .maybeSingle();
  if (error) throw error;
  return data
    ? mapDeliveryToNotification(data as NotificationDeliveryRow)
    : null;
}

export async function markNotificationUnread(notificationId: string) {
  const { data, error } = await supabase
    .from("notification_deliveries")
    .update({
      read_at: null,
    })
    .eq("id", notificationId)
    .select(notificationColumns)
    .maybeSingle();
  if (error) throw error;
  return data
    ? mapDeliveryToNotification(data as NotificationDeliveryRow)
    : null;
}

export async function archiveNotification(notificationId: string) {
  const { data, error } = await supabase
    .from("notification_deliveries")
    .update({
      archived_at: new Date().toISOString(),
    })
    .eq("id", notificationId)
    .select(notificationColumns)
    .maybeSingle();
  if (error) throw error;
  return data
    ? mapDeliveryToNotification(data as NotificationDeliveryRow)
    : null;
}

export async function unarchiveNotification(notificationId: string) {
  const { data, error } = await supabase
    .from("notification_deliveries")
    .update({
      archived_at: null,
    })
    .eq("id", notificationId)
    .select(notificationColumns)
    .maybeSingle();
  if (error) throw error;
  return data
    ? mapDeliveryToNotification(data as NotificationDeliveryRow)
    : null;
}

export async function markNotificationClicked(notificationId: string) {
  const { data, error } = await supabase
    .from("notification_deliveries")
    .update({
      clicked_at: new Date().toISOString(),
      read_at: new Date().toISOString(),
      seen_at: new Date().toISOString(),
    })
    .eq("id", notificationId)
    .select(notificationColumns)
    .maybeSingle();
  if (error) throw error;
  return data
    ? mapDeliveryToNotification(data as NotificationDeliveryRow)
    : null;
}

export async function markAllNotificationsRead() {
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchNotificationPreferences(userId: string) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select(preferenceColumns)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as NotificationPreferences | null) ?? null;
}

export async function upsertNotificationPreferences(
  preferences: Partial<NotificationPreferences> & { user_id: string },
) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(preferences, { onConflict: "user_id" })
    .select(preferenceColumns)
    .maybeSingle();
  if (error) throw error;
  return data as NotificationPreferences | null;
}
