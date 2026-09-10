import type { AccountCapacitySnapshot } from "./contracts";
import {
  capacityLabels,
  capacityStateLabels,
  formatCapacityUsage,
} from "./formatters";

export function CapacityMeters({
  snapshot,
}: {
  snapshot: AccountCapacitySnapshot;
}) {
  return (
    <div className="space-y-5">
      {snapshot.dimensions.map((d) => (
        <div
          key={d.key}
          data-testid={`capacity-${d.key}`}
          className="space-y-2"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">{capacityLabels[d.key]}</h3>
            <span
              className={
                d.state === "over_limit" || d.state === "at_limit"
                  ? "text-sm font-medium text-danger"
                  : "text-sm text-muted-foreground"
              }
            >
              {capacityStateLabels[d.state]}
            </span>
          </div>
          <p className="text-sm tabular-nums">{formatCapacityUsage(d)}</p>
          {d.key === "coach_seats" && d.included !== null ? (
            <p className="text-sm text-muted-foreground">
              {d.included} included ·{" "}
              {d.limit === null ? "Unlimited maximum" : `maximum ${d.limit}`}
              {d.aboveIncludedBy
                ? ` · ${d.aboveIncludedBy} above included`
                : ""}
            </p>
          ) : null}
          {d.limit !== null && d.state !== "unavailable" ? (
            <div
              role="progressbar"
              aria-label={`${capacityLabels[d.key]} committed capacity`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(d.utilizationPercent ?? 0, 100)}
              aria-valuetext={`${d.committed} committed of ${d.limit}; ${capacityStateLabels[d.state]}`}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={`h-full ${d.state === "over_limit" || d.state === "at_limit" ? "bg-danger" : "bg-primary"}`}
                style={{
                  width: `${Math.min(d.utilizationPercent ?? 0, 100)}%`,
                }}
              />
            </div>
          ) : null}
          {d.overBy > 0 ? (
            <p className="text-sm text-muted-foreground">
              {d.overBy} above the capacity limit.
            </p>
          ) : null}
          {d.dataQualityIssue ? (
            <p role="status" className="text-sm text-muted-foreground">
              Some records need review. Unknown client lifecycle states count
              conservatively; invitation links without an identifiable recipient
              are excluded from pending usage.
            </p>
          ) : null}
        </div>
      ))}
      {snapshot.subscription.kind === "complimentary" &&
      snapshot.dimensions.some((d) => d.state === "over_limit") ? (
        <p role="status" className="text-sm text-muted-foreground">
          Current usage is above the standard Scale allowance. Complimentary
          beta access is unchanged.
        </p>
      ) : null}
    </div>
  );
}
