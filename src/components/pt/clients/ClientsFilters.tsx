import { Search } from "lucide-react";
import type {
  ClientLifecycleState,
  ClientSegmentKey,
} from "../../../lib/client-lifecycle";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export type ClientLifecycleFilterKey = "all" | ClientLifecycleState;

const segments: Array<{ key: ClientSegmentKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "onboarding_incomplete", label: "Onboarding incomplete" },
  { key: "checkin_overdue", label: "Check-in overdue" },
  { key: "at_risk", label: "At risk" },
  { key: "paused", label: "Paused" },
];

const lifecycleFilters: Array<{ key: ClientLifecycleFilterKey; label: string }> =
  [
    { key: "all", label: "All lifecycles" },
    { key: "invited", label: "Invited" },
    { key: "onboarding", label: "Onboarding" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "churned", label: "Churned" },
  ];

export function ClientsFilters({
  searchValue,
  onSearchChange,
  activeSegment,
  onSegmentChange,
  activeLifecycle,
  onLifecycleChange,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  activeSegment: ClientSegmentKey;
  onSegmentChange: (value: ClientSegmentKey) => void;
  activeLifecycle: ClientLifecycleFilterKey;
  onLifecycleChange: (value: ClientLifecycleFilterKey) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex w-full flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Input
            placeholder="Search clients, goals, or risks..."
            className="h-9 rounded-full bg-secondary/40 pl-10"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <select
          className="workspace-filter-chip h-9 w-36 shrink-0"
          value={activeLifecycle}
          onChange={(event) =>
            onLifecycleChange(event.target.value as ClientLifecycleFilterKey)
          }
          aria-label="Filter by lifecycle"
        >
          {lifecycleFilters.map((filter) => (
            <option key={filter.key} value={filter.key}>
              {filter.label}
            </option>
          ))}
        </select>
        {segments.map((segment) => (
          <Button
            key={segment.key}
            variant={activeSegment === segment.key ? "default" : "secondary"}
            size="sm"
            onClick={() => onSegmentChange(segment.key)}
          >
            {segment.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
