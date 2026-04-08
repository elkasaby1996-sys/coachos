import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { PtHubLeadDetailView } from "../../features/pt-hub/components/pt-hub-lead-detail-view";
import {
  addPtHubLeadNote,
  updatePtHubLeadStatus,
  usePtHubLeads,
} from "../../features/pt-hub/lib/pt-hub";
import type { PTLead } from "../../features/pt-hub/types";
import { useSessionAuth } from "../../lib/auth";

export function PtHubLeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const queryClient = useQueryClient();
  const { user } = useSessionAuth();
  const leadsQuery = usePtHubLeads();
  const [saving, setSaving] = useState(false);

  const lead = useMemo(
    () => (leadsQuery.data ?? []).find((item) => item.id === leadId) ?? null,
    [leadId, leadsQuery.data],
  );

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
      saving={saving}
      onUpdateStatus={async (nextLeadId, status, markConverted) => {
        setSaving(true);
        try {
          await updatePtHubLeadStatus({
            leadId: nextLeadId,
            status,
            markConverted,
          });
          await refreshLeads();
        } finally {
          setSaving(false);
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
