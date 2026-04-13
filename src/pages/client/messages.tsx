import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  MessageCircleMore,
  Search,
  SendHorizontal,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { FieldCharacterMeta } from "../../components/common/field-character-meta";
import { Skeleton } from "../../components/ui/coachos";
import {
  EmptyStateActionButton,
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
  StatusBanner,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { getCharacterLimitState } from "../../lib/character-limits";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { sendConversationMessage } from "../../lib/messages";
import { formatRelativeTime } from "../../lib/relative-time";
import { getActionErrorMessage } from "../../lib/request-guard";
import { supabase } from "../../lib/supabase";
import {
  buildClientInboxSourceLabel,
  buildClientInboxThreadParam,
  dedupeLeadThreadSummaries,
  parseClientInboxThreadParam,
  resolveWorkspaceThreadTitle,
} from "../../features/lead-chat/lib/client-inbox";
import {
  isLeadChatWritable,
  markLeadChatRead,
  sendLeadChatMessage,
  useLeadConversationThread,
  useMyLeadChatThreads,
  type MyLeadChatThreadSummary,
} from "../../features/lead-chat/lib/lead-chat";

type ClientProfileRow = {
  id: string;
  display_name: string | null;
  workspace_id: string | null;
  created_at: string;
};

type ConversationRow = {
  id: string;
  client_id: string;
  workspace_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_name: string | null;
  last_message_sender_role: string | null;
};

type WorkspaceCoachMessageRow = {
  conversation_id: string | null;
  sender_name: string | null;
  created_at: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string;
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

type UnifiedInboxThread =
  | {
      id: string;
      type: "workspace";
      title: string;
      preview: string;
      timestamp: string | null;
      unreadCount: number;
      sourceLabel: string;
      isWritable: true;
      isArchived: false;
      workspaceConversation: ConversationRow;
    }
  | {
      id: string;
      type: "lead";
      title: string;
      preview: string;
      timestamp: string | null;
      unreadCount: number;
      sourceLabel: string;
      isWritable: boolean;
      isArchived: boolean;
      leadThread: MyLeadChatThreadSummary;
    };

const quickPrompts = [
  "Can we adjust today's workout?",
  "I finished my session and have a quick update.",
  "Can you review my nutrition targets for this week?",
] as const;

const formatTime = (timestamp: string | null) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getWorkspaceUnreadQueryKey = (
  conversationIds: string[],
): readonly [string, string] =>
  ["client-messages-workspace-unread", conversationIds.join(",")] as const;

const CLIENT_HIDDEN_THREADS_STORAGE_KEY = "coachos_client_hidden_inbox_threads";

function readHiddenThreadIdsForUser(userId: string | null | undefined) {
  if (typeof window === "undefined" || !userId) return [];

  try {
    const raw = window.localStorage.getItem(CLIENT_HIDDEN_THREADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const values = parsed[userId];
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function writeHiddenThreadIdsForUser(params: {
  userId: string | null | undefined;
  threadIds: string[];
}) {
  if (typeof window === "undefined" || !params.userId) return;

  try {
    const raw = window.localStorage.getItem(CLIENT_HIDDEN_THREADS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed[params.userId] = params.threadIds;
    window.localStorage.setItem(
      CLIENT_HIDDEN_THREADS_STORAGE_KEY,
      JSON.stringify(parsed),
    );
  } catch {
    // Ignore localStorage persistence failures and keep in-memory behavior.
  }
}

export function ClientMessagesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSessionAuth();
  const { activeClientId } = useBootstrapAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [visibleMessageCount, setVisibleMessageCount] = useState(100);
  const [hiddenThreadIds, setHiddenThreadIds] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const hasAppliedDraftRef = useRef(false);
  const lastMarkedLeadMessageIdRef = useRef<string | null>(null);
  const lastMarkedWorkspaceMessageIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const threadParam = searchParams.get("thread");
  const draftParam = searchParams.get("draft") ?? "";
  const messagePageSize = 50;
  const messageLimitState = getCharacterLimitState({
    value: messageInput,
    kind: "default_text",
    fieldLabel: "Message",
  });

  useEffect(() => {
    if (!draftParam || hasAppliedDraftRef.current) return;
    setMessageInput(draftParam);
    hasAppliedDraftRef.current = true;
  }, [draftParam]);

  useEffect(() => {
    setHiddenThreadIds(readHiddenThreadIdsForUser(session?.user?.id));
  }, [session?.user?.id]);

  const clientProfilesQuery = useQuery({
    queryKey: ["client-message-profiles", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, display_name, workspace_id, created_at")
        .eq("user_id", session?.user?.id ?? "")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientProfileRow[];
    },
  });

  const clientProfile = useMemo(() => {
    const rows = clientProfilesQuery.data ?? [];
    return rows.find((row) => row.id === activeClientId) ?? rows[0] ?? null;
  }, [activeClientId, clientProfilesQuery.data]);
  const clientId = clientProfile?.id ?? null;

  const workspaceConversationsQuery = useQuery({
    queryKey: ["client-messages-workspace-conversations", clientId],
    enabled: !!clientId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, client_id, workspace_id, last_message_at, last_message_preview, last_message_sender_name, last_message_sender_role",
        )
        .eq("client_id", clientId ?? "")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConversationRow[];
    },
  });

  const leadThreadsQuery = useMyLeadChatThreads();

  const workspaceIds = useMemo(() => {
    const values = new Set<string>();
    (workspaceConversationsQuery.data ?? []).forEach((conversation) => {
      if (conversation.workspace_id) values.add(conversation.workspace_id);
    });
    return Array.from(values);
  }, [workspaceConversationsQuery.data]);

  const workspaceNamesQuery = useQuery({
    queryKey: ["client-messages-workspace-names", workspaceIds.join(",")],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name")
        .in("id", workspaceIds);
      if (error) throw error;
      return (data ?? []) as WorkspaceRow[];
    },
  });

  const workspaceNameById = useMemo(
    () =>
      Object.fromEntries(
        (workspaceNamesQuery.data ?? []).map((workspace) => [
          workspace.id,
          workspace.name,
        ]),
      ) as Record<string, string>,
    [workspaceNamesQuery.data],
  );

  const workspaceConversationIds = useMemo(
    () =>
      (workspaceConversationsQuery.data ?? []).map(
        (conversation) => conversation.id,
      ),
    [workspaceConversationsQuery.data],
  );

  const workspaceUnreadQuery = useQuery({
    queryKey: getWorkspaceUnreadQueryKey(workspaceConversationIds),
    enabled: workspaceConversationIds.length > 0,
    staleTime: 1000 * 20,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", workspaceConversationIds)
        .eq("unread", true)
        .eq("sender_role", "pt");
      if (error) throw error;
      return data ?? [];
    },
  });

  const workspaceUnreadByConversationId = useMemo(() => {
    const map = new Map<string, number>();
    (workspaceUnreadQuery.data ?? []).forEach((row) => {
      const conversationId = (row as { conversation_id?: string | null })
        .conversation_id;
      if (!conversationId) return;
      map.set(conversationId, (map.get(conversationId) ?? 0) + 1);
    });
    return map;
  }, [workspaceUnreadQuery.data]);

  const workspaceCoachMessagesQuery = useQuery({
    queryKey: [
      "client-messages-workspace-coach-senders",
      workspaceConversationIds.join(","),
    ],
    enabled: workspaceConversationIds.length > 0,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id, sender_name, created_at")
        .in("conversation_id", workspaceConversationIds)
        .eq("sender_role", "pt")
        .not("sender_name", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkspaceCoachMessageRow[];
    },
  });

  const workspaceCoachNameByConversationId = useMemo(() => {
    const map = new Map<string, string>();
    (workspaceCoachMessagesQuery.data ?? []).forEach((row) => {
      const conversationId = row.conversation_id;
      const senderName = row.sender_name?.trim() ?? "";
      if (!conversationId || !senderName || map.has(conversationId)) return;
      map.set(conversationId, senderName);
    });
    return map;
  }, [workspaceCoachMessagesQuery.data]);

  const mergedThreads = useMemo(() => {
    const workspaceThreads = (workspaceConversationsQuery.data ?? []).map(
      (conversation): UnifiedInboxThread => {
        const workspaceName = workspaceNameById[conversation.workspace_id] ?? null;
        const displayTitle = resolveWorkspaceThreadTitle({
          workspaceName,
          latestCoachSenderName: workspaceCoachNameByConversationId.get(
            conversation.id,
          ),
          lastMessageSenderName: conversation.last_message_sender_name,
          lastMessageSenderRole: conversation.last_message_sender_role,
        });
        return {
          id: buildClientInboxThreadParam({
            type: "workspace",
            conversationId: conversation.id,
          }),
          type: "workspace",
          title: displayTitle,
          preview: conversation.last_message_preview ?? "No messages yet",
          timestamp: conversation.last_message_at,
          unreadCount: workspaceUnreadByConversationId.get(conversation.id) ?? 0,
          sourceLabel: buildClientInboxSourceLabel({
            threadType: "workspace",
            workspaceId: conversation.workspace_id,
            workspaceName,
          }),
          isWritable: true,
          isArchived: false,
          workspaceConversation: conversation,
        };
      },
    );

    const dedupedLeadThreads = dedupeLeadThreadSummaries(
      leadThreadsQuery.data ?? [],
    );

    const leadThreads = dedupedLeadThreads.map(
      (thread): UnifiedInboxThread => {
        const isArchived = thread.conversationStatus === "archived";
        return {
          id: buildClientInboxThreadParam({
            type: "lead",
            leadId: thread.leadId,
          }),
          type: "lead",
          title: thread.ptDisplayName || "Lead conversation",
          preview: thread.lastMessagePreview ?? "No messages yet",
          timestamp: thread.lastMessageAt ?? thread.submittedAt ?? null,
          unreadCount: thread.unreadCount,
          sourceLabel: buildClientInboxSourceLabel({
            threadType: "lead",
            archived: isArchived,
          }),
          isWritable: isLeadChatWritable({
            leadStatus: thread.leadStatus,
            conversationStatus: thread.conversationStatus,
          }),
          isArchived,
          leadThread: thread,
        };
      },
    );

    return [...workspaceThreads, ...leadThreads].sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) {
        return b.unreadCount - a.unreadCount;
      }
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });
  }, [
    leadThreadsQuery.data,
    workspaceConversationsQuery.data,
    workspaceCoachNameByConversationId,
    workspaceNameById,
    workspaceUnreadByConversationId,
  ]);

  const visibleThreads = useMemo(() => {
    if (hiddenThreadIds.length === 0) return mergedThreads;
    const hidden = new Set(hiddenThreadIds);
    return mergedThreads.filter((thread) => !hidden.has(thread.id));
  }, [hiddenThreadIds, mergedThreads]);

  const filteredThreads = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return visibleThreads;

    return visibleThreads.filter((thread) => {
      const haystack = `${thread.title} ${thread.preview} ${thread.sourceLabel}`;
      return haystack.toLowerCase().includes(query);
    });
  }, [searchValue, visibleThreads]);

  useEffect(() => {
    if (visibleThreads.length === 0) {
      if (selectedThreadId !== null) {
        setSelectedThreadId(null);
      }
      return;
    }

    const requestedThreadRef = parseClientInboxThreadParam(threadParam);
    const requestedThreadId = requestedThreadRef
      ? buildClientInboxThreadParam(requestedThreadRef)
      : null;
    if (
      requestedThreadId &&
      visibleThreads.some((thread) => thread.id === requestedThreadId)
    ) {
      if (selectedThreadId !== requestedThreadId) {
        setSelectedThreadId(requestedThreadId);
      }
      return;
    }

    if (
      !selectedThreadId ||
      !visibleThreads.some((thread) => thread.id === selectedThreadId)
    ) {
      setSelectedThreadId(visibleThreads[0]?.id ?? null);
    }
  }, [selectedThreadId, threadParam, visibleThreads]);

  useEffect(() => {
    const currentParam =
      threadParam && threadParam.trim().length > 0 ? threadParam : null;
    const selectedParam =
      selectedThreadId && selectedThreadId.trim().length > 0
        ? selectedThreadId
        : null;
    if (currentParam === selectedParam) return;

    const next = new URLSearchParams(searchParams);
    if (selectedParam) {
      next.set("thread", selectedParam);
    } else {
      next.delete("thread");
    }
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedThreadId, setSearchParams, threadParam]);

  const selectedThread = useMemo(
    () => visibleThreads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, visibleThreads],
  );
  const selectedThreadType = selectedThread?.type ?? null;
  const selectedThreadIsArchived = selectedThread?.isArchived ?? false;

  const activeWorkspaceConversationId =
    selectedThread?.type === "workspace"
      ? selectedThread.workspaceConversation.id
      : null;

  const activeLeadId =
    selectedThread?.type === "lead" ? selectedThread.leadThread.leadId : null;

  const workspaceMessagesQuery = useInfiniteQuery({
    queryKey: ["client-workspace-thread-messages", activeWorkspaceConversationId],
    enabled: !!activeWorkspaceConversationId,
    staleTime: 1000 * 5,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * messagePageSize;
      const to = from + messagePageSize - 1;
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_user_id, sender_role, sender_name, body, created_at",
        )
        .eq("conversation_id", activeWorkspaceConversationId ?? "")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === messagePageSize ? allPages.length : undefined,
  });

  const workspaceMessages = useMemo(() => {
    const pages = workspaceMessagesQuery.data?.pages ?? [];
    const flat = pages.flat();
    return [...flat].reverse();
  }, [workspaceMessagesQuery.data]);

  const renderedWorkspaceMessages = useMemo(
    () =>
      workspaceMessages.slice(
        Math.max(0, workspaceMessages.length - visibleMessageCount),
      ),
    [workspaceMessages, visibleMessageCount],
  );

  const leadThreadQuery = useLeadConversationThread(activeLeadId);

  useEffect(() => {
    setVisibleMessageCount(100);
  }, [selectedThreadId]);

  useEffect(() => {
    if (!scrollRef.current || !selectedThreadType) return;
    if (selectedThreadType === "lead" && selectedThreadIsArchived) return;

    scrollRef.current.scrollIntoView({
      behavior: selectedThreadType === "workspace" ? "smooth" : "auto",
      block: "end",
    });
  }, [
    leadThreadQuery.data?.messages.length,
    renderedWorkspaceMessages.length,
    selectedThreadId,
    selectedThreadIsArchived,
    selectedThreadType,
  ]);

  useEffect(() => {
    if (!activeWorkspaceConversationId) {
      setTypingUsers([]);
      return;
    }

    const channel = supabase
      .channel(`client-typing-${activeWorkspaceConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_typing",
          filter: `conversation_id=eq.${activeWorkspaceConversationId}`,
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
  }, [activeWorkspaceConversationId]);
  const updateTyping = useCallback(
    (isTyping: boolean) => {
      if (!activeWorkspaceConversationId || !session?.user?.id) return;
      void supabase.from("message_typing").upsert(
        {
          conversation_id: activeWorkspaceConversationId,
          user_id: session.user.id,
          role: "client",
          is_typing: isTyping,
        },
        { onConflict: "conversation_id,user_id" },
      );
    },
    [activeWorkspaceConversationId, session?.user?.id],
  );

  useEffect(() => {
    const latestWorkspaceMessageId =
      workspaceMessages.length > 0
        ? workspaceMessages[workspaceMessages.length - 1]?.id
        : null;

    if (!activeWorkspaceConversationId || !latestWorkspaceMessageId) return;
    if (lastMarkedWorkspaceMessageIdRef.current === latestWorkspaceMessageId) {
      return;
    }

    lastMarkedWorkspaceMessageIdRef.current = latestWorkspaceMessageId;
    void (async () => {
      await supabase
        .from("messages")
        .update({ unread: false })
        .eq("conversation_id", activeWorkspaceConversationId)
        .eq("sender_role", "pt");

      await queryClient.invalidateQueries({
        queryKey: getWorkspaceUnreadQueryKey(workspaceConversationIds),
      });
    })();
  }, [
    activeWorkspaceConversationId,
    queryClient,
    workspaceConversationIds,
    workspaceMessages,
  ]);

  useEffect(() => {
    const latestLeadMessageId =
      leadThreadQuery.data?.messages.length
        ? leadThreadQuery.data.messages[leadThreadQuery.data.messages.length - 1]
            ?.id
        : null;

    if (!activeLeadId || !latestLeadMessageId) return;
    if (lastMarkedLeadMessageIdRef.current === latestLeadMessageId) return;
    lastMarkedLeadMessageIdRef.current = latestLeadMessageId;

    void (async () => {
      await markLeadChatRead({
        leadId: activeLeadId,
        upToMessageId: latestLeadMessageId,
      });
      await queryClient.invalidateQueries({ queryKey: ["my-lead-chat-threads"] });
    })();
  }, [activeLeadId, leadThreadQuery.data?.messages, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedThread) {
        throw new Error("Select a conversation first.");
      }
      if (!selectedThread.isWritable) {
        throw new Error("This conversation is read-only.");
      }
      if (messageLimitState.overLimit) {
        throw new Error(messageLimitState.errorText ?? "Message is too long.");
      }

      const trimmed = messageInput.trim();
      if (!trimmed) return;

      if (selectedThread.type === "workspace") {
        await sendConversationMessage({
          conversationId: selectedThread.workspaceConversation.id,
          senderUserId: session?.user?.id ?? null,
          senderRole: "client",
          senderName: clientProfile?.display_name ?? "Client",
          body: trimmed,
          unread: true,
        });
        return { type: "workspace" as const };
      }

      await sendLeadChatMessage({
        leadId: selectedThread.leadThread.leadId,
        body: trimmed,
      });
      return { type: "lead" as const, leadId: selectedThread.leadThread.leadId };
    },
    onSuccess: async (result) => {
      setSendError(null);
      setMessageInput("");
      updateTyping(false);

      if (!result) return;
      if (result.type === "workspace") {
        if (activeWorkspaceConversationId) {
          await queryClient.invalidateQueries({
            queryKey: [
              "client-workspace-thread-messages",
              activeWorkspaceConversationId,
            ],
          });
        }
        await queryClient.invalidateQueries({
          queryKey: ["client-messages-workspace-conversations", clientId],
        });
        await queryClient.invalidateQueries({
          queryKey: getWorkspaceUnreadQueryKey(workspaceConversationIds),
        });
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["lead-chat-thread", result.leadId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["my-lead-chat-threads"],
      });
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

  const isThreadListLoading =
    clientProfilesQuery.isLoading ||
    workspaceConversationsQuery.isLoading ||
    leadThreadsQuery.isLoading;

  const hasThreadListError =
    clientProfilesQuery.isError ||
    workspaceConversationsQuery.isError ||
    workspaceCoachMessagesQuery.isError ||
    leadThreadsQuery.isError;

  const selectedThreadMessageLoading =
    selectedThread?.type === "workspace"
      ? workspaceMessagesQuery.isLoading
      : selectedThread?.type === "lead"
        ? leadThreadQuery.isLoading
        : false;

  const selectedThreadMessageError =
    selectedThread?.type === "workspace"
      ? workspaceMessagesQuery.isError
      : selectedThread?.type === "lead"
        ? leadThreadQuery.isError
        : false;

  const leadMessages = leadThreadQuery.data?.messages ?? [];
  const unreadThreadCount = useMemo(
    () => visibleThreads.filter((thread) => thread.unreadCount > 0).length,
    [visibleThreads],
  );

  const hideConversation = useCallback(() => {
    if (!selectedThread) return;
    const nextHiddenIds = Array.from(
      new Set([...hiddenThreadIds, selectedThread.id]),
    );
    setHiddenThreadIds(nextHiddenIds);
    writeHiddenThreadIdsForUser({
      userId: session?.user?.id,
      threadIds: nextHiddenIds,
    });
    setDeleteDialogOpen(false);
  }, [hiddenThreadIds, selectedThread, session?.user?.id]);

  const showHiddenConversations = useCallback(() => {
    setHiddenThreadIds([]);
    writeHiddenThreadIdsForUser({
      userId: session?.user?.id,
      threadIds: [],
    });
  }, [session?.user?.id]);

  return (
    <div className="portal-shell">
      <PortalPageHeader
        title="Messages"
        subtitle="One inbox for lead and active coaching conversations."
        stateText={typingUsers.length > 0 ? "Coach is typing" : undefined}
      />

      {hasThreadListError ? (
        <StatusBanner
          variant="warning"
          title="Some conversations could not load"
          description="You can still use available threads. Retry to refresh lead and coaching inbox data."
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                void clientProfilesQuery.refetch();
                void workspaceConversationsQuery.refetch();
                void workspaceCoachMessagesQuery.refetch();
                void leadThreadsQuery.refetch();
              }}
            >
              Retry
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <SurfaceCard>
          <SurfaceCardHeader>
            <SurfaceCardTitle>Inbox</SurfaceCardTitle>
            <SurfaceCardDescription>
              {unreadThreadCount > 0
                ? `${unreadThreadCount} unread conversations`
                : "All caught up"}
            </SurfaceCardDescription>
          </SurfaceCardHeader>
          <SurfaceCardContent className="space-y-4">
            <div className="relative">
              <Search className="app-search-icon h-4 w-4" />
              <Input
                className="app-search-input"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search conversations"
              />
            </div>

            {isThreadListLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-2xl" />
                ))}
              </div>
            ) : filteredThreads.length === 0 ? (
              visibleThreads.length === 0 ? (
                <EmptyStateBlock
                  title="No conversations yet"
                  description={
                    mergedThreads.length > 0
                      ? "All conversations are hidden. You can restore them anytime."
                      : "Start with Find a Coach or wait for your coach to message you."
                  }
                  actions={
                    <>
                      {mergedThreads.length > 0 ? (
                        <EmptyStateActionButton
                          label="Show hidden"
                          onClick={showHiddenConversations}
                        />
                      ) : null}
                      <EmptyStateActionButton
                        label="Find a Coach"
                        onClick={() => navigate("/app/find-coach")}
                      />
                      <EmptyStateActionButton
                        label="Open Home"
                        onClick={() => navigate("/app/home")}
                      />
                    </>
                  }
                />
              ) : (
                <EmptyStateBlock
                  title="No matching conversations"
                  description="Try a different name or keyword."
                />
              )
            ) : (
              <div className="space-y-2">
                {filteredThreads.map((thread) => {
                  const isActive = thread.id === selectedThread?.id;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${
                        isActive
                          ? "border-primary/30 bg-primary/10"
                          : "border-border/60 bg-background/40 hover:border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {thread.title}
                            </p>
                            {thread.isArchived ? (
                              <Badge variant="muted" className="text-[10px]">
                                Read-only
                              </Badge>
                            ) : null}
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {thread.preview}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge variant="muted" className="text-[10px]">
                              {thread.sourceLabel}
                            </Badge>
                            <span>
                              {thread.timestamp
                                ? formatRelativeTime(thread.timestamp)
                                : "No activity"}
                            </span>
                          </div>
                        </div>
                        {thread.unreadCount > 0 ? (
                          <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {thread.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SurfaceCardContent>
        </SurfaceCard>
        <SurfaceCard className="overflow-hidden">
          <SurfaceCardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center text-primary">
                  <MessageCircleMore className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <SurfaceCardTitle className="truncate text-lg">
                    {selectedThread?.title ?? "Select a conversation"}
                  </SurfaceCardTitle>
                  <SurfaceCardDescription>
                    {selectedThread
                      ? selectedThread.sourceLabel
                      : "Choose a thread from your inbox"}
                  </SurfaceCardDescription>
                </div>
              </div>
              {selectedThread ? (
                <div className="flex items-center gap-2">
                  {selectedThread.isArchived ? (
                    <Badge variant="muted">Read-only</Badge>
                  ) : (
                    <Badge variant="neutral">Open</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          </SurfaceCardHeader>

          {!selectedThread ? (
            <SurfaceCardContent className="py-8">
              <EmptyStateBlock
                title="Pick a conversation"
                description="Select a lead or active coaching conversation from the inbox list."
              />
            </SurfaceCardContent>
          ) : selectedThreadMessageLoading ? (
            <SurfaceCardContent className="space-y-3 py-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-2xl" />
              ))}
            </SurfaceCardContent>
          ) : selectedThreadMessageError ? (
            <SurfaceCardContent className="py-8">
              <EmptyStateBlock
                title="Unable to load this thread"
                description="Try again or select another conversation."
                actions={
                  <EmptyStateActionButton
                    label="Retry"
                    onClick={() => {
                      if (selectedThread.type === "workspace") {
                        void workspaceMessagesQuery.refetch();
                      } else {
                        void leadThreadQuery.refetch();
                      }
                    }}
                  />
                }
              />
            </SurfaceCardContent>
          ) : (
            <div className="flex min-h-[30rem] max-h-[calc(100dvh-12rem)] flex-col">
              <SurfaceCardContent className="flex-1 space-y-3 overflow-y-auto bg-background/10 pb-6 pt-5">
                {selectedThread.type === "workspace" ? (
                  <>
                    {workspaceMessagesQuery.hasNextPage ? (
                      <div className="flex justify-center">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => workspaceMessagesQuery.fetchNextPage()}
                          disabled={workspaceMessagesQuery.isFetchingNextPage}
                        >
                          {workspaceMessagesQuery.isFetchingNextPage
                            ? "Loading..."
                            : "Load older"}
                        </Button>
                      </div>
                    ) : null}
                    {workspaceMessages.length > renderedWorkspaceMessages.length ? (
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
                    {renderedWorkspaceMessages.length > 0 ? (
                      renderedWorkspaceMessages.map((message) => {
                        const isMine = message.sender_role === "client";
                        return (
                          <div
                            key={message.id}
                            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-full rounded-[20px] border px-4 py-3 text-sm shadow-[0_12px_28px_-24px_rgba(0,0,0,0.9)] sm:max-w-[min(100%,40rem)] ${
                                isMine
                                  ? "border-primary/24 bg-primary/12 text-foreground"
                                  : "border-border/70 bg-background/55 text-foreground"
                              }`}
                            >
                              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="font-medium text-foreground/90">
                                  {isMine ? "You" : (message.sender_name ?? "Coach")}
                                </span>
                                <span>{formatTime(message.created_at)}</span>
                              </div>
                              <p className="whitespace-pre-wrap leading-6">
                                {message.body ?? ""}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <EmptyStateBlock
                        title="Start the conversation"
                        description="Use a quick prompt or send your own message to your coach."
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
                  </>
                ) : leadMessages.length > 0 ? (
                  leadMessages.map((message) => {
                    const isMine =
                      message.senderUserId !== selectedThread.leadThread.ptUserId;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-full rounded-[20px] border px-4 py-3 text-sm shadow-[0_12px_28px_-24px_rgba(0,0,0,0.9)] sm:max-w-[min(100%,40rem)] ${
                            isMine
                              ? "border-primary/24 bg-primary/12 text-foreground"
                              : "border-border/70 bg-background/55 text-foreground"
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/90">
                              {isMine
                                ? "You"
                                : (selectedThread.leadThread.ptDisplayName || "Coach")}
                            </span>
                            <span>{formatRelativeTime(message.sentAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap leading-6">{message.body}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyStateBlock
                    title="No messages yet"
                    description="This lead conversation has no messages yet."
                  />
                )}

                {typingUsers.length > 0 && selectedThread.type === "workspace" ? (
                  <SectionCard className="inline-flex w-auto items-center gap-2 px-3 py-2">
                    <span className="text-sm text-muted-foreground">
                      Coach is typing...
                    </span>
                  </SectionCard>
                ) : null}

                <div ref={scrollRef} />
              </SurfaceCardContent>

              {selectedThread.isWritable ? (
                <div className="sticky bottom-0 border-t border-border/60 bg-[linear-gradient(180deg,rgba(10,14,22,0.16),rgba(10,14,22,0.94)_24%,rgba(10,14,22,0.98))] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur">
                  <SectionCard className="space-y-3 border-border/60 bg-background/60 p-4 shadow-none">
                    {sendError ? (
                      <p className="rounded-[16px] border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                        {sendError}
                      </p>
                    ) : null}

                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <Textarea
                        aria-label="Message"
                        isInvalid={messageLimitState.overLimit}
                        className="form-control-compact min-h-[76px] flex-1 resize-y bg-background/80"
                        placeholder={
                          selectedThread.type === "lead"
                            ? "Reply in lead chat"
                            : "Send a message to your coach"
                        }
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
                          if (selectedThread.type === "workspace") {
                            updateTyping(true);
                          }
                        }}
                        onBlur={() => {
                          if (selectedThread.type === "workspace") {
                            updateTyping(false);
                          }
                        }}
                        onInput={() => {
                          if (selectedThread.type !== "workspace") return;
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
                        className="h-11 w-full min-w-[9rem] md:w-auto"
                        onClick={() => sendMutation.mutate()}
                        disabled={
                          sendMutation.isPending ||
                          !messageInput.trim() ||
                          messageLimitState.overLimit
                        }
                      >
                        <SendHorizontal className="mr-2 h-4 w-4" />
                        {sendMutation.isPending ? "Sending..." : "Send"}
                      </Button>
                    </div>
                    <FieldCharacterMeta
                      count={messageLimitState.count}
                      limit={messageLimitState.limit}
                      errorText={messageLimitState.errorText}
                    />
                  </SectionCard>
                </div>
              ) : (
                <div className="border-t border-border/60 bg-background/55 px-4 py-4">
                  <SectionCard>
                    <p className="text-sm text-muted-foreground">
                      This conversation is archived and read-only.
                    </p>
                  </SectionCard>
                </div>
              )}
            </div>
          )}
        </SurfaceCard>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the conversation from your inbox view. Message history
              is not erased.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
            </AlertDialogCancel>
            <Button
              variant="secondary"
              className="text-destructive hover:text-destructive"
              onClick={hideConversation}
            >
              Delete from inbox
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
