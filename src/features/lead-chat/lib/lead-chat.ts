import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

export type LeadConversationStatus = "open" | "archived";

export type LeadChatMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  sentAt: string;
};

export type LeadConversation = {
  id: string;
  leadId: string;
  ptUserId: string;
  leadUserId: string;
  status: LeadConversationStatus;
  archivedReason: "converted" | "declined" | "manual" | null;
  createdAt: string;
  archivedAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type LeadConversationThread = {
  conversation: LeadConversation | null;
  messages: LeadChatMessage[];
};

export type MyLeadChatThreadSummary = {
  leadId: string;
  conversationId: string | null;
  conversationStatus: LeadConversationStatus | null;
  archivedReason: "converted" | "declined" | "manual" | null;
  leadStatus: "new" | "contacted" | "approved_pending_workspace" | "converted" | "declined";
  submittedAt: string;
  ptUserId: string;
  ptDisplayName: string;
  ptSlug: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
};

type LeadConversationRow = {
  id: string;
  lead_id: string;
  pt_user_id: string;
  lead_user_id: string;
  status: string;
  archived_reason: string | null;
  created_at: string;
  archived_at: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
};

type LeadMessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  sent_at: string;
};

type MyLeadThreadRow = {
  lead_id: string;
  conversation_id: string | null;
  conversation_status: string | null;
  archived_reason: string | null;
  lead_status: string;
  submitted_at: string;
  pt_user_id: string;
  pt_display_name: string;
  pt_slug: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | null;
};

function normalizeConversationStatus(value: string | null): LeadConversationStatus | null {
  if (value === "open") return "open";
  if (value === "archived") return "archived";
  return null;
}

function normalizeLeadStatus(value: string): MyLeadChatThreadSummary["leadStatus"] {
  switch (value) {
    case "new":
      return "new";
    case "contacted":
      return "contacted";
    case "approved_pending_workspace":
      return "approved_pending_workspace";
    case "converted":
      return "converted";
    case "declined":
      return "declined";
    default:
      return "new";
  }
}

function mapLeadConversation(row: LeadConversationRow): LeadConversation {
  return {
    id: row.id,
    leadId: row.lead_id,
    ptUserId: row.pt_user_id,
    leadUserId: row.lead_user_id,
    status: row.status === "archived" ? "archived" : "open",
    archivedReason:
      row.archived_reason === "converted" ||
      row.archived_reason === "declined" ||
      row.archived_reason === "manual"
        ? row.archived_reason
        : null,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
  };
}

function mapLeadMessage(row: LeadMessageRow): LeadChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderUserId: row.sender_user_id,
    body: row.body,
    sentAt: row.sent_at,
  };
}

export function useLeadConversationThread(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ["lead-chat-thread", leadId],
    enabled: Boolean(leadId),
    staleTime: 1000 * 5,
    queryFn: async () => {
      if (!leadId) {
        return {
          conversation: null,
          messages: [],
        } satisfies LeadConversationThread;
      }

      const { data: conversationData, error: conversationError } = await supabase
        .from("lead_conversations")
        .select(
          "id, lead_id, pt_user_id, lead_user_id, status, archived_reason, created_at, archived_at, last_message_at, last_message_preview",
        )
        .eq("lead_id", leadId)
        .maybeSingle();

      if (conversationError) {
        const code = (conversationError as { code?: string }).code ?? "";
        if (code !== "PGRST116") {
          throw conversationError;
        }
      }

      if (!conversationData) {
        return {
          conversation: null,
          messages: [],
        } satisfies LeadConversationThread;
      }

      const conversation = mapLeadConversation(
        conversationData as LeadConversationRow,
      );

      const { data: messagesData, error: messagesError } = await supabase
        .from("lead_messages")
        .select("id, conversation_id, sender_user_id, body, sent_at")
        .eq("conversation_id", conversation.id)
        .order("sent_at", { ascending: true })
        .returns<LeadMessageRow[]>();

      if (messagesError) {
        throw messagesError;
      }

      return {
        conversation,
        messages: (messagesData ?? []).map(mapLeadMessage),
      } satisfies LeadConversationThread;
    },
  });
}

export async function sendLeadChatMessage(params: {
  leadId: string;
  body: string;
}) {
  const nextBody = params.body.trim();
  if (!nextBody) {
    throw new Error("Message body is required.");
  }

  const { data, error } = await supabase.rpc("lead_chat_send_message", {
    p_lead_id: params.leadId,
    p_body: nextBody,
  });

  if (error) throw error;
  return data as string | null;
}

export async function markLeadChatRead(params: {
  leadId: string;
  upToMessageId?: string | null;
}) {
  const { error } = await supabase.rpc("lead_chat_mark_read", {
    p_lead_id: params.leadId,
    p_up_to_message_id: params.upToMessageId ?? null,
  });

  if (error) throw error;
}

export function useMyLeadChatThreads() {
  return useQuery({
    queryKey: ["my-lead-chat-threads"],
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_lead_chat_threads");
      if (error) throw error;

      return ((data ?? []) as MyLeadThreadRow[]).map((row) => ({
        leadId: row.lead_id,
        conversationId: row.conversation_id,
        conversationStatus: normalizeConversationStatus(row.conversation_status),
        archivedReason:
          row.archived_reason === "converted" ||
          row.archived_reason === "declined" ||
          row.archived_reason === "manual"
            ? row.archived_reason
            : null,
        leadStatus: normalizeLeadStatus(row.lead_status),
        submittedAt: row.submitted_at,
        ptUserId: row.pt_user_id,
        ptDisplayName: row.pt_display_name,
        ptSlug: row.pt_slug,
        lastMessageAt: row.last_message_at,
        lastMessagePreview: row.last_message_preview,
        unreadCount: row.unread_count ?? 0,
      })) satisfies MyLeadChatThreadSummary[];
    },
  });
}

export function isLeadChatWritable(params: {
  leadStatus: MyLeadChatThreadSummary["leadStatus"];
  conversationStatus: LeadConversationStatus | null;
}) {
  if (params.conversationStatus === "archived") return false;
  return (
    params.leadStatus === "new" ||
    params.leadStatus === "contacted" ||
    params.leadStatus === "approved_pending_workspace"
  );
}
