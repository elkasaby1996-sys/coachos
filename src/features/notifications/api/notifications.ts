import { supabase } from "../../../lib/supabase";
import type {
  NotificationFilter,
  NotificationPreferences,
  NotificationRecord,
} from "../lib/types";

const notificationColumns =
  "id, recipient_user_id, type, category, priority, title, body, action_url, entity_type, entity_id, image_url, metadata, is_read, read_at, delivery_in_app, delivery_email, delivery_push, created_at";

const preferenceColumns =
  "user_id, in_app_enabled, email_enabled, push_enabled, workout_assigned, workout_updated, checkin_requested, checkin_submitted, message_received, reminders_enabled, milestone_events, inactivity_alerts, system_events, created_at, updated_at";

export const defaultNotificationPreferences = (
  userId: string,
): NotificationPreferences => ({
  user_id: userId,
  in_app_enabled: true,
  email_enabled: false,
  push_enabled: false,
  workout_assigned: true,
  workout_updated: true,
  checkin_requested: true,
  checkin_submitted: true,
  message_received: true,
  reminders_enabled: true,
  milestone_events: true,
  inactivity_alerts: true,
  system_events: true,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
});

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
    .from("notifications")
    .select(notificationColumns)
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter === "unread") {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as NotificationRecord[];
}

export async function fetchUnreadNotificationCount() {
  const { data, error } = await supabase.rpc("get_unread_notification_count");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function markNotificationRead(notificationId: string) {
  const { data, error } = await supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId)
    .select(notificationColumns)
    .maybeSingle();
  if (error) throw error;
  return data as NotificationRecord | null;
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
