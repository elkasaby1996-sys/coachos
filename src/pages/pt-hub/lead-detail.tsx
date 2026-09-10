import { useCapacityMutationFeedback } from "../../features/account-capacity/mutation-feedback";
import { invalidateAccountCapacity } from "../../features/account-capacity/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle } from "../../lib/icons";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { PtHubLeadDetailView } from "../../features/pt-hub/components/pt-hub-lead-detail-view";
import { LeadPanel } from "../../features/pt-hub/components/pt-hub-lead-surface";
import {
  addPtHubLeadNote,
  approvePtHubLead,
  updatePtHubLeadStatus,
  usePtHubLeads,
  usePtPackages,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import {
  markLeadChatRead,
  sendLeadChatMessage,
  useLeadConversationThread,
} from "../../features/lead-chat/lib/lead-chat";
import type { PTLead } from "../../features/pt-hub/types";
import { useSessionAuth } from "../../lib/auth";
import { useWorkspace } from "../../lib/use-workspace";

export function PtHubLeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const queryClient = useQueryClient();
  const capacityFeedback = useCapacityMutationFeedback("owner");
  const { user } = useSessionAuth();
  const { switchWorkspace, refreshWorkspace } = useWorkspace();
  const leadsQuery = usePtHubLeads();
  const packagesQuery = usePtPackages();
  const workspacesQuery = usePtHubWorkspaces();
  const [saving, setSaving] = useState(false);
  const [sendingLeadMessage, setSendingLeadMessage] = useState(false);
  const lastMarkedMessageIdRef = useRef<string | null>(null);

  const lead = useMemo(
    () => (leadsQuery.data ?? []).find((item) => item.id === leadId) ?? null,
    [leadId, leadsQuery.data],
  );
  const currentPackage = useMemo(() => {
    if (!lead?.packageInterestId) return null;
    return (
      (packagesQuery.data ?? []).find(
        (pkg) => pkg.id === lead.packageInterestId,
      ) ?? null
    );
  }, [lead?.packageInterestId, packagesQuery.data]);
  const currentPackageLookupLoading = lead?.packageInterestId
    ? packagesQuery.isLoading
    : false;
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
      <section className="analytics-page lead-profile-page">
        <LeadPanel
          title="Lead profile"
          description="Loading the latest application details."
        >
          <p role="status" className="lead-empty-copy">
            Loading lead…
          </p>
        </LeadPanel>
      </section>
    );
  }

  if (leadsQuery.isError && !lead) {
    return (
      <section className="analytics-page lead-profile-page">
        <LeadPanel
          title="Unable to load lead"
          description="The application details couldn’t be loaded."
        >
          <div role="alert">
            <Button
              variant="secondary"
              disabled={leadsQuery.isFetching}
              onClick={() => void leadsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        </LeadPanel>
      </section>
    );
  }

  if (!lead) {
    return (
      <section className="analytics-page lead-profile-page">
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
    <>
      {capacityFeedback.notice}
      <PtHubLeadDetailView
        lead={lead}
        currentPackage={currentPackage}
        currentPackageLookupLoading={currentPackageLookupLoading}
        workspaces={(workspacesQuery.data ?? []).map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
        }))}
        currentUserId={user?.id ?? null}
        leadChatMessages={leadChatThreadQuery.data?.messages ?? []}
        leadChatStatus={
          leadChatThreadQuery.isPending
            ? "loading"
            : leadChatThreadQuery.isError
              ? "error"
              : leadChatThreadQuery.data?.conversation
                ? leadChatThreadQuery.data.conversation.status
                : "missing"
        }
        onRetryChat={() => void leadChatThreadQuery.refetch()}
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
            const approvalResult = await approvePtHubLead({
              leadId: nextLeadId,
              workspaceId: params.workspaceId,
              workspaceName: params.workspaceName,
              allowTransfer: params.allowTransfer,
            });
            if (approvalResult?.workspace_id) {
              switchWorkspace(approvalResult.workspace_id);
              refreshWorkspace();
            }
            invalidateAccountCapacity(queryClient);
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ["pt-hub-workspaces", user?.id],
              }),
              queryClient.invalidateQueries({
                queryKey: ["pt-hub-clients"],
              }),
              queryClient.invalidateQueries({
                queryKey: ["pt-hub-clients-page"],
              }),
              queryClient.invalidateQueries({
                queryKey: ["pt-hub-client-stats"],
              }),
              queryClient.invalidateQueries({
                queryKey: ["pt-dashboard"],
              }),
            ]);
            await refreshLeads();
          } catch (error) {
            capacityFeedback.report(error);
            throw error;
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
            await addPtHubLeadNote({
              leadId: nextLeadId,
              userId: user.id,
              body,
            });
            await refreshLeads();
          } finally {
            setSaving(false);
          }
        }}
      />
    </>
  );
}
