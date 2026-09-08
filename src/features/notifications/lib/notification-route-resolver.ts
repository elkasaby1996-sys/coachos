import type { NotificationRecord } from "./types";

export type NotificationAudience = "client" | "pt";

const CLIENT_ALLOWED_PREFIXES = ["/app/", "/client/onboarding"];
const PT_ALLOWED_PREFIXES = [
  "/pt/",
  "/pt-hub/",
  "/workspace/",
  "/team-invites/",
];

export function getNotificationFallbackRoute(audience: NotificationAudience) {
  return audience === "client" ? "/app/home" : "/pt-hub";
}

function isSafeRelativeRoute(pathname: string) {
  return pathname.startsWith("/") && !pathname.startsWith("//");
}

function normalizeRoute(actionUrl: string | null | undefined) {
  if (!actionUrl) return null;
  const trimmed = actionUrl.trim();
  if (!isSafeRelativeRoute(trimmed)) return null;

  try {
    const parsed = new URL(trimmed, "https://repsync.local");
    if (parsed.origin !== "https://repsync.local") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function isAllowedForAudience(route: string, audience: NotificationAudience) {
  const allowed =
    audience === "client" ? CLIENT_ALLOWED_PREFIXES : PT_ALLOWED_PREFIXES;
  return allowed.some(
    (prefix) => route === prefix.slice(0, -1) || route.startsWith(prefix),
  );
}

function resolveEntityFallback(
  notification: NotificationRecord,
  audience: NotificationAudience,
) {
  if (audience === "client") {
    if (
      notification.entity_type === "assigned_workout" &&
      notification.entity_id
    ) {
      return `/app/workouts/${notification.entity_id}`;
    }
    if (notification.entity_type === "checkin" && notification.entity_id)
      return `/app/checkins?checkin=${encodeURIComponent(notification.entity_id)}`;
    if (notification.entity_type === "conversation" && notification.entity_id)
      return `/app/messages?thread=${encodeURIComponent(`workspace:${notification.entity_id}`)}`;
    if (
      notification.entity_type === "file" ||
      notification.entity_type === "resource"
    ) {
      return "/app/home?module=files";
    }
    return getNotificationFallbackRoute(audience);
  }

  if (
    notification.type === "join_request_submitted" &&
    notification.entity_id
  ) {
    return `/pt-hub/leads/${notification.entity_id}`;
  }
  if (notification.entity_type === "client" && notification.entity_id) {
    return `/pt/clients/${notification.entity_id}`;
  }
  return getNotificationFallbackRoute(audience);
}

export function resolveNotificationActionUrl(
  notification: NotificationRecord,
  audience: NotificationAudience,
) {
  const normalized = normalizeRoute(notification.action_url);
  if (normalized && isAllowedForAudience(normalized, audience)) {
    const genericClientRoutes = [
      "/app/home",
      "/app/checkin",
      "/app/checkins",
      "/app/workouts",
      "/app/messages",
    ];
    if (audience === "client" && genericClientRoutes.includes(normalized)) {
      const specific = resolveEntityFallback(notification, audience);
      if (specific !== getNotificationFallbackRoute(audience)) return specific;
    }
    return normalized;
  }
  if (notification.action_url) {
    return getNotificationFallbackRoute(audience);
  }

  const fallback = resolveEntityFallback(notification, audience);
  return isAllowedForAudience(fallback, audience)
    ? fallback
    : getNotificationFallbackRoute(audience);
}
