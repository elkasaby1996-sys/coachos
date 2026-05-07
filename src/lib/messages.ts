import { supabase } from "./supabase";
import { runClientGuardedAction } from "./request-guard";

export type MessageInsertRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string | null;
  sender_role: string | null;
  sender_name: string | null;
  body: string | null;
  created_at: string | null;
};

export async function sendConversationMessage(input: {
  conversationId: string;
  senderUserId: string | null;
  senderRole: "pt" | "client";
  senderName: string;
  body: string;
  unread: boolean;
}) {
  const trimmedBody = input.body.trim();
  if (!trimmedBody) {
    throw new Error("Message body is required.");
  }

  const senderScope =
    input.senderUserId ??
    `${input.senderRole}:${input.conversationId}`;

  return runClientGuardedAction({
    action: "message-send",
    scope: `${senderScope}:${input.conversationId}`,
    cooldownMs: 1200,
    message: "You're sending messages a little too quickly. Please wait a moment.",
    run: async () => {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: input.conversationId,
          sender_user_id: input.senderUserId,
          sender_role: input.senderRole,
          sender_name: input.senderName,
          body: trimmedBody,
          preview: trimmedBody.slice(0, 140),
          unread: input.unread,
        })
        .select(
          "id, conversation_id, sender_user_id, sender_role, sender_name, body, created_at",
        )
        .single();

      if (error) throw error;
      return data as MessageInsertRow;
    },
  });
}
