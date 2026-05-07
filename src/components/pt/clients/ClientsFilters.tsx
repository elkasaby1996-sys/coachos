import { Search } from "lucide-react";
import type {
  ClientLifecycleState,
  ClientSegmentKey,
} from "../../../lib/client-lifecycle";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select } from "../../ui/select";

export type ClientLifecycleFilterKey = "all" | ClientLifecycleState;

const segments: Array<{ key: ClientSegmentKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "onboarding_incomplete", label: "Onboarding incomplete" },
  { key: "checkin_overdue", label: "Check-in overdue" },
  { key: "at_risk", label: "At risk" },
  { key: "paused", label: "Paused" },
];

const lifecycleFilters: Array<{
  key: ClientLifecycleFilterKey;
  label: string;
}> = [
  { key: "all", label: "All lifecycles" },
  { key: "invited", label: "Invited" },
  { key: "onboarding", label: "Onboarding" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
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
      <div className="grid w-full gap-3 md:grid-cols-[minmax(16rem,1fr)_10rem_minmax(0,1.7fr)] md:items-end">
        <div className="space-y-1.5">
          <Label
            htmlFor="pt-client-filter-search"
            className="text-xs font-semibold text-muted-foreground"
          >
            Search
          </Label>
          <div className="relative">
            <Input
              id="pt-client-filter-search"
              placeholder="Name, goal, or risk"
              className="app-search-input app-search-input-sm pl-10"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            <Search className="app-search-icon h-4 w-4" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="pt-client-filter-lifecycle"
            className="text-xs font-semibold text-muted-foreground"
          >
            Lifecycle
          </Label>
          <Select
            id="pt-client-filter-lifecycle"
            variant="filter"
            size="sm"
            className="w-full"
            value={activeLifecycle}
            onChange={(event) =>
              onLifecycleChange(event.target.value as ClientLifecycleFilterKey)
            }
          >
            {lifecycleFilters.map((filter) => (
              <option key={filter.key} value={filter.key}>
                {filter.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Segment</p>
          <div className="flex flex-wrap items-center gap-2">
            {segments.map((segment) => (
              <Button
                key={segment.key}
                variant={
                  activeSegment === segment.key ? "default" : "secondary"
                }
                size="sm"
                onClick={() => onSegmentChange(segment.key)}
              >
                {segment.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
