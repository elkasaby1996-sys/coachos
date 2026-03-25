import { ArrowUpRight } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import type { PTClientSummary } from "../types";

export function PtHubClientTable({
  clients,
  onOpen,
}: {
  clients: PTClientSummary[];
  onOpen: (client: PTClientSummary) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-background/20">
      <div className="hidden grid-cols-[minmax(0,1.2fr)_180px_160px_160px] gap-4 border-b border-border/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:grid">
        <span>Client</span>
        <span>Workspace</span>
        <span>Status</span>
        <span className="text-right">Action</span>
      </div>
      <div className="divide-y divide-border/60">
        {clients.map((client) => (
          <div
            key={client.id}
            className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.2fr)_180px_160px_160px] lg:items-center"
          >
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {client.displayName}
              </p>
              <p className="text-sm text-muted-foreground">
                {client.goal || "No goal captured yet"}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Recent activity {client.recentActivityLabel}</span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="inline-flex rounded-full border border-border/60 px-3 py-1">
                {client.workspaceName}
              </span>
            </div>
            <div>
              <Badge
                variant={
                  client.status.trim().toLowerCase() === "active"
                    ? "success"
                    : client.status.trim().toLowerCase() === "paused"
                      ? "warning"
                      : "muted"
                }
              >
                {client.status}
              </Badge>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => onOpen(client)}>
                Open workspace
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
