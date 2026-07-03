import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8");

const clientCheckinPage = readRepo("src", "pages", "client", "checkin.tsx");
const realtimeMigration = readRepo(
  "supabase",
  "migrations",
  "20260703120000_checkin_template_question_realtime.sql",
);

describe("client check-in stale form contract", () => {
  it("publishes check-in template and question tables for realtime updates", () => {
    expect(realtimeMigration).toContain("pg_publication_tables");
    expect(realtimeMigration).toContain("public.checkin_templates");
    expect(realtimeMigration).toContain("public.checkin_questions");
    expect(realtimeMigration).toContain(
      "alter publication supabase_realtime add table public.checkin_templates",
    );
    expect(realtimeMigration).toContain(
      "alter publication supabase_realtime add table public.checkin_questions",
    );
  });

  it("subscribes the active client check-in form to template, question, client, and check-in changes", () => {
    expect(clientCheckinPage).toContain("client-checkin-definition-");
    expect(clientCheckinPage).toContain('table: "clients"');
    expect(clientCheckinPage).toContain('table: "checkins"');
    expect(clientCheckinPage).toContain('table: "checkin_templates"');
    expect(clientCheckinPage).toContain('table: "checkin_questions"');
    expect(clientCheckinPage).toContain("filter: `template_id=eq.${templateId}`");
  });

  it("marks local answers and photo changes dirty before remote definition changes", () => {
    expect(clientCheckinPage).toContain("const formDirtyRef = useRef(false)");
    expect(clientCheckinPage).toContain("const markFormDirty = useCallback");
    expect(clientCheckinPage).toContain("markFormDirty();");
    expect(clientCheckinPage).toContain("handleAnswerChange");
    expect(clientCheckinPage).toContain("handleFileChange");
    expect(clientCheckinPage).toContain("handleRemovePhoto");
  });

  it("shows a stale warning for dirty forms and refreshes clean forms safely", () => {
    expect(clientCheckinPage).toContain("setStaleCheckinWarning(true)");
    expect(clientCheckinPage).toContain("void refreshCheckinForm()");
    expect(clientCheckinPage).toContain("Your check-in was updated.");
    expect(clientCheckinPage).toContain(
      "Refresh this check-in to continue with the latest questions.",
    );
    expect(clientCheckinPage).toContain("Refresh check-in");
  });

  it("blocks submit while the visible stale warning is active", () => {
    expect(clientCheckinPage).toContain("if (staleCheckinWarning)");
    expect(clientCheckinPage).toContain(
      "Refresh this check-in before submitting the latest questions.",
    );
  });
});
