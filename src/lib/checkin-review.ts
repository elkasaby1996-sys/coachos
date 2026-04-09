import { addDaysToDateString } from "./date-utils";

export type CheckinOperationalState =
  | "upcoming"
  | "due"
  | "overdue"
  | "submitted"
  | "reviewed";

export type CheckinOperationalStateRow = {
  week_ending_saturday?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
};

export const checkinOperationalStatusMap = {
  upcoming: { label: "Upcoming", variant: "neutral" },
  due: { label: "Due", variant: "warning" },
  overdue: { label: "Overdue", variant: "danger" },
  submitted: { label: "Submitted", variant: "info" },
  reviewed: { label: "Reviewed", variant: "success" },
} as const;

export function getCheckinOperationalState(
  checkin: CheckinOperationalStateRow,
  today: string,
): CheckinOperationalState {
  if (checkin.reviewed_at) return "reviewed";
  if (checkin.submitted_at) return "submitted";
  if (checkin.week_ending_saturday && checkin.week_ending_saturday < today) {
    return "overdue";
  }
  if (checkin.week_ending_saturday && checkin.week_ending_saturday > today) {
    return "upcoming";
  }
  return "due";
}

export function isCheckinUpcomingWithinDays(
  checkin: CheckinOperationalStateRow,
  today: string,
  days: number,
): boolean {
  if (getCheckinOperationalState(checkin, today) !== "upcoming") {
    return false;
  }

  const rangeEnd = addDaysToDateString(today, Math.max(0, days));
  return Boolean(
    checkin.week_ending_saturday &&
    rangeEnd &&
    checkin.week_ending_saturday <= rangeEnd,
  );
}

export function getPrimaryClientCheckin<T extends CheckinOperationalStateRow>(
  rows: T[],
  today: string,
): T | null {
  const orderedRows = [...rows]
    .filter((row) => row.week_ending_saturday)
    .sort((a, b) =>
      (a.week_ending_saturday ?? "").localeCompare(
        b.week_ending_saturday ?? "",
      ),
    );

  const earliestOverdue = orderedRows.find(
    (row) => getCheckinOperationalState(row, today) === "overdue",
  );
  if (earliestOverdue) return earliestOverdue;

  const dueToday = orderedRows.find(
    (row) => getCheckinOperationalState(row, today) === "due",
  );
  if (dueToday) return dueToday;

  const latestClosed = [...orderedRows].reverse().find((row) => {
    const state = getCheckinOperationalState(row, today);
    return (
      row.week_ending_saturday &&
      row.week_ending_saturday <= today &&
      (state === "submitted" || state === "reviewed")
    );
  });
  if (latestClosed) return latestClosed;

  const nextUpcoming = orderedRows.find(
    (row) => getCheckinOperationalState(row, today) === "upcoming",
  );
  return nextUpcoming ?? orderedRows[orderedRows.length - 1] ?? null;
}

export type CheckinReviewState = Exclude<CheckinOperationalState, "upcoming">;

export type CheckinReviewStateRow = CheckinOperationalStateRow;

export const checkinReviewStatusMap = {
  due: checkinOperationalStatusMap.due,
  overdue: checkinOperationalStatusMap.overdue,
  submitted: checkinOperationalStatusMap.submitted,
  reviewed: checkinOperationalStatusMap.reviewed,
} as const;

export function getCheckinReviewState(
  checkin: CheckinReviewStateRow,
  today: string,
): CheckinReviewState {
  const state = getCheckinOperationalState(checkin, today);
  return state === "upcoming" ? "due" : state;
}
