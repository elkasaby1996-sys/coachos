import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  MessageCircleMore,
  SendHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { PortalPageHeader } from "../../components/client/portal";
import {
  EmptyStateActionButton,
  EmptyStateBlock,
  SectionCard,
  StatusBanner,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { Skeleton } from "../../components/ui/coachos";
import { sendConversationMessage } from "../../lib/messages";
import { getActionErrorMessage } from "../../lib/request-guard";
import { supabase } from "../../lib/supabase";
import { useSessionAuth } from "../../lib/auth";
import { FieldCharacterMeta } from "../../components/common/field-character-meta";
import { Textarea } from "../../components/ui/textarea";
import { getCharacterLimitState } from "../../lib/character-limits";

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

const quickPrompts = [
  "Can we adjust today's workout?",
  "I finished my session and have a quick update.",
  "Can you review my nutrition targets for this week?",
] as const;

export function ClientMessagesPage() {
  const { session } = useSessionAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const draft = useMemo(
    () => new URLSearchParams(location.search).get("draft") ?? "",
    [location.search],
  );
  const [messageInput, setMessageInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [visibleMessageCount, setVisibleMessageCount] = useState(100);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [composerFocused, setComposerFocused] = useState(false);
  const messageLimitState = getCharacterLimitState({
    value: messageInput,
    kind: "default_text",
    fieldLabel: "Message",
  });
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

  const ensureConversation = ensureConversationMutation.mutate;

  useEffect(() => {
    if (clientQuery.data?.id && clientQuery.data?.workspace_id) {
      ensureConversation();
    }
  }, [
    clientQuery.data?.id,
    clientQuery.data?.workspace_id,
    ensureConversation,
  ]);

  const messagesQuery = useInfiniteQuery({
    queryKey: ["client-messages", conversationId],
    enabled: !!conversationId,
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
  const renderedMessageRows = useMemo(
    () => messageRows.slice(Math.max(0, messageRows.length - visibleMessageCount)),
    [messageRows, visibleMessageCount],
  );
  const hasHiddenLoadedMessages =
    messageRows.length > renderedMessageRows.length;

  useEffect(() => {
    setVisibleMessageCount(100);
  }, [conversationId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [renderedMessageRows.length]);

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

  const updateTyping = useCallback(
    (isTyping: boolean) => {
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
    },
    [conversationId, session?.user?.id],
  );

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error("Conversation not ready.");
      if (messageLimitState.overLimit) {
        throw new Error(messageLimitState.errorText ?? "Message is too long.");
      }
      if (!messageInput.trim()) return;
      const senderName = clientQuery.data?.display_name ?? "Client";
      return (await sendConversationMessage({
        conversationId,
        senderUserId: session?.user?.id ?? null,
        senderRole: "client",
        senderName,
        body: messageInput,
        unread: true,
      })) as MessageRow;
    },
    onSuccess: async (message) => {
      setSendError(null);
      setMessageInput("");
      updateTyping(false);
      if (!conversationId || !message) return;
      queryClient.setQueryData<InfiniteData<MessageRow[]>>(
        ["client-messages", conversationId],
        (current) => {
          if (!current) {
            return {
              pageParams: [0],
              pages: [[message]],
            };
          }

          const pages = [...current.pages];
          if (pages.length === 0) {
            pages.push([message]);
          } else {
            const lastPage = pages[pages.length - 1] ?? [];
            pages[pages.length - 1] = [...lastPage, message];
          }

          return {
            ...current,
            pages,
          };
        },
      );
    },
    onError: (error) => {
      setSendError(getActionErrorMessage(error, "Unable to send message."));
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

  const lastMessage =
    messageRows.length > 0 ? messageRows[messageRows.length - 1] : null;
  const conversationContext = lastMessage?.created_at
    ? `Last message ${formatTime(lastMessage.created_at)}`
    : "Ready for your next update";
  const isLoadingConversation =
    clientQuery.isLoading ||
    ensureConversationMutation.isPending ||
    (Boolean(conversationId) && messagesQuery.isLoading);
  const conversationError =
    clientQuery.error ||
    ensureConversationMutation.error ||
    messagesQuery.error;
  const hasMessages = messageRows.length > 0;

  return (
    <div className="portal-shell">
      <PortalPageHeader
        title="Messages"
        subtitle="Message your coach about workouts, check-ins, nutrition, and plan changes."
        stateText={typingUsers.length > 0 ? "Coach is typing" : undefined}
      />

      {conversationError ? (
        <StatusBanner
          variant="error"
          title="Unable to load messages"
          description="Refresh the page and try again. If the problem persists, re-open the portal."
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                clientQuery.refetch();
                ensureConversationMutation.reset();
                if (conversationId) {
                  messagesQuery.refetch();
                }
              }}
            >
              Retry
            </Button>
          }
        />
      ) : null}

      <SurfaceCard className="overflow-hidden">
        <SurfaceCardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center text-primary">
                <MessageCircleMore className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <SurfaceCardTitle className="text-xl">
                  Conversation with your coach
                </SurfaceCardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Share updates, ask questions, or flag anything that needs
                  adjustment.
                </p>
              </div>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3 text-sm lg:max-w-xs">
              <p className="font-semibold text-foreground">
                {typingUsers.length > 0
                  ? "Coach is replying now"
                  : "Conversation details"}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {conversationContext}. Use this space for workout changes,
                check-ins, and nutrition questions.
              </p>
            </div>
          </div>
        </SurfaceCardHeader>

        {isLoadingConversation ? (
          <SurfaceCardContent className="space-y-3 py-6">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-2xl" />
            ))}
          </SurfaceCardContent>
        ) : (
          <div className="flex min-h-[30rem] max-h-[calc(100dvh-12.5rem)] flex-col sm:min-h-[34rem] lg:max-h-[calc(100dvh-10.5rem)]">
            <SurfaceCardContent className="flex-1 space-y-4 overflow-y-auto bg-background/10 pb-36 pt-5 sm:pb-28">
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
              {hasHiddenLoadedMessages ? (
                <div className="flex justify-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setVisibleMessageCount((current) => current + 100)
                    }
                  >
                    Show older loaded messages
                  </Button>
                </div>
              ) : null}

              {hasMessages ? (
                <div className="space-y-3">
                  {renderedMessageRows.map((message) => {
                    const isClient = message.sender_role === "client";
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isClient ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-full rounded-[24px] border px-4 py-3 shadow-[0_16px_40px_-32px_rgba(0,0,0,0.9)] sm:max-w-[min(100%,40rem)] ${
                            isClient
                              ? "border-primary/24 bg-primary/14 text-foreground"
                              : "border-border/70 bg-background/55 text-foreground"
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/90">
                              {isClient
                                ? "You"
                                : (message.sender_name ?? "Coach")}
                            </span>
                            <span className="opacity-60">|</span>
                            <span>{formatTime(message.created_at)}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                            {message.body ?? ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyStateBlock
                  centered
                  icon={<Sparkles className="h-5 w-5" />}
                  title="Start the conversation"
                  description="Use a quick prompt below or write your own update. This thread is the fastest place to ask for changes, report training notes, or check in with your coach."
                  actions={
                    <>
                      {quickPrompts.map((prompt) => (
                        <EmptyStateActionButton
                          key={prompt}
                          label={prompt}
                          onClick={() => setMessageInput(prompt)}
                        />
                      ))}
                    </>
                  }
                />
              )}

              {typingUsers.length > 0 ? (
                <SectionCard className="inline-flex w-auto items-center gap-2 px-3 py-2">
                  <UserRound className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Coach is typing...
                  </span>
                </SectionCard>
              ) : null}

              <div ref={scrollRef} />
            </SurfaceCardContent>

            <div className="sticky bottom-0 border-t border-border/60 bg-[linear-gradient(180deg,rgba(10,14,22,0.16),rgba(10,14,22,0.94)_24%,rgba(10,14,22,0.98))] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:px-5 sm:pb-5">
              <SectionCard className="space-y-3 border-border/60 bg-background/60 p-4 shadow-none">
                {sendError ? (
                  <p className="rounded-[18px] border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                    {sendError}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>Send a direct update to your coach.</span>
                  <span className="text-xs">
                    Enter sends. Shift+Enter adds a new line.
                  </span>
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <Textarea
                    aria-label="Message your coach"
                    isInvalid={messageLimitState.overLimit}
                    className={`form-control-compact flex-1 resize-y bg-background/80 transition-[min-height] duration-200 ${composerFocused || messageInput.trim().length > 0 ? "min-h-[120px]" : "min-h-[58px]"}`}
                    placeholder="Share your update, question, or request..."
                    value={messageInput}
                    onChange={(event) => {
                      if (sendError) setSendError(null);
                      setMessageInput(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        if (messageLimitState.overLimit) return;
                        sendMutation.mutate();
                      }
                    }}
                    onFocus={() => {
                      setComposerFocused(true);
                      updateTyping(true);
                    }}
                    onBlur={() => {
                      setComposerFocused(false);
                      updateTyping(false);
                    }}
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
                    className="h-11 w-full min-w-[10rem] md:w-auto md:self-end"
                    onClick={() => sendMutation.mutate()}
                    disabled={
                      !conversationId ||
                      !messageInput.trim() ||
                      sendMutation.isPending ||
                      messageLimitState.overLimit
                    }
                  >
                    <SendHorizontal className="mr-2 h-4 w-4" />
                    {sendMutation.isPending ? "Sending..." : "Send message"}
                  </Button>
                </div>
                <FieldCharacterMeta
                  count={messageLimitState.count}
                  limit={messageLimitState.limit}
                  errorText={messageLimitState.errorText}
                />
              </SectionCard>
            </div>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
