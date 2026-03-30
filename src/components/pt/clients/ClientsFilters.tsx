import { Search } from "lucide-react";
import type { ClientSegmentKey } from "../../../lib/client-lifecycle";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const segments: Array<{ key: ClientSegmentKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "onboarding_incomplete", label: "Onboarding incomplete" },
  { key: "checkin_overdue", label: "Check-in overdue" },
  { key: "at_risk", label: "At risk" },
  { key: "paused", label: "Paused" },
];

export function ClientsFilters({
  searchValue,
  onSearchChange,
  activeSegment,
  onSegmentChange,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  activeSegment: ClientSegmentKey;
  onSegmentChange: (value: ClientSegmentKey) => void;
}) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-72">
        <Input
          placeholder="Search clients, goals, or risks..."
          className="h-9 rounded-full bg-secondary/40 pl-10"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      <div className="flex flex-wrap gap-2">
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
