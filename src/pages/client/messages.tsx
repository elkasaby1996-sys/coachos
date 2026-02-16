import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
} from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

const formatTime = (timestamp: string | null) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

type ClientRow = {
  id: string;
  workspace_id: string | null;
  display_name: string | null;
};

type ConversationRow = {
  id: string;
  client_id: string;
  workspace_id: string;
  last_message_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string | null;
  sender_role: string | null;
  sender_name: string | null;
  body: string | null;
  created_at: string | null;
};

export function ClientMessagesPage() {
  const { session } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const draft = useMemo(
    () => new URLSearchParams(location.search).get("draft") ?? "",
    [location.search],
  );
  const [messageInput, setMessageInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const messagePageSize = 50;

  useEffect(() => {
    if (draft) {
      setMessageInput(draft);
    }
  }, [draft]);

  const clientQuery = useQuery({
    queryKey: ["client-self", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, workspace_id, display_name")
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as ClientRow | null;
    },
  });

  const ensureConversationMutation = useMutation({
    mutationFn: async () => {
      if (!clientQuery.data?.workspace_id || !clientQuery.data?.id) {
        throw new Error("Client workspace not found.");
      }
      const { data, error } = await supabase
        .from("conversations")
        .upsert(
          {
            workspace_id: clientQuery.data.workspace_id,
            client_id: clientQuery.data.id,
          },
          { onConflict: "workspace_id,client_id" },
        )
        .select("id, client_id, workspace_id, last_message_at")
        .maybeSingle();
      if (error) throw error;
      return data as ConversationRow | null;
    },
    onSuccess: (data) => {
      if (data?.id) {
        setConversationId(data.id);
      }
    },
  });

  useEffect(() => {
    if (clientQuery.data?.id && clientQuery.data?.workspace_id) {
      ensureConversationMutation.mutate();
    }
  }, [clientQuery.data?.id, clientQuery.data?.workspace_id]);

  const messagesQuery = useInfiniteQuery({
    queryKey: ["client-messages", conversationId],
    enabled: !!conversationId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * messagePageSize;
      const to = from + messagePageSize - 1;
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_user_id, sender_role, sender_name, body, created_at",
        )
        .eq("conversation_id", conversationId ?? "")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === messagePageSize ? allPages.length : undefined,
  });

  const messageRows = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    const flat = pages.flat();
    return [...flat].reverse();
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageRows.length]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`client-messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["client-messages", conversationId],
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  useEffect(() => {
    if (!conversationId) {
      setTypingUsers([]);
      return;
    }
    const channel = supabase
      .channel(`client-typing-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_typing",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const next = payload.new as {
            role?: string | null;
            is_typing?: boolean | null;
          };
          if (!next) return;
          if (next.role === "pt" && next.is_typing) {
            setTypingUsers(["Coach"]);
          } else {
            setTypingUsers([]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const updateTyping = (isTyping: boolean) => {
    if (!conversationId || !session?.user?.id) return;
    supabase.from("message_typing").upsert(
      {
        conversation_id: conversationId,
        user_id: session.user.id,
        role: "client",
        is_typing: isTyping,
      },
      { onConflict: "conversation_id,user_id" },
    );
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error("Conversation not ready.");
      if (!messageInput.trim()) return;
      const senderName = clientQuery.data?.display_name ?? "Client";
      const body = messageInput.trim();
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_user_id: session?.user?.id ?? null,
        sender_role: "client",
        sender_name: senderName,
        body,
        preview: body.slice(0, 140),
        unread: true,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessageInput("");
      updateTyping(false);
      await queryClient.invalidateQueries({
        queryKey: ["client-messages", conversationId],
      });
    },
  });

  useEffect(() => {
    return () => {
      updateTyping(false);
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <DashboardCard title="Messages" subtitle="Chat with your coach.">
        {clientQuery.isLoading || messagesQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : clientQuery.error ? (
          <EmptyState
            title="Unable to load messages"
            description="Please refresh and try again."
          />
        ) : (
          <div className="flex h-[520px] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto pr-2">
              {messageRows.length === 0 ? (
                <EmptyState
                  title="No messages yet"
                  description="Send a message to start the conversation."
                />
              ) : (
                <>
                  {messagesQuery.hasNextPage ? (
                    <div className="flex justify-center">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => messagesQuery.fetchNextPage()}
                        disabled={messagesQuery.isFetchingNextPage}
                      >
                        {messagesQuery.isFetchingNextPage
                          ? "Loading..."
                          : "Load older"}
                      </Button>
                    </div>
                  ) : null}
                  {messageRows.map((message) => {
                    const isClient = message.sender_role === "client";
                    return (
                      <div
                        key={message.id}
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          isClient
                            ? "ml-auto bg-accent/20 text-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        <div className="text-[10px] uppercase text-muted-foreground">
                          {isClient ? "You" : (message.sender_name ?? "Coach")}
                        </div>
                        <div>{message.body ?? ""}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {formatTime(message.created_at)}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {typingUsers.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  Coach is typing...
                </div>
              ) : null}
              <div ref={scrollRef} />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Input
                placeholder="Type a message"
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMutation.mutate();
                  }
                }}
                onFocus={() => updateTyping(true)}
                onBlur={() => updateTyping(false)}
                onInput={() => {
                  updateTyping(true);
                  if (typingTimeoutRef.current) {
                    window.clearTimeout(typingTimeoutRef.current);
                  }
                  typingTimeoutRef.current = window.setTimeout(() => {
                    updateTyping(false);
                  }, 1500);
                }}
              />
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={!messageInput.trim() || sendMutation.isPending}
              >
                {sendMutation.isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
