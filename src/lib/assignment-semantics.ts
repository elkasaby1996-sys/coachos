export const ASSIGNMENT_SNAPSHOT_NOTICE =
  "Assignments are saved as client snapshots. Template edits affect future assignments only. Reassign to update an assigned client.";

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
