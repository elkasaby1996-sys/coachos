import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { PtHubLeadDetailView } from "../../features/pt-hub/components/pt-hub-lead-detail-view";
import {
  addPtHubLeadNote,
  approvePtHubLead,
  updatePtHubLeadStatus,
  usePtHubLeads,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import {
  markLeadChatRead,
  sendLeadChatMessage,
  useLeadConversationThread,
} from "../../features/lead-chat/lib/lead-chat";
import type { PTLead } from "../../features/pt-hub/types";
import { useSessionAuth } from "../../lib/auth";

export function PtHubLeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const queryClient = useQueryClient();
  const { user } = useSessionAuth();
  const leadsQuery = usePtHubLeads();
  const workspacesQuery = usePtHubWorkspaces();
  const [saving, setSaving] = useState(false);
  const [sendingLeadMessage, setSendingLeadMessage] = useState(false);
  const lastMarkedMessageIdRef = useRef<string | null>(null);

  const lead = useMemo(
    () => (leadsQuery.data ?? []).find((item) => item.id === leadId) ?? null,
    [leadId, leadsQuery.data],
  );
  const leadChatThreadQuery = useLeadConversationThread(lead?.id ?? null);

  useEffect(() => {
    const lastMessageId =
      leadChatThreadQuery.data?.messages[
        (leadChatThreadQuery.data?.messages.length ?? 0) - 1
      ]?.id ?? null;
    if (!lead?.id || !lastMessageId) return;
    if (lastMarkedMessageIdRef.current === lastMessageId) return;
    lastMarkedMessageIdRef.current = lastMessageId;
    void (async () => {
      await markLeadChatRead({
        leadId: lead.id,
        upToMessageId: lastMessageId,
      });
      await queryClient.invalidateQueries({
        queryKey: ["pt-hub-leads", user?.id],
      });
    })();
  }, [lead?.id, leadChatThreadQuery.data?.messages, queryClient, user?.id]);

  const refreshLeads = async () => {
    await queryClient.refetchQueries({ queryKey: ["pt-hub-leads", user?.id] });
    return queryClient.getQueryData<PTLead[]>(["pt-hub-leads", user?.id]) ?? [];
  };

  if (leadsQuery.isLoading) {
    return (
      <section className="space-y-6">
        <EmptyState
          title="Loading lead"
          description="We’re pulling the latest inquiry details now."
        />
      </section>
    );
  }

  if (!lead) {
    return (
      <section className="space-y-6">
        <EmptyState
          title="Lead not found"
          description="This inquiry may have been removed or the link is no longer valid."
          icon={<AlertTriangle className="h-5 w-5 [stroke-width:1.7]" />}
          action={
            <Button asChild variant="secondary">
              <Link to="/pt-hub/leads">Back to leads</Link>
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <PtHubLeadDetailView
      lead={lead}
      workspaces={(workspacesQuery.data ?? []).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
      }))}
      currentUserId={user?.id ?? null}
      leadChatMessages={leadChatThreadQuery.data?.messages ?? []}
      leadChatStatus={
        leadChatThreadQuery.data?.conversation
          ? leadChatThreadQuery.data.conversation.status
          : "missing"
      }
      leadChatArchivedReason={
        leadChatThreadQuery.data?.conversation?.archivedReason ?? null
      }
      sendingLeadMessage={sendingLeadMessage}
      saving={saving}
      onUpdateStatus={async (nextLeadId, status) => {
        setSaving(true);
        try {
          await updatePtHubLeadStatus({
            leadId: nextLeadId,
            status,
          });
          await refreshLeads();
        } finally {
          setSaving(false);
        }
      }}
      onApprove={async (nextLeadId, params) => {
        setSaving(true);
        try {
          await approvePtHubLead({
            leadId: nextLeadId,
            workspaceId: params.workspaceId,
            workspaceName: params.workspaceName,
          });
          await refreshLeads();
        } finally {
          setSaving(false);
        }
      }}
      onDecline={async (nextLeadId) => {
        setSaving(true);
        try {
          await updatePtHubLeadStatus({
            leadId: nextLeadId,
            status: "declined",
          });
          await queryClient.invalidateQueries({
            queryKey: ["lead-chat-thread", nextLeadId],
          });
          await refreshLeads();
        } finally {
          setSaving(false);
        }
      }}
      onSendLeadMessage={async (nextLeadId, body) => {
        setSendingLeadMessage(true);
        try {
          await sendLeadChatMessage({ leadId: nextLeadId, body });
          await queryClient.invalidateQueries({
            queryKey: ["lead-chat-thread", nextLeadId],
          });
          await refreshLeads();
        } finally {
          setSendingLeadMessage(false);
        }
      }}
      onAddNote={async (nextLeadId, body) => {
        if (!user?.id) return;
        setSaving(true);
        try {
          await addPtHubLeadNote({ leadId: nextLeadId, userId: user.id, body });
          await refreshLeads();
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}
