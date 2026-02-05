import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, TimerReset } from "lucide-react";
import { Button } from "../../ui/button";
import { DashboardCard } from "../../pt/dashboard/DashboardCard";

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

type RestTimerProps = {
  autoStartEnabled: boolean;
  onToggleAutoStart: (next: boolean) => void;
  autoStartTrigger: number;
};

export function RestTimer({
  autoStartEnabled,
  onToggleAutoStart,
  autoStartTrigger,
}: RestTimerProps) {
  const [duration, setDuration] = useState(90);
  const [remaining, setRemaining] = useState(90);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalRef.current ?? undefined);
          intervalRef.current = null;
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  useEffect(() => {
    setRemaining(duration);
  }, [duration]);

  useEffect(() => {
    if (!autoStartEnabled) return;
    if (autoStartTrigger <= 0) return;
    setRemaining((prev) => (prev > 0 ? prev : duration));
    setIsRunning(true);
  }, [autoStartEnabled, autoStartTrigger, duration]);

  const toggle = () => setIsRunning((prev) => !prev);
  const reset = () => {
    setIsRunning(false);
    setRemaining(duration);
  };

  const addSeconds = (delta: number) => {
    setDuration((prev) => Math.max(30, prev + delta));
  };

  const progressPct = useMemo(() => {
    if (duration <= 0) return 0;
    return Math.round((remaining / duration) * 100);
  }, [duration, remaining]);

  return (
    <DashboardCard title="Rest timer" subtitle="Stay on pace between sets.">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-3xl font-semibold tabular-nums text-foreground">
            {formatTime(remaining)}
          </div>
          <div className="text-xs text-muted-foreground">{duration}s default</div>
        </div>
        <div className="h-2 w-full rounded-full bg-muted/40">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={toggle}>
            {isRunning ? (
              <>
                <Pause className="mr-2 h-4 w-4" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Start
              </>
            )}
          </Button>
          <Button size="sm" variant="secondary" onClick={reset}>
            <TimerReset className="mr-2 h-4 w-4" /> Reset
          </Button>
          <Button size="sm" variant="ghost" onClick={() => addSeconds(30)}>
            +30s
          </Button>
          <Button size="sm" variant="ghost" onClick={() => addSeconds(-30)}>
            -30s
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={autoStartEnabled}
            onChange={(event) => onToggleAutoStart(event.target.checked)}
          />
          Auto-start on completed set
        </label>
      </div>
    </DashboardCard>
  );
}
