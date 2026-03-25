import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, MessageSquarePlus } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { PtHubSectionCard } from "./pt-hub-section-card";
import { PtHubLeadStatusBadge } from "./pt-hub-lead-status-badge";
import { ptHubLeadStatuses } from "./pt-hub-lead-statuses";
import type { PTLead, PTLeadStatus } from "../types";
import { formatRelativeTime } from "../../../lib/relative-time";

export function PtHubLeadDetailDialog({
  lead,
  open,
  saving,
  onOpenChange,
  onUpdateStatus,
  onAddNote,
}: {
  lead: PTLead | null;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
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
    () => lead?.status ?? "reviewed",
    [lead?.status],
  );

  useEffect(() => {
    setNextStatus(lead?.status ?? "reviewed");
    setNoteBody("");
  }, [lead]);

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-screen max-w-2xl translate-x-0 translate-y-0 rounded-none border-l border-border/70 bg-[linear-gradient(180deg,rgba(12,17,28,0.98),rgba(9,13,24,1))] p-0">
        <div className="flex h-full flex-col overflow-hidden">
          <DialogHeader className="border-b border-border/70 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-10">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="muted">{lead.sourceLabel}</Badge>
                  {lead.sourceSlug ? (
                    <Badge variant="secondary">/{lead.sourceSlug}</Badge>
                  ) : null}
                </div>
                <DialogTitle className="text-2xl">{lead.fullName}</DialogTitle>
                <DialogDescription>
                  Submitted {formatRelativeTime(lead.submittedAt)}. Use this
                  panel to qualify, note, and progress the lead.
                </DialogDescription>
              </div>
              <PtHubLeadStatusBadge status={lead.status} />
            </div>
          </DialogHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_340px]">
              <div className="space-y-6">
                <PtHubSectionCard
                  title="Application snapshot"
                  description="Key details from the inquiry."
                >
                  <DetailRow label="Source" value={lead.sourceLabel} />
                  <DetailRow
                    label="Email"
                    value={lead.email || "Not provided"}
                  />
                  <DetailRow
                    label="Phone"
                    value={lead.phone || "Not provided"}
                  />
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
                      className="min-h-[120px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
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
                  title="Status management"
                  description="Move the lead through the PT Hub CRM pipeline."
                >
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground">
                      Update status
                    </label>
                    <select
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
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
                    </select>
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
                        onClick={() =>
                          onUpdateStatus(lead.id, "accepted", true)
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark converted later
                      </Button>
                    </div>
                  </div>
                </PtHubSectionCard>

                <PtHubSectionCard
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
