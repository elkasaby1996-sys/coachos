import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  MessageSquarePlus,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { FieldCharacterMeta } from "../../../components/common/field-character-meta";
import { PtHubPageHeader } from "./pt-hub-page-header";
import { PtHubSectionCard } from "./pt-hub-section-card";
import { PtHubLeadStatusBadge } from "./pt-hub-lead-status-badge";
import { ptHubLeadStatuses } from "./pt-hub-lead-statuses";
import { getPackageDisplayState } from "../lib/pt-hub-package-state";
import { getLeadPrimaryPackageContext } from "../lib/pt-hub-lead-package-context";
import {
  getPtHubLeadApproveErrorCode,
  PT_HUB_LEAD_APPROVE_ERROR_TRANSFER_REQUIRED,
} from "../lib/pt-hub";
import type { PTLead, PTLeadMessage, PTLeadStatus, PTPackage } from "../types";
import { formatRelativeTime } from "../../../lib/relative-time";
import { getCharacterLimitState } from "../../../lib/character-limits";

const ASSIGN_WORKSPACE_LATER_VALUE = "__assign_later__";
const CREATE_NEW_WORKSPACE_VALUE = "__create_new__";

function formatTrainingExperience(value: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "Not provided";
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return `${normalized} year${normalized === "1" ? "" : "s"}`;
  }
  return normalized;
}

