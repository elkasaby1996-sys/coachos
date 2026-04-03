import { ArrowUpRight, Clock3, UsersRound } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { formatRelativeTime } from "../../../lib/relative-time";
import type { PTWorkspaceSummary } from "../types";
import { PtHubSectionCard } from "./pt-hub-section-card";

const statusVariant: Record<
  PTWorkspaceSummary["status"],
  "secondary" | "success" | "warning"
> = {
  current: "secondary",
  active: "success",
  new: "warning",
};

export function PtHubWorkspaceCard({
  workspace,
  onOpen,
}: {
  workspace: PTWorkspaceSummary;
  onOpen: (workspaceId: string) => void;
}) {
  return (
    <PtHubSectionCard
      title={workspace.name}
      description="A coaching space for managing active clients."
      className="h-full"
      contentClassName="gap-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant[workspace.status]}>
          {workspace.status === "current"
            ? "Current space"
            : workspace.status === "active"
              ? "Active"
              : "New space"}
        </Badge>
        {workspace.role ? (
          <Badge variant="muted">{workspace.role.replace("_", " ")}</Badge>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[22px] border border-border/70 bg-background/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Active clients
          </p>
          <div className="mt-3 flex items-center gap-2 text-lg font-semibold">
            <UsersRound className="h-4 w-4 text-primary [stroke-width:1.7]" />
            <span>{workspace.clientCount ?? 0}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Clients currently managed in this space
          </p>
        </div>
        <div className="rounded-[22px] border border-border/70 bg-background/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Last update
          </p>
          <div className="mt-3 flex items-center gap-2 text-lg font-semibold">
            <Clock3 className="h-4 w-4 text-primary [stroke-width:1.7]" />
            <span>{formatRelativeTime(workspace.lastUpdated)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Most recent activity in this space
          </p>
        </div>
      </div>

      <Button
        variant="secondary"
        className="w-full justify-between"
        onClick={() => onOpen(workspace.id)}
      >
        <span>Open space</span>
        <ArrowUpRight className="h-4 w-4 [stroke-width:1.7]" />
      </Button>
    </PtHubSectionCard>
  );
}
