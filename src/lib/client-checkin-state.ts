import { getNextCheckinDueDate } from "./checkin-schedule";
import {
  getCheckinOperationalState,
  type CheckinOperationalState,
  type CheckinOperationalStateRow,
} from "./checkin-review";

export type ClientCheckinPageState =
  | {
      kind: "no-assignment";
      nextDueDate: null;
      operationalState: null;
    }
  | {
      kind: "assigned-not-open";
      nextDueDate: string | null;
      operationalState: null;
    }
  | {
      kind: "upcoming" | "open" | "overdue" | "submitted" | "reviewed";
      nextDueDate: string | null;
      operationalState: CheckinOperationalState;
    };

export function resolveClientCheckinPageState({
  hasEffectiveTemplate,
  checkinStartDate,
  checkinFrequency,
  today,
  currentCheckin,
}: {
  hasEffectiveTemplate: boolean;
  checkinStartDate: string | null | undefined;
  checkinFrequency: string | null | undefined;
  today: string;
  currentCheckin: CheckinOperationalStateRow | null | undefined;
}): ClientCheckinPageState {
  if (!hasEffectiveTemplate) {
    return {
      kind: "no-assignment",
      nextDueDate: null,
      operationalState: null,
    };
  }

  if (!currentCheckin) {
    return {
      kind: "assigned-not-open",
      nextDueDate: getNextCheckinDueDate(
        checkinStartDate,
        checkinFrequency,
        today,
      ),
      operationalState: null,
    };
  }

  const operationalState = getCheckinOperationalState(currentCheckin, today);
  return {
    kind: operationalState === "due" ? "open" : operationalState,
    nextDueDate: currentCheckin.week_ending_saturday ?? null,
    operationalState,
  };
}