export function PtHubLeadDetailView({
  lead,
  currentPackage,
  currentPackageLookupLoading,
  workspaces,
  currentUserId,
  leadChatMessages,
  leadChatStatus,
  leadChatArchivedReason,
  sendingLeadMessage,
  saving,
  onUpdateStatus,
  onApprove,
  onDecline,
  onSendLeadMessage,
  onAddNote,
}: {
  lead: PTLead;
  currentPackage: PTPackage | null;
  currentPackageLookupLoading: boolean;
  workspaces: Array<{ id: string; name: string }>;
  currentUserId: string | null;
  leadChatMessages: PTLeadMessage[];
  leadChatStatus: "open" | "archived" | "missing";
  leadChatArchivedReason: "converted" | "declined" | "manual" | null;
  sendingLeadMessage: boolean;
  saving: boolean;
  onUpdateStatus: (leadId: string, status: PTLeadStatus) => Promise<void>;
  onApprove: (
    leadId: string,
    params: {
      workspaceId?: string | null;
      workspaceName?: string | null;
      allowTransfer?: boolean;
    },
  ) => Promise<void>;
  onDecline: (leadId: string) => Promise<void>;
  onSendLeadMessage: (leadId: string, body: string) => Promise<void>;
  onAddNote: (leadId: string, body: string) => Promise<void>;
}) {
  const [nextStatus, setNextStatus] = useState<PTLeadStatus>("new");
  const [noteBody, setNoteBody] = useState("");
  const [leadMessageBody, setLeadMessageBody] = useState("");
  const [workspaceAssignment, setWorkspaceAssignment] = useState<string>(
    ASSIGN_WORKSPACE_LATER_VALUE,
  );
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [approvalFeedback, setApprovalFeedback] = useState<{
    tone: "error";
    text: string;
  } | null>(null);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const manualStatusOptions = ptHubLeadStatuses.filter(
    (status) => status !== "converted",
  ) as PTLeadStatus[];
  const noteLimitState = getCharacterLimitState({
    value: noteBody,
    kind: "default_text",
    fieldLabel: "Note",
  });
  const leadMessageLimitState = getCharacterLimitState({
    value: leadMessageBody,
    kind: "default_text",
    fieldLabel: "Lead message",
  });
  const workspaceNameLimitState = getCharacterLimitState({
    value: newWorkspaceName,
    kind: "default_text",
    fieldLabel: "Workspace name",
  });

  const initialStatus = useMemo(() => lead.status ?? "new", [lead.status]);
  const packageSelection = useMemo(
    () => getLeadPrimaryPackageContext(lead),
    [lead],
  );
  const statusSelectValue = manualStatusOptions.includes(nextStatus)
    ? nextStatus
    : "contacted";

  useEffect(() => {
    setNextStatus(lead.status ?? "new");
    setNoteBody("");
    setLeadMessageBody("");
    setApprovalFeedback(null);
    setTransferConfirmOpen(false);
    setWorkspaceAssignment(
      lead.convertedWorkspaceId ??
        workspaces[0]?.id ??
        ASSIGN_WORKSPACE_LATER_VALUE,
    );
    setNewWorkspaceName("");
  }, [lead, workspaces]);

  const isCreatingWorkspace = workspaceAssignment === CREATE_NEW_WORKSPACE_VALUE;
  const selectedWorkspaceId =
    workspaceAssignment === ASSIGN_WORKSPACE_LATER_VALUE ||
    workspaceAssignment === CREATE_NEW_WORKSPACE_VALUE
      ? null
      : workspaceAssignment;
  const selectedWorkspaceName = isCreatingWorkspace
    ? newWorkspaceName.trim()
    : null;
  const currentWorkspaceName =
    workspaces.find((workspace) => workspace.id === lead.convertedWorkspaceId)?.name ??
    "current workspace";
  const transferTargetWorkspaceName = isCreatingWorkspace
    ? selectedWorkspaceName || "new workspace"
    : selectedWorkspaceId
      ? workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.name ??
        "selected workspace"
      : null;
  const isConvertedLead = lead.status === "converted";
  const requiresTransferConfirmation =
    isConvertedLead &&
    (Boolean(selectedWorkspaceName) ||
      (selectedWorkspaceId !== null &&
        selectedWorkspaceId !== lead.convertedWorkspaceId));
  const approveDisabled =
    saving ||
    workspaceNameLimitState.overLimit ||
    (isCreatingWorkspace && !newWorkspaceName.trim());
  const selectedAtApplicationLabel =
    packageSelection.label ?? "No package selected";
  const showCurrentPackageUnavailableMessage =
    packageSelection.label !== null &&
    Boolean(lead.packageInterestId) &&
    !currentPackage &&
    !currentPackageLookupLoading;

  const submitApproval = async (allowTransfer: boolean) => {
    try {
      setApprovalFeedback(null);
      await onApprove(lead.id, {
        workspaceId: selectedWorkspaceId,
        workspaceName: selectedWorkspaceName,
        allowTransfer,
      });
      setTransferConfirmOpen(false);
    } catch (error) {
      const errorCode = getPtHubLeadApproveErrorCode(error);
      if (errorCode === PT_HUB_LEAD_APPROVE_ERROR_TRANSFER_REQUIRED) {
        setApprovalFeedback({
          tone: "error",
          text:
            "Transfer confirmation is required before moving this lead to a different workspace.",
        });
        return;
      }
      setApprovalFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update workspace assignment right now.",
      });
    }
  };

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
              value={formatTrainingExperience(lead.trainingExperience)}
            />
            {lead.budgetInterest ? (
              <DetailRow label="Budget (legacy)" value={lead.budgetInterest} />
            ) : null}
          </PtHubSectionCard>

          <PtHubSectionCard
            module="leads"
            title="Package interest"
            description="Package context captured for qualification review."
          >
            <DetailRow
              label="Selected at application"
              value={selectedAtApplicationLabel}
            />
            <p className="text-xs text-muted-foreground">
              Captured from the applicant&apos;s selection at the time they applied.
            </p>
            {currentPackage ? (
              <>
                <DetailRow label="Current package" value={currentPackage.title} />
                <DetailRow
                  label="Current state"
                  value={getPackageDisplayState(currentPackage)}
                />
              </>
            ) : null}
            {currentPackageLookupLoading && lead.packageInterestId ? (
              <p className="text-xs text-muted-foreground">
                Loading current package reference...
              </p>
            ) : null}
            {showCurrentPackageUnavailableMessage ? (
              <p className="text-xs text-muted-foreground">
                Current package record is unavailable, but the selected-at-application
                label remains preserved.
              </p>
            ) : null}
          </PtHubSectionCard>

          <PtHubSectionCard
            module="coaching"
            title="Lead chat"
            description="Pre-workspace conversation between you and this lead."
          >
            {leadChatStatus === "missing" ? (
              <p className="text-sm text-muted-foreground">
                Lead chat is being prepared. Try again in a moment.
              </p>
            ) : (
              <div className="space-y-3">
                {leadChatStatus === "archived" ? (
                  <div className="rounded-[22px] border border-border/60 bg-background/35 p-3 text-sm text-muted-foreground">
                    This conversation is archived
                    {leadChatArchivedReason === "converted"
                      ? " after conversion."
                      : leadChatArchivedReason === "declined"
                        ? " after decline."
                        : "."}
                  </div>
                ) : null}

                {leadChatMessages.length > 0 ? (
                  <div className="max-h-[22rem] space-y-2 overflow-y-auto rounded-[22px] border border-border/60 bg-background/30 p-3">
                    {leadChatMessages.map((message) => {
                      const isCurrentUser =
                        currentUserId && message.senderUserId === currentUserId;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-[20px] border px-3 py-2 text-sm ${
                              isCurrentUser
                                ? "border-primary/25 bg-primary/10 text-foreground"
                                : "border-border/60 bg-background/55 text-foreground"
                            }`}
                          >
                            <p>{message.body}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {formatRelativeTime(message.sentAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No messages yet. Send a first message to begin the lead conversation.
                  </p>
                )}

                {leadChatStatus === "open" ? (
                  <div className="space-y-3 rounded-[22px] border border-border/60 bg-background/35 p-4">
                    <label className="text-sm font-medium text-foreground">
                      Message lead
                    </label>
                    <Textarea
                      isInvalid={leadMessageLimitState.overLimit}
                      className="min-h-[110px]"
                      value={leadMessageBody}
                      onChange={(event) => setLeadMessageBody(event.target.value)}
                      placeholder="Send a message to this lead..."
                    />
                    <FieldCharacterMeta
                      count={leadMessageLimitState.count}
                      limit={leadMessageLimitState.limit}
                      errorText={leadMessageLimitState.errorText}
                    />
                    <Button
                      disabled={
                        saving ||
                        sendingLeadMessage ||
                        !leadMessageBody.trim() ||
                        leadMessageLimitState.overLimit
                      }
                      onClick={async () => {
                        if (leadMessageLimitState.overLimit) return;
                        await onSendLeadMessage(lead.id, leadMessageBody);
                        setLeadMessageBody("");
                      }}
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                      Send message
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
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
              <Textarea
                isInvalid={noteLimitState.overLimit}
                className="min-h-[120px]"
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="Add outreach details, qualification notes, objections, or next steps."
              />
              <FieldCharacterMeta
                count={noteLimitState.count}
                limit={noteLimitState.limit}
                errorText={noteLimitState.errorText}
              />
              <Button
                variant="secondary"
                disabled={saving || !noteBody.trim() || noteLimitState.overLimit}
                onClick={async () => {
                  if (noteLimitState.overLimit) return;
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
                value={statusSelectValue}
                onChange={(event) =>
                  setNextStatus(event.target.value as PTLeadStatus)
                }
              >
                {manualStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
              <Button
                disabled={
                  saving ||
                  nextStatus === initialStatus ||
                  !manualStatusOptions.includes(nextStatus)
                }
                onClick={() => onUpdateStatus(lead.id, nextStatus)}
              >
                Save status
              </Button>
            </div>

            <div className="space-y-3 rounded-[20px] border border-border/60 bg-background/35 p-4">
              <label className="text-sm font-medium text-foreground">
                Workspace assignment for approval
              </label>
              <Select
                value={workspaceAssignment}
                onChange={(event) => setWorkspaceAssignment(event.target.value)}
              >
                <option value={ASSIGN_WORKSPACE_LATER_VALUE}>
                  Approve now, assign workspace later
                </option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
                <option value={CREATE_NEW_WORKSPACE_VALUE}>
                  Create new workspace
                </option>
              </Select>

              {isCreatingWorkspace ? (
                <>
                  <Input
                    isInvalid={workspaceNameLimitState.overLimit}
                    value={newWorkspaceName}
                    onChange={(event) => setNewWorkspaceName(event.target.value)}
                    placeholder="New workspace name"
                  />
                  <FieldCharacterMeta
                    count={workspaceNameLimitState.count}
                    limit={workspaceNameLimitState.limit}
                    errorText={workspaceNameLimitState.errorText}
                  />
                </>
              ) : null}

              {isConvertedLead ? (
                <p className="text-xs text-muted-foreground">
                  This lead has been converted and assigned to "{currentWorkspaceName}" workspace.
                </p>
              ) : null}
              {isConvertedLead && requiresTransferConfirmation ? (
                <p className="text-xs text-muted-foreground">
                  Transferring to {transferTargetWorkspaceName ? `"${transferTargetWorkspaceName}"` : "another workspace"}{" "}
                  will reset workspace-related client data, and the client will start over.
                </p>
              ) : null}
              {approvalFeedback ? (
                <p className="text-xs text-destructive">{approvalFeedback.text}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  className="flex-1"
                  disabled={approveDisabled || isConvertedLead}
                  onClick={() => {
                    if (requiresTransferConfirmation) {
                      setTransferConfirmOpen(true);
                      return;
                    }
                    void submitApproval(false);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isConvertedLead
                    ? "Lead already converted"
                    : workspaceAssignment === ASSIGN_WORKSPACE_LATER_VALUE
                    ? "Approve (workspace later)"
                    : requiresTransferConfirmation
                      ? "Transfer lead"
                      : "Approve and convert"}
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={saving || isConvertedLead}
                  onClick={() => onDecline(lead.id)}
                >
                  <XCircle className="h-4 w-4" />
                  Decline lead
                </Button>
                {isConvertedLead ? (
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={saving || !requiresTransferConfirmation || approveDisabled}
                    onClick={() => {
                      setTransferConfirmOpen(true);
                    }}
                  >
                    Transfer workspace
                  </Button>
                ) : null}
              </div>
            </div>
          </PtHubSectionCard>

          <AlertDialog
            open={transferConfirmOpen}
            onOpenChange={(open) => {
              if (!open && !saving) {
                setTransferConfirmOpen(false);
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Transfer lead to another workspace?</AlertDialogTitle>
                <AlertDialogDescription>
                  This lead is already assigned to {currentWorkspaceName}. If you transfer them,
                  they will lose workspace-related client data in the current workspace and start
                  over in the new workspace.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
                <Button
                  variant="secondary"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={saving}
                  onClick={() => {
                    void submitApproval(true);
                  }}
                >
                  Transfer lead and reset workspace data
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <PtHubSectionCard
            module="profile"
            title="Conversion state"
            description="Tracks workspace assignment and client conversion."
          >
            <DetailRow
              label="Converted"
              value={lead.status === "converted" ? "Yes" : "Not yet"}
            />
            <DetailRow
              label="Converted at"
              value={
                lead.convertedAt ? formatRelativeTime(lead.convertedAt) : "Not yet"
              }
            />
            <DetailRow
              label="Lead preview"
              value={
                lead.leadLastMessagePreview ||
                lead.notesPreview ||
                "No message preview yet"
              }
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
