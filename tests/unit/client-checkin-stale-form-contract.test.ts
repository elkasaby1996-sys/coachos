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
    expect(realtimeMigration).toContain(
      "alter table public.checkin_templates replica identity full",
    );
    expect(realtimeMigration).toContain(
      "alter table public.checkin_questions replica identity full",
    );
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
    expect(clientCheckinPage).toContain('event: "*"');
  });

  it("uses a direct Supabase form definition signature fetch for polling", () => {
    expect(clientCheckinPage).toContain(
      "buildCheckinFormDefinitionSignature(templateId, templateQuery.data)",
    );
    expect(clientCheckinPage).toContain("fetchDirectFormDefinitionSignature");
    expect(clientCheckinPage).toContain('.from("checkin_templates")');
    expect(clientCheckinPage).toContain(
      "id, name, checkin_questions(id, question_text, prompt, question_type, response_type, type, input_type, options, is_required, sort_order, position)",
    );
    expect(clientCheckinPage).toContain(
      'queryKey: ["client-checkin-form-definition-signature", templateId]',
    );
    expect(clientCheckinPage).toContain(
      'queryKey: ["client-checkin-template", templateId]',
    );
    expect(clientCheckinPage).toContain("refetchInterval:");
    expect(clientCheckinPage).toContain("refetchIntervalInBackground: true");
    expect(clientCheckinPage).toContain("refetchOnWindowFocus: true");
  });

  it("marks local answers and photo changes dirty before remote definition changes", () => {
    expect(clientCheckinPage).toContain("const formDirtyRef = useRef(false)");
    expect(clientCheckinPage).toContain("const markFormDirty = useCallback");
    expect(clientCheckinPage).toContain("markFormDirty();");
    expect(clientCheckinPage).toContain("handleAnswerChange");
    expect(clientCheckinPage).toContain("handleFileChange");
    expect(clientCheckinPage).toContain("handleRemovePhoto");
  });

  it("shows a stale warning for direct-polled definition changes", () => {
    expect(clientCheckinPage).toContain(
      "resolveAcceptedCheckinDefinitionSignature",
    );
    expect(clientCheckinPage).toContain("resolveCheckinDefinitionChange");
    expect(clientCheckinPage).toContain("setStaleCheckinWarning(true)");
    expect(clientCheckinPage).toContain(
      "checkForRemoteCheckinDefinitionChange",
    );
    expect(clientCheckinPage).toContain("window.setInterval");
    expect(clientCheckinPage).toContain("window.addEventListener(\"focus\"");
    expect(clientCheckinPage).toContain(
      "document.addEventListener(\"visibilitychange\"",
    );
    expect(clientCheckinPage).toContain(
      "const latestSignature = await fetchDirectFormDefinitionSignature()",
    );
    expect(clientCheckinPage).not.toContain(
      "await refreshCheckinForm(latestSignature)",
    );
    expect(clientCheckinPage).toContain("Your check-in was updated.");
    expect(clientCheckinPage).toContain(
      "Refresh this check-in to continue with the latest questions.",
    );
    expect(clientCheckinPage).toContain("Refresh check-in");
  });

  it("blocks submit while the visible stale warning is active", () => {
    expect(clientCheckinPage).toContain("if (staleCheckinWarning)");
    expect(clientCheckinPage).toContain(
      "!canAdvancePhotos || submitting || staleCheckinWarning",
    );
    expect(clientCheckinPage).toContain("staleSubmitMessage");
    expect(clientCheckinPage).toContain("setStaleSubmitMessage");
    expect(clientCheckinPage).toContain(
      "Refresh this check-in before submitting.",
    );
    expect(clientCheckinPage).not.toContain(
      'setToastMessage("Refresh this check-in before submitting',
    );
  });
});
