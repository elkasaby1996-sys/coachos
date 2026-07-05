import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const checkinTemplatesSource = readRepoFile(
  "src",
  "pages",
  "pt",
  "checkin-templates.tsx",
);
const programBuilderSource = readRepoFile(
  "src",
  "pages",
  "pt",
  "program-builder.tsx",
);

describe("form save dirty-state consistency", () => {
  it("wires check-in templates into the shared dirty navigation and sticky save pattern", () => {
    expect(checkinTemplatesSource).toContain("useDirtyNavigationGuard");
    expect(checkinTemplatesSource).toContain("StickySaveBar");
    expect(checkinTemplatesSource).toContain("handleDiscardTemplateChanges");
    expect(checkinTemplatesSource).toContain("guardDialog");
    expect(checkinTemplatesSource).toContain('statusText="Unsaved template changes"');
    expect(checkinTemplatesSource).toContain("!hasUnsavedChanges");
    expect(checkinTemplatesSource).toContain("saveState !== \"idle\"");
  });

  it("keeps check-in template save payloads intact while removing the duplicate header save button", () => {
    const headerSource = checkinTemplatesSource.match(
      /<WorkspacePageHeader[\s\S]*?\/>\n\n {6}<div className="page-kpi-block/,
    )?.[0];

    expect(checkinTemplatesSource).toContain(".from(\"checkin_templates\")");
    expect(checkinTemplatesSource).toContain(".from(\"checkin_questions\")");
    expect(checkinTemplatesSource).toContain("saveQuestions(createdTemplate.id");
    expect(checkinTemplatesSource).toContain("saveQuestions(clonedTemplate.id");
    expect(headerSource).not.toContain("onClick={handleSaveTemplate}");
  });

  it("wires program builder into the shared dirty navigation and sticky save pattern", () => {
    expect(programBuilderSource).toContain("useDirtyNavigationGuard");
    expect(programBuilderSource).toContain("StickySaveBar");
    expect(programBuilderSource).toContain("programDirtySnapshot");
    expect(programBuilderSource).toContain("savedProgramSnapshot");
    expect(programBuilderSource).toContain("handleDiscardProgramChanges");
    expect(programBuilderSource).toContain('statusText="Unsaved program changes"');
    expect(programBuilderSource).toContain("!hasUnsavedChanges");
    expect(programBuilderSource).toContain("saveStatus === \"saving\"");
  });

  it("keeps program builder save payloads and success redirect semantics intact", () => {
    expect(programBuilderSource).toContain(".from(\"program_templates\")");
    expect(programBuilderSource).toContain(".from(\"program_template_days\")");
    expect(programBuilderSource).toContain("/edit?saved=1");
    expect(programBuilderSource).toContain("Program saved");
    expect(programBuilderSource).toContain(
      "Your weekly structure is now in the library.",
    );
  });
});
