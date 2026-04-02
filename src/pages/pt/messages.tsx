import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { SendHorizontal } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
  StatusPill,
} from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useWorkspace } from "../../lib/use-workspace";
import { cn } from "../../lib/utils";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { formatRelativeTime } from "../../lib/relative-time";

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
  last_message_preview?: string | null;
  last_message_sender_name?: string | null;
  last_message_sender_role?: string | null;
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialClientId = useMemo(
    () => new URLSearchParams(location.search).get("client"),
    [location.search],
  );
  const initialDraft = useMemo(
    () => new URLSearchParams(location.search).get("draft") ?? "",
    [location.search],
  );
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    initialClientId,
  );
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [clientSearch, setClientSearch] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const messagePageSize = 50;

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
    }
  }, [initialClientId]);

  useEffect(() => {
    if (initialDraft) {
      setMessageDraft(initialDraft);
    }
  }, [initialDraft]);

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
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, client_id, workspace_id, last_message_at, last_message_preview, last_message_sender_name, last_message_sender_role",
        )
        .eq("workspace_id", workspaceId ?? "")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConversationRow[];
    },
  });

  const conversationMap = useMemo(() => {
    const map = new Map<string, ConversationRow>();
    (conversationsQuery.data ?? []).forEach((row) =>
      map.set(row.client_id, row),
    );
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
        },
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
          { onConflict: "workspace_id,client_id" },
        )
        .select(
          "id, client_id, workspace_id, last_message_at, last_message_preview, last_message_sender_name, last_message_sender_role",
        )
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

  const ensureConversation = ensureConversationMutation.mutate;

  useEffect(() => {
    if (!selectedClientId) return;
    const existing = conversationMap.get(selectedClientId);
    if (!existing) {
      ensureConversation(selectedClientId);
    }
  }, [conversationMap, ensureConversation, selectedClientId]);

  const messagesQuery = useInfiniteQuery({
    queryKey: ["pt-messages-thread", activeConversationId],
    enabled: !!activeConversationId,
    staleTime: 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * messagePageSize;
      const to = from + messagePageSize - 1;
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_user_id, sender_role, sender_name, body, created_at",
        )
        .eq("conversation_id", activeConversationId ?? "")
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

  const unreadCountsQuery = useQuery({
    queryKey: ["pt-messages-unread", conversationsQuery.data],
    enabled: (conversationsQuery.data ?? []).length > 0,
    staleTime: 0,
    queryFn: async () => {
      const conversationIds = (conversationsQuery.data ?? []).map(
        (row) => row.id,
      );
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .eq("unread", true)
        .eq("sender_role", "client");
      if (error) throw error;
      return data ?? [];
    },
  });

  const unreadMap = useMemo(() => {
    const map = new Map<string, number>();
    (unreadCountsQuery.data ?? []).forEach((row) => {
      const id = (row as { conversation_id?: string | null }).conversation_id;
      if (!id) return;
      map.set(id, (map.get(id) ?? 0) + 1);
    });
    return map;
  }, [unreadCountsQuery.data]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageRows.length]);

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
            queryKey: ["pt-messages-unread", conversationsQuery.data],
          });
        },
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
          const next = payload.new as {
            role?: string | null;
            is_typing?: boolean | null;
          };
          if (!next) return;
          if (next.role === "client" && next.is_typing) {
            setTypingUsers(["Client"]);
          } else {
            setTypingUsers([]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

  const updateTyping = useCallback(
    (isTyping: boolean) => {
      if (!activeConversationId || !user?.id) return;
      supabase.from("message_typing").upsert(
        {
          conversation_id: activeConversationId,
          user_id: user.id,
          role: "pt",
          is_typing: isTyping,
        },
        { onConflict: "conversation_id,user_id" },
      );
    },
    [activeConversationId, user?.id],
  );

  useEffect(() => {
    if (!activeConversationId || messageRows.length === 0) return;
    void supabase
      .from("messages")
      .update({ unread: false })
      .eq("conversation_id", activeConversationId)
      .eq("sender_role", "client")
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: ["pt-messages-unread", conversationsQuery.data],
        });
      });
  }, [
    activeConversationId,
    conversationsQuery.data,
    messageRows.length,
    queryClient,
  ]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeConversationId) throw new Error("No conversation selected.");
      if (!messageDraft.trim()) return;
      const senderName =
        (user?.user_metadata?.full_name as string | undefined) ??
        user?.email ??
        "Coach";
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
      await queryClient.invalidateQueries({
        queryKey: ["pt-messages-unread", conversationsQuery.data],
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
  }, [updateTyping]);

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const clientInboxRows = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    return clients
      .map((client) => {
        const conversation = conversationMap.get(client.id) ?? null;
        const unreadCount = conversation
          ? (unreadMap.get(conversation.id) ?? 0)
          : 0;
        const name = client.display_name?.trim()
          ? client.display_name
          : client.user_id
            ? `Client ${client.user_id.slice(0, 6)}`
            : "Client";
        const preview =
          conversation?.last_message_preview?.trim() ||
          (conversation?.last_message_sender_role === "client"
            ? "Client started a new thread."
            : client.status?.trim()) ||
          "No messages yet";
        return {
          client,
          conversation,
          unreadCount,
          name,
          preview,
          lastActivityAt: conversation?.last_message_at ?? null,
        };
      })
      .filter((row) => {
        if (!query) return true;
        return `${row.name} ${row.preview} ${row.client.status ?? ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        if (left.unreadCount !== right.unreadCount) {
          return right.unreadCount - left.unreadCount;
        }
        const leftTime = left.lastActivityAt
          ? new Date(left.lastActivityAt).getTime()
          : 0;
        const rightTime = right.lastActivityAt
          ? new Date(right.lastActivityAt).getTime()
          : 0;
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        return left.name.localeCompare(right.name);
      });
  }, [clientSearch, clients, conversationMap, unreadMap]);

  const selectedConversationRow =
    clientInboxRows.find((row) => row.client.id === selectedClientId) ?? null;
  const selectedClient = selectedConversationRow?.client ?? null;
  const unreadConversationCount = useMemo(
    () => clientInboxRows.filter((row) => row.unreadCount > 0).length,
    [clientInboxRows],
  );
  const suggestedReplies = [
    "How are you feeling after today's session?",
    "Quick check-in: anything we should adjust before the next workout?",
    "Nice work staying on plan. Let me know how recovery feels today.",
  ];

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Messages"
        actions={
          <Button variant="secondary" onClick={() => navigate("/pt/clients")}>
            View clients
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <DashboardCard title="Conversations">
          {clientsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <EmptyState
              title="No client inbox yet"
              description="Invite a client and their conversation preview, unread state, and latest activity will appear here."
              actionLabel="View clients"
              onAction={() => navigate("/pt/clients")}
            />
          ) : (
            <div className="space-y-4">
              <Input
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                placeholder="Search client, status, or recent message"
              />

              {clientInboxRows.length === 0 ? (
                <EmptyState
                  title="No conversations match"
                  description="Try another client name."
                />
              ) : (
                <div className="space-y-2">
                  {clientInboxRows.map((row) => {
                    const isActive = row.client.id === selectedClientId;
                    return (
                      <button
                        key={row.client.id}
                        type="button"
                        onClick={() => setSelectedClientId(row.client.id)}
                        className={cn(
                          "w-full rounded-[24px] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isActive
                            ? "border-primary/28 bg-primary/[0.08] shadow-[0_22px_52px_-38px_rgba(56,189,248,0.75)]"
                            : "border-border/65 bg-background/35 hover:border-border hover:bg-background/55",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate font-semibold text-foreground">
                                {row.name}
                              </div>
                              {row.client.status ? (
                                <span className="text-xs text-muted-foreground">
                                  {row.client.status}
                                </span>
                              ) : null}
                            </div>
                            <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                              {row.preview}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span className="text-xs text-muted-foreground">
                              {row.lastActivityAt
                                ? formatRelativeTime(row.lastActivityAt)
                                : "No activity"}
                            </span>
                            {row.unreadCount > 0 ? (
                              <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                                {row.unreadCount} new
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title={
            selectedClient ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold text-foreground">
                  {selectedConversationRow?.name ?? "Client"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto px-2 py-1 text-xs"
                  onClick={() => navigate(`/pt/clients/${selectedClient.id}`)}
                >
                  Open profile
                </Button>
                <StatusPill status={selectedClient.status ?? "active"} />
              </div>
            ) : (
              "Conversation"
            )
          }
        >
          {!selectedClient ? (
            <div className="flex h-[560px] flex-col justify-between gap-6 rounded-[24px] border border-dashed border-border/70 bg-background/25 p-6">
              <div className="space-y-4">
                <EmptyState
                  title="Choose a conversation"
                  description="Select a client to open the thread."
                />
              </div>
              <div className="rounded-[20px] border border-border/70 bg-background/45 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Quick reply ideas
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestedReplies.map((prompt) => (
                    <span
                      key={prompt}
                      className="rounded-full border border-border/70 bg-secondary/18 px-3 py-1.5 text-xs text-muted-foreground"
                    >
                      {prompt}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : messagesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="flex h-[560px] flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {selectedConversationRow?.conversation?.last_message_at
                  ? `Last activity ${formatRelativeTime(
                      selectedConversationRow.conversation.last_message_at,
                    )}.`
                  : "No prior thread history yet."}
              </p>

              <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                {messageRows.length === 0 ? (
                  <div className="flex h-full flex-col justify-between rounded-[24px] border border-dashed border-border/70 bg-background/25 p-6">
                    <EmptyState
                      title="No messages yet"
                      description="Start the thread with a short coaching prompt so the client knows what to reply with next."
                    />
                    <div className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Suggested starters
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestedReplies.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => setMessageDraft(prompt)}
                            className="rounded-full border border-border/70 bg-secondary/18 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:bg-secondary/28 hover:text-foreground"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
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
                      const isCoach = message.sender_role === "pt";
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "flex",
                            isCoach ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "w-fit max-w-[80%] rounded-[22px] border px-3 py-2 text-sm",
                              isCoach
                                ? "border-primary/20 bg-primary/12 text-foreground"
                                : "border-border/60 bg-secondary/45 text-foreground",
                            )}
                          >
                            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              {isCoach
                                ? "Coach"
                                : (message.sender_name ?? "Client")}
                            </div>
                            <div>{message.body ?? ""}</div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {formatTime(message.created_at)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {typingUsers.length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Client is typing...
                  </div>
                ) : null}
                <div ref={scrollRef} />
              </div>
              <div className="rounded-[22px] border border-border/70 bg-background/45 p-3">
                <div className="flex items-stretch gap-2">
                  <textarea
                    className="h-12 min-h-12 w-full resize-none rounded-[16px] border border-border/70 bg-background px-3 py-3 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    placeholder="Write a coaching reply"
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
                    className="h-12 w-12 shrink-0 rounded-[16px] px-0"
                    aria-label={
                      sendMutation.isPending
                        ? "Sending message"
                        : "Send message"
                    }
                  >
                    <SendHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
