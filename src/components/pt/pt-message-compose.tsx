import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  MessageCircle,
  Search,
  Send,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { EmptyState, Skeleton } from "../ui/coachos";
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

const resizeComposerTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return;
  const maxHeight = 120;
  textarea.style.height = "0px";
  const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > maxHeight ? "auto" : "hidden";
};

function MessageWidgetLauncher({
  open,
  unreadConversationCount,
  onToggle,
}: {
  open: boolean;
  unreadConversationCount: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close messages" : "Open messages"}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        "group flex h-14 w-14 items-center justify-center rounded-full border border-border/75 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.88),oklch(var(--bg-surface)/0.74))] text-foreground shadow-[0_28px_68px_-38px_oklch(0_0_0/0.88)] backdrop-blur-xl transition duration-200 hover:-translate-y-[1px] hover:border-border hover:bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.94),oklch(var(--bg-surface)/0.8))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        open &&
          "border-primary/28 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.16),transparent_44%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.92),oklch(var(--bg-surface)/0.8))] text-primary",
      )}
    >
      <span className="relative flex items-center justify-center">
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5 text-cyan-300 transition group-hover:text-cyan-200" />
        )}
        {!open && unreadConversationCount > 0 ? (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-background bg-cyan-300 px-1 text-[10px] font-semibold text-slate-950">
            {unreadConversationCount > 9 ? "9+" : unreadConversationCount}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function MessageWidgetSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.7),oklch(var(--bg-surface)/0.58))] px-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.04)] backdrop-blur-xl transition focus-within:border-primary/30 focus-within:text-foreground">
      <Search className="h-4 w-4 shrink-0 opacity-80" />
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search clients"
        className="h-full w-full appearance-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/80 [-webkit-appearance:none] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none"
      />
    </label>
  );
}

