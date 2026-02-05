import { ListChecks } from "lucide-react";
import { DashboardCard } from "../../pt/dashboard/DashboardCard";

export function CoachRail({
  sessionNotes,
  completedSets,
  totalSets,
  progressPct,
}: {
  sessionNotes: string | null;
  completedSets: number;
  totalSets: number;
  progressPct: number;
}) {
  return (
    <div className="space-y-4">
      <DashboardCard title="Coach notes">
        <p className="text-sm text-muted-foreground">
          {sessionNotes ?? "No additional notes from your coach."}
        </p>
      </DashboardCard>
      <DashboardCard title="Session progress">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {completedSets}/{totalSets} sets completed
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/40">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListChecks className="h-4 w-4 text-primary" />
            Track progress as you go.
          </div>
        </div>
      </DashboardCard>
      <DashboardCard title="Rest timer" subtitle="Coming in step 3.">
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
          Rest timer placeholder
        </div>
      </DashboardCard>
    </div>
  );
}
