import { useEffect, useState } from "react";
import type React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  MailPlus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../../components/ui/alert";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Select } from "../../../../components/ui/select";
import { Skeleton } from "../../../../components/ui/skeleton";
import {
  SettingsHeader,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";
import {
  createWorkspaceTeamInvite,
  listWorkspaceTeamSettings,
  resendWorkspaceTeamInvite,
  revokeWorkspaceTeamInvite,
  searchWorkspaceTeamClients,
  updateWorkspaceTeamMemberClients,
  updateWorkspaceTeamMemberRole,
  updateWorkspaceTeamMemberStatus,
  type WorkspaceTeamClientOption,
  type WorkspaceTeamInviteRow,
  type WorkspaceTeamMemberRow,
} from "../../../../features/workspace-team/team-settings";
import type {
  WorkspaceTeamInviteCreated,
  WorkspaceTeamInviteResent,
} from "../../../../features/workspace-team/invite-api";
import type {
  ClientAccessMode,
  InviteStatus,
  InvitableWorkspaceRole,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from "../../../../features/workspace-team/contracts";
import { cn } from "../../../../lib/utils";
import { useWorkspaceSettingsOutletContext } from "../outlet-context";

const roleOptions: Array<{ value: InvitableWorkspaceRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "coach", label: "Coach" },
  { value: "assistant_coach", label: "Assistant Coach" },
  { value: "viewer", label: "Viewer" },
];

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  coach: "Coach",
  assistant_coach: "Assistant Coach",
  viewer: "Viewer",
};

const accessLabels: Record<ClientAccessMode, string> = {
  all_clients: "All clients",
  assigned_clients_only: "Assigned clients only",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getRoleValue(value: string): InvitableWorkspaceRole {
  if (
    value === "admin" ||
    value === "coach" ||
    value === "assistant_coach" ||
    value === "viewer"
  ) {
    return value;
  }
  return "assistant_coach";
}

function getAccessModeValue(value: string): ClientAccessMode {
  return value === "all_clients" ? "all_clients" : "assigned_clients_only";
}

export function RoleBadge({ role }: { role: WorkspaceRole }) {
  return <Badge module="coaching">{roleLabels[role]}</Badge>;
}

export function MemberStatusBadge({
  status,
}: {
  status: WorkspaceMemberStatus;
}) {
  const tone =
    status === "active"
      ? "success"
      : status === "suspended"
        ? "warning"
        : "danger";
  return <Badge tone={tone}>{status}</Badge>;
}

export function InviteStatusBadge({ status }: { status: InviteStatus }) {
  const tone =
    status === "pending"
      ? "info"
      : status === "accepted"
        ? "success"
        : status === "expired"
          ? "neutral"
          : "danger";
  return <Badge tone={tone}>{status}</Badge>;
}

export function ClientAccessBadge({
  mode,
  assignedCount,
}: {
  mode: ClientAccessMode;
  assignedCount: number | null | undefined;
}) {
  return (
    <Badge variant="muted">
      {mode === "all_clients"
        ? accessLabels[mode]
        : `${assignedCount ?? 0} assigned clients`}
    </Badge>
  );
}

function TeamToast({
  message,
  variant,
  onDismiss,
}: {
  message: string | null;
  variant: "success" | "error";
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <Alert tone={variant === "success" ? "success" : "danger"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <AlertTitle>{variant === "success" ? "Success" : "Error"}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </div>
        <button
          type="button"
          className="rounded-full p-1 text-muted-foreground transition hover:text-foreground"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Alert>
  );
}

type InviteDeliveryFallback = {
  email: string;
  acceptUrl: string;
  source: "created" | "resent";
};

function InviteDeliveryFallbackPanel({
  invite,
  onCopied,
  onError,
}: {
  invite: InviteDeliveryFallback | null;
  onCopied: () => void;
  onError: (message: string) => void;
}) {
  if (!invite) return null;

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(invite.acceptUrl);
      onCopied();
    } catch {
      onError("Unable to copy invite link.");
    }
  };

  return (
    <Alert tone="warning">
      <div className="space-y-3">
        <div>
          <AlertTitle>
            {invite.source === "resent"
              ? "Invite link refreshed"
              : "Invite created"}
          </AlertTitle>
          <AlertDescription>
            Email delivery is queued. Share this invite link with {invite.email}
            if the email does not arrive.
          </AlertDescription>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={invite.acceptUrl} readOnly aria-label="Invite link" />
          <Button type="button" variant="secondary" onClick={copyInviteLink}>
            <Copy className="h-4 w-4" />
            Copy link
          </Button>
        </div>
      </div>
    </Alert>
  );
}

