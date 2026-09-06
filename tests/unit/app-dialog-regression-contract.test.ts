import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

const clientDetailPage = readSource("src", "pages", "pt", "client-detail.tsx");
const nutritionPage = readSource("src", "pages", "pt", "nutrition.tsx");
const calendarPage = readSource("src", "pages", "pt", "calendar.tsx");

describe("app dialog regression contracts", () => {
  it("opens the same-day workout override dialog before confirming assignment", () => {
    expect(clientDetailPage).toContain(
      "onAssign={() => void handleAssignWorkout()}",
    );
    expect(clientDetailPage).toContain('setConfirmAction("workout-override")');
    expect(clientDetailPage).toContain(
      "onConfirm: () => handleAssignWorkout(true)",
    );
  });

  it("keeps workout override cancel separate from the mutation path", () => {
    const dialogStart = clientDetailPage.indexOf(
      'confirmAction === "workout-override"',
    );
    const dialogEnd = clientDetailPage.indexOf(
      'confirmAction === "pause-program"',
      dialogStart,
    );
    const dialogConfig = clientDetailPage.slice(dialogStart, dialogEnd);

    expect(dialogConfig).toContain(
      "onConfirm: () => handleAssignWorkout(true)",
    );
    expect(clientDetailPage).toContain(
      "onClick={() => setConfirmAction(null)}",
    );
    expect(dialogConfig).not.toContain("setConfirmAction(null)");
  });

  it("keeps nutrition delete dialog state render-safe and preserves assigned-delete copy", () => {
    expect(nutritionPage).toContain(
      "const [deleteTarget, setDeleteTarget] = useState<NutritionTemplate | null>",
    );
    expect(nutritionPage).toContain("open={Boolean(deleteTarget)}");
    expect(nutritionPage).toContain('templateActionErrorSource === "dialog"');
    expect(nutritionPage).toContain(
      "This nutrition program is already assigned to a client and cannot be deleted.",
    );
    expect(nutritionPage).not.toContain("window.confirm");
  });

  it("keeps client-detail nutrition unassign dialog state local to the nutrition tab", () => {
    const nutritionTabStart = clientDetailPage.indexOf(
      "function PtClientNutritionTab(",
    );
    const nutritionTabEnd = clientDetailPage.indexOf(
      "function PtClientLogsTab(",
      nutritionTabStart,
    );
    const nutritionTab = clientDetailPage.slice(
      nutritionTabStart,
      nutritionTabEnd,
    );

    expect(nutritionTab).toContain(
      "const [nutritionUnassignDialogOpen, setNutritionUnassignDialogOpen] =",
    );
    expect(nutritionTab).toContain("open={nutritionUnassignDialogOpen}");
    expect(nutritionTab).toContain("setNutritionUnassignDialogOpen(true)");
  });

  it("keeps calendar create event wired separately from delete confirmation state", () => {
    expect(calendarPage).toContain(
      "const [eventDialogOpen, setEventDialogOpen] = useState(false)",
    );
    expect(calendarPage).toContain(
      "const [deleteEventDialogOpen, setDeleteEventDialogOpen] = useState(false)",
    );
    expect(calendarPage).toContain(
      "onClick={() => createEventMutation.mutate()}",
    );
    expect(calendarPage).toContain(
      "const [deleteEventTarget, setDeleteEventTarget] =",
    );
    expect(calendarPage).toContain("setDeleteEventTarget(selectedEvent)");
    expect(calendarPage).toContain("setEventDetailsOpen(false)");
    expect(calendarPage).toContain("setDeleteEventDialogOpen(true)");
    expect(calendarPage).toContain(
      "Unable to save this event right now. Please try again.",
    );
    expect(calendarPage).not.toContain("window.confirm");
  });
});
