import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { FieldCharacterMeta } from "../../../components/common/field-character-meta";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../../components/client/portal";
import { formatRelativeTime } from "../../../lib/relative-time";
import { getCharacterLimitState } from "../../../lib/character-limits";
import {
  isLeadChatWritable,
  markLeadChatRead,
  sendLeadChatMessage,
  useLeadConversationThread,
  useMyLeadChatThreads,
} from "../lib/lead-chat";

export function ClientLeadDashboard() {
  const queryClient = useQueryClient();
  const threadsQuery = useMyLeadChatThreads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const lastMarkedMessageIdRef = useRef<string | null>(null);

  const messageLimitState = getCharacterLimitState({
    value: messageBody,
    kind: "default_text",
    fieldLabel: "Lead message",
  });

  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);

  useEffect(() => {
    const firstThread = threads[0];
    if (!selectedLeadId && firstThread) {
      setSelectedLeadId(firstThread.leadId);
    }
  }, [selectedLeadId, threads]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.leadId === selectedLeadId) ?? null,
    [selectedLeadId, threads],
  );

  const leadThreadQuery = useLeadConversationThread(selectedThread?.leadId ?? null);

  const lastMessageId = useMemo(
    () =>
      leadThreadQuery.data?.messages[
        (leadThreadQuery.data?.messages.length ?? 0) - 1
      ]?.id ?? null,
    [leadThreadQuery.data?.messages],
  );

  useEffect(() => {
    if (!selectedThread?.leadId || !lastMessageId) return;
    if (lastMarkedMessageIdRef.current === lastMessageId) return;
    lastMarkedMessageIdRef.current = lastMessageId;

    void (async () => {
      await markLeadChatRead({
        leadId: selectedThread.leadId,
        upToMessageId: lastMessageId,
      });
      await queryClient.invalidateQueries({
        queryKey: ["my-lead-chat-threads"],
      });
    })();
  }, [lastMessageId, queryClient, selectedThread?.leadId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedThread?.leadId) {
        throw new Error("Select a lead conversation first.");
      }

      return sendLeadChatMessage({
        leadId: selectedThread.leadId,
        body: messageBody,
      });
    },
    onSuccess: async () => {
      setMessageBody("");
      if (!selectedThread?.leadId) return;
      await queryClient.invalidateQueries({
        queryKey: ["lead-chat-thread", selectedThread.leadId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["my-lead-chat-threads"],
      });
    },
  });

  const chatWritable = selectedThread
    ? isLeadChatWritable({
        leadStatus: selectedThread.leadStatus,
        conversationStatus: selectedThread.conversationStatus,
      })
    : false;

  const listState = (() => {
    if (threadsQuery.isLoading) {
      return <p className="text-sm text-muted-foreground">Loading lead conversations...</p>;
    }

    if (threadsQuery.isError) {
      return (
        <p className="text-sm text-muted-foreground">
          We could not load lead conversations right now. Please retry shortly.
        </p>
      );
    }

    if (threads.length === 0) {
      return (
        <EmptyStateBlock
          title="No lead chats yet"
          description="Apply to a coach to start a pre-workspace conversation."
        />
      );
    }

    return threads.map((thread) => {
      const isActive = thread.leadId === selectedThread?.leadId;
      return (
        <button
          key={thread.leadId}
          type="button"
          className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${
            isActive
              ? "border-primary/30 bg-primary/10"
              : "border-border/60 bg-background/40 hover:border-border"
          }`}
          onClick={() => setSelectedLeadId(thread.leadId)}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {thread.ptDisplayName}
            </p>
            {thread.unreadCount > 0 ? (
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {thread.unreadCount}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {thread.lastMessagePreview ?? "No messages yet"}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {formatRelativeTime(thread.lastMessageAt ?? thread.submittedAt)}
          </p>
        </button>
      );
    });
  })();

  return (
    <div className="space-y-6">
      <div data-testid="client-lead-dashboard" />
      <PortalPageHeader
        title="Your coaching dashboard"
        subtitle="Track and reply to lead conversations before workspace assignment."
      />

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SurfaceCard>
          <SurfaceCardHeader>
            <SurfaceCardTitle>Lead conversations</SurfaceCardTitle>
            <SurfaceCardDescription>
              These chats stay separate from workspace chat until conversion.
            </SurfaceCardDescription>
          </SurfaceCardHeader>
          <SurfaceCardContent className="space-y-3">{listState}</SurfaceCardContent>
        </SurfaceCard>

        <SurfaceCard>
          <SurfaceCardHeader>
            <SurfaceCardTitle>
              {selectedThread
                ? `Chat with ${selectedThread.ptDisplayName}`
                : "Select a conversation"}
            </SurfaceCardTitle>
            <SurfaceCardDescription>
              Lead chat is your active communication channel before workspace access.
            </SurfaceCardDescription>
          </SurfaceCardHeader>
          <SurfaceCardContent className="space-y-4">
            {!selectedThread ? (
              <p className="text-sm text-muted-foreground">
                Select a lead conversation from the left to view messages.
              </p>
            ) : leadThreadQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading messages...</p>
            ) : leadThreadQuery.isError ? (
              <p className="text-sm text-muted-foreground">
                We could not load this conversation right now.
              </p>
            ) : (
              <>
                <SectionCard className="max-h-[24rem] space-y-2 overflow-y-auto">
                  {leadThreadQuery.data?.messages.length ? (
                    leadThreadQuery.data.messages.map((message) => {
                      const isMine = message.senderUserId !== selectedThread.ptUserId;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-[16px] border px-3 py-2 text-sm ${
                              isMine
                                ? "border-primary/20 bg-primary/10"
                                : "border-border/60 bg-background/55"
                            }`}
                          >
                            <p>{message.body}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {formatRelativeTime(message.sentAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No messages yet. Start the conversation.
                    </p>
                  )}
                </SectionCard>

                {chatWritable ? (
                  <SectionCard className="space-y-3">
                    <label className="text-sm font-medium text-foreground">
                      Reply in lead chat
                    </label>
                    <Textarea
                      value={messageBody}
                      isInvalid={messageLimitState.overLimit}
                      onChange={(event) => setMessageBody(event.target.value)}
                      className="min-h-[100px]"
                      placeholder="Send a message to your coach"
                    />
                    <FieldCharacterMeta
                      count={messageLimitState.count}
                      limit={messageLimitState.limit}
                      errorText={messageLimitState.errorText}
                    />
                    <Button
                      disabled={
                        sendMutation.isPending ||
                        !messageBody.trim() ||
                        messageLimitState.overLimit
                      }
                      onClick={() => sendMutation.mutate()}
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                      Send message
                    </Button>
                  </SectionCard>
                ) : (
                  <SectionCard>
                    <p className="text-sm text-muted-foreground">
                      This lead conversation is archived and read-only.
                    </p>
                  </SectionCard>
                )}
              </>
            )}
          </SurfaceCardContent>
        </SurfaceCard>
      </div>
    </div>
  );
}