function MessageWidgetRow({
  row,
  active,
  onSelect,
}: {
  row: InboxRow;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-[22px] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        active
          ? "border-primary/28 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.14),transparent_46%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.78),oklch(var(--bg-surface)/0.68))] shadow-[0_22px_46px_-34px_oklch(var(--accent)/0.28)]"
          : "border-border/75 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.72),oklch(var(--bg-surface)/0.58))] hover:border-border hover:bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.8),oklch(var(--bg-surface)/0.64))]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {row.name}
            </span>
            {row.client.status ? (
              <span className="truncate text-[11px] text-muted-foreground">
                {row.client.status}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {row.preview}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-muted-foreground">
            {row.lastActivityAt
              ? formatRelativeTime(row.lastActivityAt)
              : "New chat"}
          </div>
          {row.unreadCount > 0 ? (
            <span className="mt-2 inline-flex rounded-full border border-primary/20 bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {row.unreadCount} new
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function MessageThreadBubble({
  message,
  showLabel,
  showTimestamp,
}: {
  message: MessageRow;
  showLabel: boolean;
  showTimestamp: boolean;
}) {
  const isCoach = message.sender_role === "pt";
  return (
    <div className={cn("flex", isCoach ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[82%]", isCoach ? "items-end" : "items-start")}>
        {showLabel ? (
          <div
            className={cn(
              "mb-1 px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/85",
              isCoach && "text-right",
            )}
          >
            {isCoach ? "You" : (message.sender_name ?? "Client")}
          </div>
        ) : null}
        <div
          className={cn(
            "inline-flex max-w-full rounded-full px-3.5 py-2 text-sm leading-5 shadow-[inset_0_1px_0_oklch(1_0_0/0.02)]",
            isCoach
              ? "bg-primary text-primary-foreground"
              : "border border-border/75 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.72),oklch(var(--bg-surface)/0.58))] text-foreground",
          )}
        >
          <span className="break-words whitespace-pre-wrap">
            {message.body ?? ""}
          </span>
        </div>
        {showTimestamp ? (
          <div
            className={cn(
              "mt-1 px-1 text-[10px] text-muted-foreground",
              isCoach && "text-right",
            )}
          >
            {formatClockTime(message.created_at)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageWidgetComposer({
  value,
  placeholder,
  textareaRef,
  error,
  sending,
  disabled,
  active,
  onChange,
  onKeyDown,
  onSend,
}: {
  value: string;
  placeholder: string;
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  error: string | null;
  sending: boolean;
  disabled: boolean;
  active: boolean;
  onChange: TextareaHTMLAttributes<HTMLTextAreaElement>["onChange"];
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}) {
  return (
    <div className="border-t border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.8),oklch(var(--bg-surface)/0.68))] px-4 py-3">
      {error ? (
        <p className="mb-3 rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-2 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.74),oklch(var(--bg-surface)/0.6))] p-2 shadow-[inset_0_1px_0_oklch(1_0_0/0.04)] backdrop-blur-xl">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="min-h-[44px] max-h-[120px] w-full resize-none overflow-y-auto bg-transparent px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground/80 [scrollbar-width:thin] [&::-webkit-resizer]:hidden"
        />
        <Button
          type="button"
          className={cn(
            "h-10 w-10 shrink-0 rounded-full p-0",
            active
              ? "border-primary/40 bg-primary text-primary-foreground shadow-[0_10px_30px_-18px_oklch(var(--accent)/0.6)]"
              : "border-border/75 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.7),oklch(var(--bg-surface)/0.58))] text-muted-foreground",
          )}
          onClick={onSend}
          disabled={disabled || sending}
          aria-label={sending ? "Sending message" : "Send message"}
        >
          <Send className={cn("h-4 w-4 transition", active && "text-cyan-100")} />
        </Button>
      </div>
    </div>
  );
}

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
  const [view, setView] = useState<"list" | "thread">("list");
  const [searchValue, setSearchValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLDivElement | null>(null);

  const openComposer = useCallback((options?: PtMessageComposeOptions) => {
    setSelectedClientId((current) => options?.clientId ?? current);
    setMessageDraft(options?.draft ?? "");
    setView(options?.clientId ? "thread" : "list");
    setOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    setOpen(false);
    setMessageDraft("");
    setSendError(null);
    setSearchValue("");
    setView("list");
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

  const filteredInboxRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return inboxRows;
    return inboxRows.filter((row) => {
      const haystack =
        `${row.name} ${row.preview} ${row.client.status ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [inboxRows, searchValue]);

  const selectedRow =
    inboxRows.find((row) => row.client.id === selectedClientId) ?? null;
  const activeConversationId = selectedRow?.conversation?.id ?? null;

  useEffect(() => {
    if (!open || inboxRows.length === 0) return;
    const hasSelectedClient = inboxRows.some(
      (row) => row.client.id === selectedClientId,
    );
    if (!selectedClientId || !hasSelectedClient) {
      setSelectedClientId(inboxRows[0]?.client.id ?? null);
    }
  }, [inboxRows, open, selectedClientId]);

  const threadQuery = useQuery({
    queryKey: ["pt-compose-thread", activeConversationId],
    enabled: !!activeConversationId && open && view === "thread",
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
    if (!open || view !== "thread") return;
    const timer = window.setTimeout(() => {
      resizeComposerTextarea(textareaRef.current);
      textareaRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, selectedClientId, view]);

  useEffect(() => {
    if (
      !open ||
      view !== "thread" ||
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
  }, [
    activeConversationId,
    open,
    queryClient,
    threadQuery.data,
    view,
    workspaceId,
  ]);

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
      resizeComposerTextarea(textareaRef.current);
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

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeComposer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeComposer, open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (window.matchMedia("(max-width: 639px)").matches) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (launcherRef.current?.contains(target)) return;
      closeComposer();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [closeComposer, open]);

  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open, view]);

  const shouldShowFloatingControl =
    workspaceId &&
    location.pathname.startsWith("/pt") &&
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

  const handleComposerKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!messageDraft.trim() || sendMutation.isPending) return;
      sendMutation.mutate();
    }
  };

  const contextValue = useMemo(
    () => ({
      openComposer,
      closeComposer,
    }),
    [closeComposer, openComposer],
  );

  const widgetMarkup =
    typeof document !== "undefined" && shouldShowFloatingControl
      ? createPortal(
          <div className="pointer-events-none fixed inset-0 z-[72]">
            {open ? (
              <div className="pointer-events-auto absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] sm:hidden" />
            ) : null}

            {open ? (
              <div
                ref={panelRef}
                role="dialog"
                aria-label="Messages"
                aria-modal={typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches}
                tabIndex={-1}
                data-pt-message-compose-drawer="true"
                className="pointer-events-auto fixed inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] flex flex-col overflow-hidden rounded-[30px] border border-border/75 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.86),oklch(var(--bg-surface)/0.72))] shadow-[0_34px_86px_-40px_oklch(0_0_0/0.92)] outline-none backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:bottom-[calc(env(safe-area-inset-bottom)+5rem)] sm:top-auto sm:h-[620px] sm:w-[400px]"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.1),transparent_34%),linear-gradient(180deg,oklch(1_0_0/0.04),transparent_36%)]" />
                <div className="relative flex items-center justify-between border-b border-border/65 px-4 py-3">
                  {view === "thread" ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-full"
                        onClick={() => setView("list")}
                        aria-label="Back to conversations"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {selectedRow?.name ?? "Conversation"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0 text-sm font-semibold text-foreground">
                      Messages
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-full px-3"
                      onClick={handleOpenMessagesPage}
                    >
                      Open inbox
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {view === "thread" && selectedRow ? (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,oklch(var(--bg-surface)/0.52),oklch(var(--bg-surface)/0.62))] px-4 py-4">
                      {threadQuery.isLoading ? (
                        <div className="space-y-3">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <Skeleton
                              key={index}
                              className="h-12 w-full rounded-2xl"
                            />
                          ))}
                        </div>
                      ) : (threadQuery.data?.length ?? 0) > 0 ? (
                        <div className="space-y-3">
                          {(threadQuery.data ?? []).map(
                            (message, index, messages) => {
                              const previousMessage = messages[index - 1];
                              const nextMessage = messages[index + 1];
                              const showLabel =
                                !previousMessage ||
                                previousMessage.sender_role !==
                                  message.sender_role;
                              const showTimestamp =
                                !nextMessage ||
                                nextMessage.sender_role !== message.sender_role;

                              return (
                                <MessageThreadBubble
                                  key={message.id}
                                  message={message}
                                  showLabel={showLabel}
                                  showTimestamp={showTimestamp}
                                />
                              );
                            },
                          )}
                        </div>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.74),oklch(var(--bg-surface)/0.6))] px-4 py-5">
                          <div className="text-sm font-semibold text-foreground">
                            Start the conversation
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            Send a quick coaching note here or open the full
                            inbox for more context.
                          </div>
                        </div>
                      )}
                    </div>

                    <MessageWidgetComposer
                      value={messageDraft}
                      placeholder={`Message ${selectedRow.name}`}
                      textareaRef={textareaRef}
                      error={sendError}
                      sending={sendMutation.isPending}
                      disabled={!messageDraft.trim()}
                      active={!!messageDraft.trim()}
                      onChange={(event) => {
                        if (sendError) setSendError(null);
                        setMessageDraft(event.target.value);
                        resizeComposerTextarea(event.target);
                      }}
                      onKeyDown={handleComposerKeyDown}
                      onSend={() => sendMutation.mutate()}
                    />
                  </>
                ) : (
                  <>
                    <div className="relative border-b border-border/65 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.62),oklch(var(--bg-surface)/0.48))] px-4 py-3">
                      <MessageWidgetSearch
                        value={searchValue}
                        onChange={setSearchValue}
                      />
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,oklch(var(--bg-surface)/0.52),oklch(var(--bg-surface)/0.62))] px-3 py-3">
                      {clientsQuery.isLoading || conversationsQuery.isLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 6 }).map((_, index) => (
                            <Skeleton
                              key={index}
                              className="h-20 w-full rounded-[22px]"
                            />
                          ))}
                        </div>
                      ) : filteredInboxRows.length === 0 ? (
                        inboxRows.length === 0 ? (
                          <EmptyState
                            title="No conversations yet"
                            description="Client chats will appear here as soon as the workspace starts messaging."
                          />
                        ) : (
                          <EmptyState
                            title="No clients match that search"
                            description="Try another client name or clear the search."
                          />
                        )
                      ) : (
                        <div className="space-y-2">
                          {filteredInboxRows.map((row) => (
                            <MessageWidgetRow
                              key={row.client.id}
                              row={row}
                              active={row.client.id === selectedClientId}
                              onSelect={() => {
                                setSelectedClientId(row.client.id);
                                setView("thread");
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                  </>
                )}
              </div>
            ) : null}

            <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 sm:bottom-6 sm:right-6">
              <div className="pointer-events-auto">
                <div ref={launcherRef}>
                  <MessageWidgetLauncher
                    open={open}
                    unreadConversationCount={unreadConversationCount}
                    onToggle={() => {
                      if (open) {
                        closeComposer();
                        return;
                      }
                      setView("list");
                      setOpen(true);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <PtMessageComposeContext.Provider value={contextValue}>
      {children}
      {widgetMarkup}
    </PtMessageComposeContext.Provider>
  );
}
