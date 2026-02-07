import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { DashboardCard, EmptyState, Skeleton, StatusPill } from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useWorkspace } from "../../lib/use-workspace";
import { cn } from "../../lib/utils";

const formatTime = (timestamp: string | null) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

type ClientRow = {
  id: string;
  display_name: string | null;
  user_id: string | null;
  status: string | null;
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

export function PtMessagesPage() {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialClientId = useMemo(
    () => new URLSearchParams(location.search).get("client"),
    [location.search]
  );
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
    }
  }, [initialClientId]);

  const clientsQuery = useQuery({
    queryKey: ["pt-messages-clients", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, display_name, user_id, status")
        .eq("workspace_id", workspaceId ?? "")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const conversationsQuery = useQuery({
    queryKey: ["pt-messages-conversations", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, client_id, workspace_id, last_message_at")
        .eq("workspace_id", workspaceId ?? "")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConversationRow[];
    },
  });

  const conversationMap = useMemo(() => {
    const map = new Map<string, ConversationRow>();
    (conversationsQuery.data ?? []).forEach((row) => map.set(row.client_id, row));
    return map;
  }, [conversationsQuery.data]);

  useEffect(() => {
    if (!selectedClientId) {
      setActiveConversationId(null);
      return;
    }
    const existing = conversationMap.get(selectedClientId);
    if (existing?.id) {
      setActiveConversationId(existing.id);
    }
  }, [conversationMap, selectedClientId]);

  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`pt-conversations-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["pt-messages-conversations", workspaceId],
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, workspaceId]);

  const ensureConversationMutation = useMutation({
    mutationFn: async (clientId: string) => {
      if (!workspaceId) throw new Error("Workspace not found.");
      const { data, error } = await supabase
        .from("conversations")
        .upsert(
          {
            workspace_id: workspaceId,
            client_id: clientId,
          },
          { onConflict: "workspace_id,client_id" }
        )
        .select("id, client_id, workspace_id, last_message_at")
        .maybeSingle();
      if (error) throw error;
      return data as ConversationRow | null;
    },
    onSuccess: async (data) => {
      if (data?.id) {
        setActiveConversationId(data.id);
        await queryClient.invalidateQueries({
          queryKey: ["pt-messages-conversations", workspaceId],
        });
      }
    },
  });

  useEffect(() => {
    if (!selectedClientId) return;
    const existing = conversationMap.get(selectedClientId);
    if (!existing) {
      ensureConversationMutation.mutate(selectedClientId);
    }
  }, [conversationMap, ensureConversationMutation, selectedClientId]);

  const messagesQuery = useQuery({
    queryKey: ["pt-messages-thread", activeConversationId],
    enabled: !!activeConversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_user_id, sender_role, sender_name, body, created_at")
        .eq("conversation_id", activeConversationId ?? "")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
    refetchInterval: 4000,
  });

  const messagesSummaryQuery = useQuery({
    queryKey: ["pt-messages-summary", conversationsQuery.data],
    enabled: (conversationsQuery.data ?? []).length > 0,
    queryFn: async () => {
      const conversationIds = (conversationsQuery.data ?? []).map((row) => row.id);
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id, body, created_at, unread, sender_role")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const summaryMap = useMemo(() => {
    const map = new Map<string, { preview: string; time: string | null; unreadCount: number }>();
    const rows = messagesSummaryQuery.data ?? [];
    rows.forEach((row) => {
      const id = row.conversation_id as string;
      if (!map.has(id)) {
        map.set(id, {
          preview: row.body ?? "Message",
          time: row.created_at ?? null,
          unreadCount: 0,
        });
      }
      if (row.unread && row.sender_role === "client") {
        const existing = map.get(id);
        if (existing) {
          existing.unreadCount += 1;
        }
      }
    });
    return map;
  }, [messagesSummaryQuery.data]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!activeConversationId) return;
    const channel = supabase
      .channel(`pt-messages-${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["pt-messages-thread", activeConversationId],
          });
          queryClient.invalidateQueries({
            queryKey: ["pt-messages-summary", conversationsQuery.data],
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, conversationsQuery.data, queryClient]);

  useEffect(() => {
    if (!activeConversationId) {
      setTypingUsers([]);
      return;
    }
    const channel = supabase
      .channel(`pt-typing-${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_typing",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          const next = payload.new as { role?: string | null; is_typing?: boolean | null };
          if (!next) return;
          if (next.role === "client" && next.is_typing) {
            setTypingUsers(["Client"]);
          } else {
            setTypingUsers([]);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

  const updateTyping = (isTyping: boolean) => {
    if (!activeConversationId || !user?.id) return;
    supabase.from("message_typing").upsert(
      {
        conversation_id: activeConversationId,
        user_id: user.id,
        role: "pt",
        is_typing: isTyping,
      },
      { onConflict: "conversation_id,user_id" }
    );
  };

  useEffect(() => {
    if (!activeConversationId || !messagesQuery.data?.length) return;
    void supabase
      .from("messages")
      .update({ unread: false })
      .eq("conversation_id", activeConversationId)
      .eq("sender_role", "client");
  }, [activeConversationId, messagesQuery.data]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeConversationId) throw new Error("No conversation selected.");
      if (!messageDraft.trim()) return;
      const senderName =
        (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Coach";
      const body = messageDraft.trim();
      const { error } = await supabase.from("messages").insert({
        conversation_id: activeConversationId,
        sender_user_id: user?.id ?? null,
        sender_role: "pt",
        sender_name: senderName,
        body,
        preview: body.slice(0, 140),
        unread: false,
      });
      if (error) throw error;
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", activeConversationId);
    },
    onSuccess: async () => {
      setMessageDraft("");
      updateTyping(false);
      await queryClient.invalidateQueries({
        queryKey: ["pt-messages-thread", activeConversationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["pt-messages-conversations", workspaceId],
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

  const clients = clientsQuery.data ?? [];
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Messages</h2>
        <p className="text-sm text-muted-foreground">Chat with clients in real time.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <DashboardCard title="Clients" subtitle="Select a conversation.">
          {clientsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <EmptyState
              title="No clients yet"
              description="Invite a client to start messaging."
            />
          ) : (
            <div className="space-y-2">
              {clients.map((client) => {
                const isActive = client.id === selectedClientId;
                const name = client.display_name?.trim()
                  ? client.display_name
                  : client.user_id
                    ? `Client ${client.user_id.slice(0, 6)}`
                    : "Client";
                const conversation = conversationMap.get(client.id);
                const summary = conversation ? summaryMap.get(conversation.id) : null;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => setSelectedClientId(client.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-left text-sm transition",
                      isActive
                        ? "border-accent/60 bg-accent/10"
                        : "bg-background/40 hover:border-border"
                    )}
                  >
                    <div>
                      <div className="font-semibold text-foreground">{name}</div>
                      <div className="text-xs text-muted-foreground">
                        {summary?.preview ?? client.status ?? "active"}
                      </div>
                      {summary?.time ? (
                        <div className="text-[10px] text-muted-foreground">
                          {formatTime(summary.time)}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusPill status={client.status ?? "active"} />
                      {summary?.unreadCount ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-foreground">
                          {summary.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title={selectedClient ? `Chat with ${selectedClient.display_name ?? "Client"}` : "Chat"}
          subtitle={selectedClient ? "" : "Select a client to view messages."}
        >
          {!selectedClient ? (
            <EmptyState
              title="Select a client"
              description="Choose a client to start chatting."
            />
          ) : messagesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="flex h-[460px] flex-col">
              <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                {(messagesQuery.data ?? []).length === 0 ? (
                  <EmptyState
                    title="No messages yet"
                    description="Send a message to start the conversation."
                  />
                ) : (
                  (messagesQuery.data ?? []).map((message) => {
                    const isCoach = message.sender_role === "pt";
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                          isCoach
                            ? "ml-auto bg-accent/20 text-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        <div className="text-[10px] uppercase text-muted-foreground">
                          {isCoach ? "Coach" : message.sender_name ?? "Client"}
                        </div>
                        <div>{message.body ?? ""}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {formatTime(message.created_at)}
                        </div>
                      </div>
                    );
                  })
                )}
                {typingUsers.length > 0 ? (
                  <div className="text-xs text-muted-foreground">Client is typing...</div>
                ) : null}
                <div ref={scrollRef} />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Input
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder="Type a message"
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
                  disabled={!messageDraft.trim() || sendMutation.isPending}
                >
                  {sendMutation.isPending ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
