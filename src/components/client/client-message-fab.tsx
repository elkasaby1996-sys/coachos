import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  buildClientInboxThreadParam,
  sortClientInboxThreads,
} from "../../features/lead-chat/lib/client-inbox";
import { useSessionAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";

type ClientConversationRow = {
  id: string;
  workspace_id: string;
  client_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
};

export function ClientMessageFab({ visible }: { visible: boolean }) {
  const navigate = useNavigate();
  const { user } = useSessionAuth();

  const conversationsQuery = useQuery({
    queryKey: ["client-message-fab-conversations", user?.id],
    enabled: visible && !!user?.id,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "client_accessible_conversations_with_ensure",
      );
      if (error) throw error;
      return (data ?? []) as ClientConversationRow[];
    },
  });

  const conversationIds = useMemo(
    () => (conversationsQuery.data ?? []).map((row) => row.id),
    [conversationsQuery.data],
  );

  const unreadQuery = useQuery({
    queryKey: ["client-message-fab-unread", user?.id, conversationIds.join(",")],
    enabled: visible && conversationIds.length > 0,
    staleTime: 1000 * 15,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .eq("unread", true)
        .eq("sender_role", "pt");
      if (error) throw error;
      return data ?? [];
    },
  });

  const unreadMap = useMemo(() => {
    const map = new Map<string, number>();
    (unreadQuery.data ?? []).forEach((row) => {
      const conversationId = (row as { conversation_id?: string | null })
        .conversation_id;
      if (!conversationId) return;
      map.set(conversationId, (map.get(conversationId) ?? 0) + 1);
    });
    return map;
  }, [unreadQuery.data]);

  const sortedConversations = useMemo(
    () =>
      sortClientInboxThreads(
        (conversationsQuery.data ?? []).map((conversation) => ({
          ...conversation,
          unreadCount: unreadMap.get(conversation.id) ?? 0,
          timestamp: conversation.last_message_at,
        })),
      ),
    [conversationsQuery.data, unreadMap],
  );

  const primaryConversation = sortedConversations[0] ?? null;
  const unreadConversationCount = sortedConversations.filter(
    (conversation) => conversation.unreadCount > 0,
  ).length;

  if (!visible || !primaryConversation || typeof document === "undefined") {
    return null;
  }

  const targetThread = buildClientInboxThreadParam({
    type: "workspace",
    conversationId: primaryConversation.id,
  });
  const preview =
    primaryConversation.last_message_preview?.trim() || "Open messages";

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[72]">
      <div className="pointer-events-auto fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 md:bottom-6 md:right-6">
        <button
          type="button"
          aria-label="Open messages"
          title={preview}
          onClick={() =>
            navigate(`/app/messages?thread=${encodeURIComponent(targetThread)}`)
          }
          className={cn(
            "group flex h-14 w-14 items-center justify-center rounded-full border border-border/75 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.88),oklch(var(--bg-surface)/0.74))] text-foreground shadow-[0_28px_68px_-38px_oklch(0_0_0/0.88)] backdrop-blur-xl transition duration-200 hover:-translate-y-[1px] hover:border-border hover:bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.94),oklch(var(--bg-surface)/0.8))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            unreadConversationCount > 0 &&
              "border-primary/28 text-primary shadow-[0_28px_68px_-38px_oklch(var(--accent)/0.58)]",
          )}
        >
          <span className="relative flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary transition group-hover:text-primary/80" />
            {unreadConversationCount > 0 ? (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-background bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {unreadConversationCount > 9 ? "9+" : unreadConversationCount}
              </span>
            ) : null}
          </span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
