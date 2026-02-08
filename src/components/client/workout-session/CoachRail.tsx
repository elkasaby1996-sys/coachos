import { ListChecks } from "lucide-react";
import { DashboardCard } from "../../pt/dashboard/DashboardCard";
import { RestTimer } from "./RestTimer";

export function CoachRail({
  sessionNotes,
  completedSets,
  totalSets,
  progressPct,
  restTimerEnabled,
  autoStartEnabled,
  autoStartTrigger,
  onToggleRestTimer,
  onToggleAutoStart,
}: {
  sessionNotes: string | null;
  completedSets: number;
  totalSets: number;
  progressPct: number;
  restTimerEnabled: boolean;
  autoStartEnabled: boolean;
  autoStartTrigger: number;
  onToggleRestTimer: (next: boolean) => void;
  onToggleAutoStart: (next: boolean) => void;
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
      <DashboardCard title="Rest timer">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={restTimerEnabled}
            onChange={(event) => onToggleRestTimer(event.target.checked)}
          />
          Show timer panel
        </label>
      </DashboardCard>
      {restTimerEnabled ? (
        <RestTimer
          autoStartEnabled={autoStartEnabled}
          autoStartTrigger={autoStartTrigger}
          onToggleAutoStart={onToggleAutoStart}
        />
      ) : null}
    </div>
  );
}
