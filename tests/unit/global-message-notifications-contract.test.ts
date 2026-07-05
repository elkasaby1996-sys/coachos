import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

const appRoutes = readSource("src", "routes", "app.tsx");
const notificationRealtimeHook = readSource(
  "src",
  "features",
  "notifications",
  "hooks",
  "use-notification-realtime.ts",
);
const notificationBell = readSource(
  "src",
  "features",
  "notifications",
  "components",
  "notification-bell.tsx",
);
const ptComposeProvider = readSource(
  "src",
  "components",
  "pt",
  "pt-message-compose.tsx",
);
const ptHubLayout = readSource(
  "src",
  "components",
  "layouts",
  "pt-hub-layout.tsx",
);
const clientLayout = readSource(
  "src",
  "components",
  "layouts",
  "client-layout.tsx",
);

describe("global message notification and FAB contract", () => {
  it("mounts notification delivery realtime once from the authenticated app shell", () => {
    expect(appRoutes).toContain("GlobalNotificationRealtime");
    expect(appRoutes).toContain("<GlobalNotificationRealtime />");
    expect(notificationBell).not.toContain("useNotificationRealtime");
    expect(notificationRealtimeHook).toContain(
      'table: "notification_deliveries"',
    );
    expect(notificationRealtimeHook).toContain(
      "filter: `recipient_user_id=eq.${userId}`",
    );
  });

  it("invalidates notification and message FAB summary keys from delivery realtime", () => {
    expect(notificationRealtimeHook).toContain("notificationsKeys.listRoot");
    expect(notificationRealtimeHook).toContain("notificationsKeys.unreadCount");
    expect(notificationRealtimeHook).toContain(
      'queryKey: ["pt-compose-conversations"]',
    );
    expect(notificationRealtimeHook).toContain(
      'queryKey: ["pt-compose-unread"]',
    );
    expect(notificationRealtimeHook).toContain(
      'queryKey: ["client-message-fab-conversations"',
    );
    expect(notificationRealtimeHook).toContain(
      'queryKey: ["client-message-fab-unread"',
    );
  });

  it("renders the PT message FAB from PT authenticated shells and hides it on message pages", () => {
    expect(ptHubLayout).toContain("PtMessageComposeProvider");
    expect(ptComposeProvider).toContain(
      'location.pathname.startsWith("/pt-hub")',
    );
    expect(ptComposeProvider).toContain('location.pathname === "/pt/messages"');
    expect(ptComposeProvider).toContain('location.pathname.startsWith("/w/")');
    expect(ptComposeProvider).toContain("clientsQuery.data?.length ?? 0");
  });

  it("renders a client message FAB from the client shell and hides it on /app/messages", () => {
    expect(clientLayout).toContain("ClientMessageFab");
    expect(clientLayout).toContain(
      "<ClientMessageFab visible={shouldShowClientMessageFab} />",
    );
    expect(clientLayout).toContain('location.pathname !== "/app/messages"');
  });

  it("keeps FAB routing to secure messages pages instead of direct mutations", () => {
    expect(ptComposeProvider).toContain('"/pt/messages"');
    expect(clientLayout).toContain('"/app/messages"');
    expect(clientLayout).not.toContain("sendConversationMessage");
    expect(clientLayout).not.toContain("ensure_pt_conversation");
  });
});