function ClientAssignmentPicker({
  workspaceId,
  selectedClientIds,
  onChange,
}: {
  workspaceId: string;
  selectedClientIds: string[];
  onChange: (clientIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const clientsQuery = useQuery({
    queryKey: ["workspace-team-client-picker", workspaceId, search],
    queryFn: () =>
      searchWorkspaceTeamClients({
        workspaceId,
        search,
        limit: 50,
      }),
    enabled: Boolean(workspaceId),
  });
  const selected = new Set(selectedClientIds);

  const toggleClient = (client: WorkspaceTeamClientOption) => {
    if (selected.has(client.id)) {
      onChange(selectedClientIds.filter((clientId) => clientId !== client.id));
      return;
    }
    onChange([...selectedClientIds, client.id]);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="team-client-search">Search clients</Label>
        <div className="relative">
          <Search className="app-search-icon h-4 w-4" />
          <Input
            id="team-client-search"
            className="app-search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or email"
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{selectedClientIds.length} selected</span>
        {selectedClientIds.length ? (
          <button
            type="button"
            className="text-foreground underline"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-border/70 bg-muted/20 p-2">
        {clientsQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 rounded-xl" />
          ))
        ) : clientsQuery.error ? (
          <p className="px-2 py-4 text-sm text-[var(--state-danger-text)]">
            Unable to load clients.
          </p>
        ) : clientsQuery.data?.length ? (
          clientsQuery.data.map((client) => {
            const checked = selected.has(client.id);
            return (
              <button
                key={client.id}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition",
                  checked
                    ? "border-primary/40 bg-primary/10"
                    : "border-border/60 bg-card/30 hover:border-border",
                )}
                onClick={() => toggleClient(client)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {client.displayName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {client.email ?? "No email"}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {checked ? <Check className="h-3 w-3" /> : null}
                </span>
              </button>
            );
          })
        ) : (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            No clients found.
          </p>
        )}
      </div>
    </div>
  );
}

function InviteTeamMemberDialog({
  workspaceId,
  open,
  onOpenChange,
  onSuccess,
  onError,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (invite: WorkspaceTeamInviteCreated) => void;
  onError: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableWorkspaceRole>("assistant_coach");
  const [clientAccessMode, setClientAccessMode] = useState<ClientAccessMode>(
    "assigned_clients_only",
  );
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const queryClient = useQueryClient();
  const emailIsValid = /\S+@\S+\.\S+/.test(email.trim());
  const showZeroWarning =
    clientAccessMode === "assigned_clients_only" && clientIds.length === 0;

  const inviteMutation = useMutation({
    mutationFn: () =>
      createWorkspaceTeamInvite({
        workspaceId,
        email,
        role,
        clientAccessMode,
        clientIds,
        baseUrl: window.location.origin,
      }),
    onSuccess: async (invite) => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-team-settings", workspaceId],
      });
      setEmail("");
      setRole("assistant_coach");
      setClientAccessMode("assigned_clients_only");
      setClientIds([]);
      setSubmitted(false);
      onOpenChange(false);
      onSuccess(invite);
    },
    onError: (error) => {
      onError(
        error instanceof Error ? error.message : "Unable to send invite.",
      );
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (!emailIsValid) return;
    inviteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Invite a coach or assistant to help manage clients in this
            workspace.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="team-invite-email">Email</Label>
            <Input
              id="team-invite-email"
              type="email"
              value={email}
              isInvalid={submitted && !emailIsValid}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="coach@example.com"
            />
            {submitted && !emailIsValid ? (
              <p className="text-xs text-[var(--state-danger-text)]">
                Enter a valid email address.
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-invite-role">Role</Label>
              <Select
                id="team-invite-role"
                value={role}
                onChange={(event) => setRole(getRoleValue(event.target.value))}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-invite-access">Client access</Label>
              <Select
                id="team-invite-access"
                value={clientAccessMode}
                onChange={(event) =>
                  setClientAccessMode(getAccessModeValue(event.target.value))
                }
              >
                <option value="assigned_clients_only">
                  Assigned clients only
                </option>
                <option value="all_clients">All clients</option>
              </Select>
            </div>
          </div>
          {clientAccessMode === "assigned_clients_only" ? (
            <ClientAssignmentPicker
              workspaceId={workspaceId}
              selectedClientIds={clientIds}
              onChange={setClientIds}
            />
          ) : null}
          {showZeroWarning ? (
            <Alert tone="warning">
              <AlertTitle>No clients selected</AlertTitle>
              <AlertDescription>
                This member will not see any clients until clients are assigned.
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? "Sending..." : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClientAssignmentDialog({
  workspaceId,
  member,
  open,
  onOpenChange,
  onSuccess,
  onError,
}: {
  workspaceId: string;
  member: WorkspaceTeamMemberRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [clientIds, setClientIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setClientIds(member?.assignedClientIds ?? []);
  }, [member?.assignedClientIds, open]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateWorkspaceTeamMemberClients({
        workspaceId,
        memberId: member?.id ?? "",
        clientIds,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-team-settings", workspaceId],
      });
      onOpenChange(false);
      onSuccess();
    },
    onError: (error) => {
      onError(
        error instanceof Error
          ? error.message
          : "Unable to save client assignments.",
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage assigned clients</DialogTitle>
          <DialogDescription>
            Update the clients visible to {member?.displayName ?? member?.email}
            . Removing an assignment removes access immediately.
          </DialogDescription>
        </DialogHeader>
        <ClientAssignmentPicker
          workspaceId={workspaceId}
          selectedClientIds={clientIds}
          onChange={setClientIds}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!member?.id || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save assignments"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamMemberTable({
  workspaceId,
  members,
  canManage,
  onToast,
  onError,
}: {
  workspaceId: string;
  members: WorkspaceTeamMemberRow[];
  canManage: boolean;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [assignmentMember, setAssignmentMember] =
    useState<WorkspaceTeamMemberRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    member: WorkspaceTeamMemberRow;
    status: Extract<WorkspaceMemberStatus, "suspended" | "removed">;
  } | null>(null);

  const roleMutation = useMutation({
    mutationFn: (input: { memberId: string; role: InvitableWorkspaceRole }) =>
      updateWorkspaceTeamMemberRole({
        workspaceId,
        memberId: input.memberId,
        role: input.role,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-team-settings", workspaceId],
      });
      onToast("Role updated");
    },
    onError: (error) =>
      onError(
        error instanceof Error ? error.message : "Unable to update role.",
      ),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { memberId: string; status: WorkspaceMemberStatus }) =>
      updateWorkspaceTeamMemberStatus({
        workspaceId,
        memberId: input.memberId,
        status: input.status,
      }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-team-settings", workspaceId],
      });
      setConfirmAction(null);
      onToast(
        variables.status === "suspended"
          ? "Member suspended"
          : "Member removed",
      );
    },
    onError: (error) =>
      onError(
        error instanceof Error ? error.message : "Unable to update member.",
      ),
  });

  if (!members.length) {
    return (
      <p className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        No active team members yet.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border/70">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border/70 bg-muted/30 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Client access</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              {canManage ? (
                <th className="px-4 py-3 font-medium">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {members.map((member, index) => {
              const isOwner = member.role === "owner" || !member.id;
              return (
                <tr
                  key={`${member.id ?? member.userId}:${member.role}:${index}`}
                  className="bg-card/20"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {member.displayName ?? member.email ?? member.userId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.email ?? member.userId}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {canManage && !isOwner && member.id ? (
                      <Select
                        value={member.role}
                        size="sm"
                        onChange={(event) =>
                          roleMutation.mutate({
                            memberId: member.id ?? "",
                            role: getRoleValue(event.target.value),
                          })
                        }
                        disabled={roleMutation.isPending}
                        aria-label={`Change role for ${member.email ?? member.userId}`}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <MemberStatusBadge status={member.status} />
                  </td>
                  <td className="px-4 py-3">
                    <ClientAccessBadge
                      mode={member.clientAccessMode}
                      assignedCount={member.assignedClientCount}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(member.joinedAt ?? member.createdAt)}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <span className="text-xs text-muted-foreground">
                          Owner protected
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setAssignmentMember(member)}
                          >
                            Clients
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setConfirmAction({
                                member,
                                status: "suspended",
                              })
                            }
                          >
                            <UserMinus className="h-4 w-4" />
                            Suspend
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfirmAction({
                                member,
                                status: "removed",
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ClientAssignmentDialog
        workspaceId={workspaceId}
        member={assignmentMember}
        open={Boolean(assignmentMember)}
        onOpenChange={(open) => {
          if (!open) setAssignmentMember(null);
        }}
        onSuccess={() => onToast("Client assignments saved")}
        onError={onError}
      />
      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.status === "suspended"
                ? "Suspend member?"
                : "Remove member?"}
            </DialogTitle>
            <DialogDescription>
              This changes workspace access on the next permission check. The
              owner cannot be removed or demoted from this page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmAction(null)}
              disabled={statusMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!confirmAction?.member.id) return;
                statusMutation.mutate({
                  memberId: confirmAction.member.id,
                  status: confirmAction.status,
                });
              }}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PendingInviteTable({
  workspaceId,
  invites,
  canManage,
  onToast,
  onInviteLink,
  onError,
}: {
  workspaceId: string;
  invites: WorkspaceTeamInviteRow[];
  canManage: boolean;
  onToast: (message: string) => void;
  onInviteLink: (invite: WorkspaceTeamInviteResent) => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [revokeInvite, setRevokeInvite] =
    useState<WorkspaceTeamInviteRow | null>(null);
  const resendMutation = useMutation({
    mutationFn: (inviteId: string) =>
      resendWorkspaceTeamInvite({
        workspaceId,
        inviteId,
        baseUrl: window.location.origin,
      }),
    onSuccess: async (invite) => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-team-settings", workspaceId],
      });
      onInviteLink(invite);
      onToast("Invite link refreshed");
    },
    onError: (error) =>
      onError(
        error instanceof Error ? error.message : "Unable to resend invite.",
      ),
  });
  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) =>
      revokeWorkspaceTeamInvite({ workspaceId, inviteId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-team-settings", workspaceId],
      });
      setRevokeInvite(null);
      onToast("Invite revoked");
    },
    onError: (error) =>
      onError(
        error instanceof Error ? error.message : "Unable to revoke invite.",
      ),
  });

  if (!invites.length) {
    return (
      <p className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        No pending invites.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border/70">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border/70 bg-muted/30 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Client access</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              {canManage ? (
                <th className="px-4 py-3 font-medium">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {invites.map((invite) => (
              <tr key={invite.id} className="bg-card/20">
                <td className="px-4 py-3 font-medium text-foreground">
                  {invite.email}
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={invite.role} />
                </td>
                <td className="px-4 py-3">
                  <InviteStatusBadge status={invite.status} />
                </td>
                <td className="px-4 py-3">
                  <ClientAccessBadge
                    mode={invite.clientAccessMode}
                    assignedCount={invite.assignedClientCount}
                  />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(invite.expiresAt)}
                </td>
                {canManage ? (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={resendMutation.isPending}
                        onClick={() => resendMutation.mutate(invite.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Resend
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevokeInvite(invite)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog
        open={Boolean(revokeInvite)}
        onOpenChange={(open) => {
          if (!open) setRevokeInvite(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke invite?</DialogTitle>
            <DialogDescription>
              This invite link will stop working and cannot be accepted later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRevokeInvite(null)}
              disabled={revokeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (revokeInvite) revokeMutation.mutate(revokeInvite.id);
              }}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function WorkspaceTeamSettingsPage() {
  const { workspaceId, canManage } = useWorkspaceSettingsOutletContext();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);
  const [inviteFallback, setInviteFallback] =
    useState<InviteDeliveryFallback | null>(null);

  const teamQuery = useQuery({
    queryKey: ["workspace-team-settings", workspaceId],
    queryFn: () => listWorkspaceTeamSettings(workspaceId),
    enabled: Boolean(workspaceId && canManage),
  });

  const members = teamQuery.data?.members ?? [];
  const activeMembers = members.filter((member) => member.status === "active");
  const pendingInvites = teamQuery.data?.pendingInvites ?? [];

  return (
    <div className="space-y-5">
      <SettingsHeader
        scope="Workspace"
        title="Team & Permissions"
        description="Invite coaches and assistants to help manage clients in this workspace."
        actions={
          canManage ? (
            <Button type="button" onClick={() => setInviteOpen(true)}>
              <MailPlus className="h-4 w-4" />
              Invite member
            </Button>
          ) : null
        }
      />

      <TeamToast
        message={toast?.message ?? null}
        variant={toast?.variant ?? "success"}
        onDismiss={() => setToast(null)}
      />

      <InviteDeliveryFallbackPanel
        invite={inviteFallback}
        onCopied={() =>
          setToast({ message: "Invite link copied", variant: "success" })
        }
        onError={(message) => setToast({ message, variant: "error" })}
      />

      {!canManage ? (
        <Alert tone="warning">
          <AlertTitle className="inline-flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Permission denied
          </AlertTitle>
          <AlertDescription>
            Team management is limited to workspace owners and admins.
          </AlertDescription>
        </Alert>
      ) : teamQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 rounded-[24px]" />
          <Skeleton className="h-48 rounded-[24px]" />
        </div>
      ) : teamQuery.error ? (
        <Alert tone="danger">
          <AlertTitle className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Unable to load team settings
          </AlertTitle>
          <AlertDescription>
            Refresh the page or check that your workspace permissions are still
            active.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <SettingsSectionCard
            title="Active members"
            action={
              <Badge tone="success">
                <Users className="h-3.5 w-3.5" />
                {activeMembers.length} active
              </Badge>
            }
          >
            <TeamMemberTable
              workspaceId={workspaceId}
              members={activeMembers}
              canManage={canManage}
              onToast={(message) => setToast({ message, variant: "success" })}
              onError={(message) => setToast({ message, variant: "error" })}
            />
          </SettingsSectionCard>

          <SettingsSectionCard
            title="Pending invites"
            action={<Badge tone="info">{pendingInvites.length} invites</Badge>}
          >
            <PendingInviteTable
              workspaceId={workspaceId}
              invites={pendingInvites}
              canManage={canManage}
              onToast={(message) => setToast({ message, variant: "success" })}
              onInviteLink={(invite) =>
                setInviteFallback({
                  email: invite.invitedEmail,
                  acceptUrl: invite.acceptUrl,
                  source: "resent",
                })
              }
              onError={(message) => setToast({ message, variant: "error" })}
            />
          </SettingsSectionCard>
        </>
      )}

      <InviteTeamMemberDialog
        workspaceId={workspaceId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={(invite) => {
          setInviteFallback({
            email: invite.invitedEmail,
            acceptUrl: invite.acceptUrl,
            source: "created",
          });
          setToast({ message: "Invite created", variant: "success" });
        }}
        onError={(message) => setToast({ message, variant: "error" })}
      />
    </div>
  );
}

export function WorkspaceSettingsTeamTab() {
  return <WorkspaceTeamSettingsPage />;
}
