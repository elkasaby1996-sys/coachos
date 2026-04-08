import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, MessageSquarePlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Select } from "../../../components/ui/select";
import { PtHubPageHeader } from "./pt-hub-page-header";
import { PtHubSectionCard } from "./pt-hub-section-card";
import { PtHubLeadStatusBadge } from "./pt-hub-lead-status-badge";
import { ptHubLeadStatuses } from "./pt-hub-lead-statuses";
import type { PTLead, PTLeadStatus } from "../types";
import { formatRelativeTime } from "../../../lib/relative-time";

export function PtHubLeadDetailView({
  lead,
  saving,
  onUpdateStatus,
  onAddNote,
}: {
  lead: PTLead;
  saving: boolean;
  onUpdateStatus: (
    leadId: string,
    status: PTLeadStatus,
    markConverted?: boolean,
  ) => Promise<void>;
  onAddNote: (leadId: string, body: string) => Promise<void>;
}) {
  const [nextStatus, setNextStatus] = useState<PTLeadStatus>("reviewed");
  const [noteBody, setNoteBody] = useState("");

  const initialStatus = useMemo(
    () => lead.status ?? "reviewed",
    [lead.status],
  );

  useEffect(() => {
    setNextStatus(lead.status ?? "reviewed");
    setNoteBody("");
  }, [lead]);

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        module="leads"
        eyebrow="Lead profile"
        title={lead.fullName}
        description={`Submitted ${formatRelativeTime(lead.submittedAt)}. Review the inquiry, update status, and keep internal qualification notes in one place.`}
        actions={
          <Button asChild variant="secondary">
            <Link to="/pt-hub/leads">
              <ArrowLeft className="h-4 w-4" />
              Back to leads
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge module="leads" variant="muted">
          {lead.sourceLabel}
        </Badge>
        {lead.sourceSlug ? (
          <Badge module="profile" variant="secondary">
            /{lead.sourceSlug}
          </Badge>
        ) : null}
        <PtHubLeadStatusBadge status={lead.status} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_340px]">
        <div className="space-y-6">
          <PtHubSectionCard
            module="leads"
            title="Application snapshot"
            description="Key details from the inquiry."
          >
            <DetailRow label="Source" value={lead.sourceLabel} />
            <DetailRow label="Email" value={lead.email || "Not provided"} />
            <DetailRow label="Phone" value={lead.phone || "Not provided"} />
            <DetailRow label="Goal" value={lead.goalSummary} />
            <DetailRow
              label="Experience"
              value={lead.trainingExperience || "Not provided"}
            />
            <DetailRow
              label="Budget"
              value={lead.budgetInterest || "Not provided"}
            />
            <DetailRow
              label="Package interest"
              value={lead.packageInterest || "Not provided"}
            />
          </PtHubSectionCard>

          <PtHubSectionCard
            module="leads"
            title="Internal notes"
            description="Operational context only. These notes are not public."
          >
            <div className="space-y-3">
              {lead.notes.length > 0 ? (
                lead.notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-[22px] border border-border/60 bg-background/45 p-4"
                  >
                    <p className="text-sm text-foreground">{note.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Added {formatRelativeTime(note.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No notes yet. Add context after outreach or review.
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-[22px] border border-border/60 bg-background/35 p-4">
              <label className="text-sm font-medium text-foreground">
                Add note
              </label>
              <textarea
                className="min-h-[120px] w-full app-field px-3 py-2 text-sm"
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="Add outreach details, qualification notes, objections, or next steps."
              />
              <Button
                variant="secondary"
                disabled={saving || !noteBody.trim()}
                onClick={async () => {
                  await onAddNote(lead.id, noteBody);
                  setNoteBody("");
                }}
              >
                <MessageSquarePlus className="h-4 w-4" />
                Add note
              </Button>
            </div>
          </PtHubSectionCard>
        </div>

        <div className="space-y-6">
          <PtHubSectionCard
            module="leads"
            title="Status management"
            description="Move the lead through the PT Hub CRM pipeline."
          >
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Update status
              </label>
              <Select
                value={nextStatus}
                onChange={(event) =>
                  setNextStatus(event.target.value as PTLeadStatus)
                }
              >
                {ptHubLeadStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={saving || nextStatus === initialStatus}
                  className="flex-1"
                  onClick={() => onUpdateStatus(lead.id, nextStatus)}
                >
                  Save status
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={saving}
                  onClick={() => onUpdateStatus(lead.id, "accepted", true)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark converted later
                </Button>
              </div>
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            module="profile"
            title="Conversion state"
            description="Light placeholder until full consultation and conversion workflows land."
          >
            <DetailRow
              label="Converted"
              value={lead.convertedAt ? "Yes" : "Not yet"}
            />
            <DetailRow
              label="Converted at"
              value={
                lead.convertedAt
                  ? formatRelativeTime(lead.convertedAt)
                  : "Not yet"
              }
            />
            <DetailRow
              label="Lead preview"
              value={lead.notesPreview || "No note preview yet"}
            />
            <DetailRow
              label="Source slug"
              value={lead.sourceSlug || "No source slug"}
            />
          </PtHubSectionCard>
        </div>
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  );
}
