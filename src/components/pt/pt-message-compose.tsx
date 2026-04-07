import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, MessageCircle, Send } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { EmptyState, Skeleton, StatusPill } from "../ui/coachos";
import { useSessionAuth } from "../../lib/auth";
import { sendConversationMessage } from "../../lib/messages";
import { getActionErrorMessage } from "../../lib/request-guard";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { formatRelativeTime } from "../../lib/relative-time";
import { cn } from "../../lib/utils";
import {
  PtMessageComposeContext,
  type PtMessageComposeOptions,
} from "./pt-message-compose-context";

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
  unread?: boolean | null;
};

type InboxRow = {
  client: ClientRow;
  conversation: ConversationRow | null;
  unreadCount: number;
  name: string;
  preview: string;
  lastActivityAt: string | null;
};

const formatClockTime = (timestamp: string | null) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getPtComposeUnreadKey = (workspaceId: string | null | undefined) =>
  ["pt-compose-unread", workspaceId ?? "none"] as const;

export function PtMessageComposeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useSessionAuth();
  const { workspaceId } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [hasBlockingDialogOpen, setHasBlockingDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const openComposer = useCallback((options?: PtMessageComposeOptions) => {
    setSelectedClientId(options?.clientId ?? null);
    setMessageDraft(options?.draft ?? "");
    setOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    setOpen(false);
    setSelectedClientId(null);
    setMessageDraft("");
    setSendError(null);
  }, []);

  const clientsQuery = useQuery({
    queryKey: ["pt-compose-clients", workspaceId],
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
    queryKey: ["pt-compose-conversations", workspaceId],
    enabled: !!workspaceId,
    staleTime: 1000 * 30,
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

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);

  const conversationMap = useMemo(() => {
    const map = new Map<string, ConversationRow>();
    (conversationsQuery.data ?? []).forEach((row) =>
      map.set(row.client_id, row),
    );
    return map;
  }, [conversationsQuery.data]);

  const unreadCountsQuery = useQuery({
    queryKey: getPtComposeUnreadKey(workspaceId),
    enabled: (conversationsQuery.data ?? []).length > 0,
    staleTime: 1000 * 15,
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
      const conversationId = (row as { conversation_id?: string | null })
        .conversation_id;
      if (!conversationId) return;
      map.set(conversationId, (map.get(conversationId) ?? 0) + 1);
    });
    return map;
  }, [unreadCountsQuery.data]);

  const inboxRows = useMemo<InboxRow[]>(() => {
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
            ? "Client started a conversation."
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
  }, [clients, conversationMap, unreadMap]);

  const unreadConversationCount = useMemo(
    () => inboxRows.filter((row) => row.unreadCount > 0).length,
    [inboxRows],
  );

  const selectedRow =
    inboxRows.find((row) => row.client.id === selectedClientId) ?? null;
  const activeConversationId = selectedRow?.conversation?.id ?? null;

  useEffect(() => {
    if (!open || selectedClientId || inboxRows.length === 0) return;
    setSelectedClientId(inboxRows[0]?.client.id ?? null);
  }, [inboxRows, open, selectedClientId]);

  const threadQuery = useQuery({
    queryKey: ["pt-compose-thread", activeConversationId],
    enabled: !!activeConversationId && open,
    staleTime: 1000 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_user_id, sender_role, sender_name, body, created_at, unread",
        )
        .eq("conversation_id", activeConversationId ?? "")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return ((data ?? []) as MessageRow[]).reverse();
    },
  });

  useEffect(() => {
    if (!open || !selectedClientId) return;
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, selectedClientId]);

  useEffect(() => {
    if (
      !open ||
      !activeConversationId ||
      (threadQuery.data?.length ?? 0) === 0
    ) {
      return;
    }
    void supabase
      .from("messages")
      .update({ unread: false })
      .eq("conversation_id", activeConversationId)
      .eq("sender_role", "client")
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: getPtComposeUnreadKey(workspaceId),
        });
      });
  }, [activeConversationId, open, queryClient, threadQuery.data, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !open) return;
    const channel = supabase
      .channel(`pt-compose-conversations-${workspaceId}`)
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
            queryKey: ["pt-compose-conversations", workspaceId],
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, queryClient, workspaceId]);

  useEffect(() => {
    if (!activeConversationId || !open) return;
    const channel = supabase
      .channel(`pt-compose-thread-${activeConversationId}`)
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
            queryKey: ["pt-compose-thread", activeConversationId],
          });
          queryClient.invalidateQueries({
            queryKey: ["pt-compose-conversations", workspaceId],
          });
          queryClient.invalidateQueries({
            queryKey: getPtComposeUnreadKey(workspaceId),
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, open, queryClient, workspaceId]);

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pt-compose-conversations", workspaceId],
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientId) throw new Error("No client selected.");
      const trimmed = messageDraft.trim();
      if (!trimmed) return;

      const existingConversation = conversationMap.get(selectedClientId);
      const conversation =
        existingConversation ??
        (await ensureConversationMutation.mutateAsync(selectedClientId));
      if (!conversation?.id) {
        throw new Error("Conversation could not be opened.");
      }

      const senderName =
        (user?.user_metadata?.full_name as string | undefined) ??
        user?.email ??
        "Coach";

      await sendConversationMessage({
        conversationId: conversation.id,
        senderUserId: user?.id ?? null,
        senderRole: "pt",
        senderName,
        body: trimmed,
        unread: false,
      });
      return conversation.id;
    },
    onSuccess: async (conversationId) => {
      setSendError(null);
      setMessageDraft("");
      await queryClient.invalidateQueries({
        queryKey: ["pt-compose-conversations", workspaceId],
      });
      await queryClient.invalidateQueries({
        queryKey: getPtComposeUnreadKey(workspaceId),
      });
      if (conversationId) {
        await queryClient.invalidateQueries({
          queryKey: ["pt-compose-thread", conversationId],
        });
      }
    },
    onError: (error) => {
      setSendError(getActionErrorMessage(error, "Unable to send message."));
    },
  });

  useEffect(() => {
    const updateBlockingDialogState = () => {
      const openDialogs = Array.from(
        document.querySelectorAll('[role="dialog"][data-state="open"]'),
      ).filter(
        (node) =>
          !(node as HTMLElement).hasAttribute("data-pt-message-compose-drawer"),
      );
      setHasBlockingDialogOpen(openDialogs.length > 0);
    };

    updateBlockingDialogState();
    const observer = new MutationObserver(updateBlockingDialogState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    return () => observer.disconnect();
  }, []);

  const shouldShowFloatingControl =
    workspaceId &&
    location.pathname.startsWith("/pt") &&
    !location.pathname.startsWith("/pt/messages") &&
    !location.pathname.startsWith("/pt/clients/") &&
    !open &&
    !hasBlockingDialogOpen;

  const handleOpenMessagesPage = () => {
    const params = new URLSearchParams();
    if (selectedClientId) {
      params.set("client", selectedClientId);
    }
    if (messageDraft.trim()) {
      params.set("draft", messageDraft.trim());
    }
    closeComposer();
    navigate(
      params.size > 0 ? `/pt/messages?${params.toString()}` : "/pt/messages",
    );
  };

  const contextValue = useMemo(
    () => ({
      openComposer,
      closeComposer,
    }),
    [closeComposer, openComposer],
  );

  return (
    <PtMessageComposeContext.Provider value={contextValue}>
      {children}

      {shouldShowFloatingControl ? (
        <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-6 z-40 sm:right-8 sm:bottom-8">
          <Button
            type="button"
            onClick={() => openComposer()}
            className="pointer-events-auto h-14 w-14 rounded-full border border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.98),oklch(var(--card)/0.9))] p-0 text-foreground shadow-[0_22px_56px_-34px_rgba(0,0,0,0.82)] hover:bg-[linear-gradient(180deg,oklch(var(--card)/1),oklch(var(--card)/0.94))] sm:h-auto sm:w-auto sm:gap-2 sm:rounded-full sm:px-4 sm:py-3"
          >
            <span className="relative flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-cyan-300" />
              {unreadConversationCount > 0 ? (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-background bg-cyan-300 px-1 text-[10px] font-semibold text-slate-950">
                  {unreadConversationCount > 9 ? "9+" : unreadConversationCount}
                </span>
              ) : null}
            </span>
            <span className="hidden text-sm font-medium text-foreground sm:inline">
              Message
            </span>
          </Button>
        </div>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) =>
          nextOpen ? setOpen(true) : closeComposer()
        }
      >
        <DialogContent
          data-pt-message-compose-drawer="true"
          className="left-auto right-5 top-auto bottom-5 h-[min(78vh,760px)] w-[min(96vw,860px)] max-w-[860px] translate-x-0 translate-y-0 rounded-[30px] p-0 sm:right-6 sm:bottom-6"
        >
          <div className="flex h-full flex-col bg-[linear-gradient(180deg,oklch(var(--card)/0.99),oklch(var(--card)/0.92))]">
            <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4 pr-14">
              <div className="flex items-start justify-end gap-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleOpenMessagesPage}
                >
                  Open inbox
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[260px_minmax(0,1fr)]">
              <div className="flex min-h-0 flex-col border-r border-border/70">
                <div className="shrink-0 border-b border-border/70 px-4 py-3">
                  <div className="text-sm font-semibold text-foreground">
                    Clients
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  {clientsQuery.isLoading || conversationsQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : inboxRows.length === 0 ? (
                    clients.length === 0 ? (
                      <EmptyState
                        title="No clients to message yet"
                        description="Once a client joins the workspace, their conversation will appear here."
                      />
                    ) : (
                      <EmptyState
                        title="No conversations yet"
                        description="Client threads will appear here as soon as the workspace starts messaging."
                      />
                    )
                  ) : (
                    <div className="space-y-2">
                      {inboxRows.map((row) => {
                        const isActive = row.client.id === selectedClientId;
                        return (
                          <button
                            key={row.client.id}
                            type="button"
                            onClick={() => setSelectedClientId(row.client.id)}
                            className={cn(
                              "w-full rounded-[20px] border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              isActive
                                ? "border-primary/28 bg-primary/[0.08] shadow-[0_18px_46px_-34px_rgba(56,189,248,0.7)]"
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
                                    : "New thread"}
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
              </div>

              <div className="flex min-h-0 flex-col">
                {!selectedRow ? (
                  <div className="flex h-full items-center justify-center p-6">
                    <div className="w-full rounded-[22px] border border-dashed border-border/70 bg-background/25 p-5">
                      <div className="text-sm font-semibold text-foreground">
                        Choose a client
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Select a client from the left to open the chat and send
                        a quick message.
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="shrink-0 border-b border-border/70 px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-foreground">
                              {selectedRow.name}
                            </div>
                            <StatusPill
                              status={selectedRow.client.status ?? "active"}
                            />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {selectedRow.lastActivityAt
                              ? `Last activity ${formatRelativeTime(selectedRow.lastActivityAt)}`
                              : "No thread history yet"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                      {threadQuery.isLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton key={index} className="h-16 w-full" />
                          ))}
                        </div>
                      ) : (threadQuery.data?.length ?? 0) > 0 ? (
                        <div className="space-y-2">
                          {(threadQuery.data ?? []).map((message) => {
                            const isCoach = message.sender_role === "pt";
                            return (
                              <div
                                key={message.id}
                                className={cn(
                                  "max-w-[88%] rounded-[18px] border px-3 py-2 text-sm",
                                  isCoach
                                    ? "ml-auto border-primary/20 bg-primary/12"
                                    : "border-border/60 bg-secondary/35",
                                )}
                              >
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  {isCoach
                                    ? "Coach"
                                    : (message.sender_name ?? "Client")}
                                </div>
                                <div className="mt-1 text-foreground">
                                  {message.body ?? ""}
                                </div>
                                <div className="mt-1 text-[10px] text-muted-foreground">
                                  {formatClockTime(message.created_at)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-border/70 bg-background/25 p-4">
                          <div className="text-sm font-semibold text-foreground">
                            Start the conversation
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            Send the first coaching note here, or open the full
                            inbox if you want more thread context.
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 border-t border-border/70 px-5 py-4">
                      {sendError ? (
                        <p className="mb-3 rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                          {sendError}
                        </p>
                      ) : null}
                      <textarea
                        ref={textareaRef}
                        value={messageDraft}
                        onChange={(event) => {
                          if (sendError) setSendError(null);
                          setMessageDraft(event.target.value);
                        }}
                        placeholder={`Message ${selectedRow.name}`}
                        className="min-h-[96px] w-full resize-none rounded-[18px] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <div className="mt-3 flex items-center justify-end gap-3">
                        <Button
                          onClick={() => sendMutation.mutate()}
                          disabled={
                            !messageDraft.trim() || sendMutation.isPending
                          }
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {sendMutation.isPending ? "Sending..." : "Send"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PtMessageComposeContext.Provider>
  );
}
