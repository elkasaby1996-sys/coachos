import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const notesSource = readFileSync(
  "src/pages/pt/client-detail-tabs/pt-client-notes-tab.tsx",
  "utf8",
);

const migrationSource = readFileSync(
  "supabase/migrations/20260509223000_coach_activity_log_note_edit_delete.sql",
  "utf8",
);

describe("PT client notes edit/delete contract", () => {
  it("renders edit and delete controls for notes owned by the current PT", () => {
    expect(notesSource).toContain("handleEditNote");
    expect(notesSource).toContain("handleDeleteNote");
    expect(notesSource).toContain('aria-label="Edit note"');
    expect(notesSource).toContain('aria-label="Delete note"');
    expect(notesSource).toContain("editingNoteId");
  });

  it("updates note metadata instead of inserting a duplicate note", () => {
    expect(notesSource).toContain(".update({");
    expect(notesSource).toContain("edited_at");
    expect(notesSource).toContain('.eq("action", "pt_note")');
    expect(notesSource).toContain('.eq("actor_user_id", user.id)');
  });

  it("deletes only the selected owned PT note", () => {
    expect(notesSource).toContain(".delete()");
    expect(notesSource).toContain('.eq("id", noteId)');
    expect(notesSource).toContain('.eq("actor_user_id", user.id)');
  });

  it("adds database policies for owned note updates and deletes", () => {
    expect(migrationSource).toContain("coach_activity_log_pt_note_update_own");
    expect(migrationSource).toContain("coach_activity_log_pt_note_delete_own");
    expect(migrationSource).toContain("action = 'pt_note'");
    expect(migrationSource).toContain("actor_user_id = (select auth.uid())");
    expect(migrationSource).toContain(
      "public.can_access_workspace(workspace_id)",
    );
  });
});
