export const ASSIGNMENT_SNAPSHOT_WARNING_TITLE =
  "Assigned clients will not update automatically.";

export const ASSIGNMENT_SNAPSHOT_NOTICE =
  "Template edits affect future assignments only. Reassign this plan to update an assigned client.";

export const CHECKIN_ASSIGNMENT_NOTICE =
  "Check-ins use client cadence settings. Template changes apply to future generated check-ins.";

export const ASSIGNMENT_SNAPSHOT_TEST_CONTRACT = {
  workouts: "snapshot",
  nutrition: "snapshot",
  checkins: "cadence-settings",
  templateEditsUpdateExistingAssignments: false,
  reassignmentUpdatesAssignedClients: true,
  sourceDeletionShouldPreserveSnapshots: true,
} as const;
