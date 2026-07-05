import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

describe("PR-UI-01.7 mobile responsive pass contracts", () => {
  const dialogSource = readSource("src", "components", "ui", "dialog.tsx");
  const settingsPrimitivesSource = readSource(
    "src",
    "features",
    "settings",
    "components",
    "settings-primitives.tsx",
  );
  const ptHubClientTableSource = readSource(
    "src",
    "features",
    "pt-hub",
    "components",
    "pt-hub-client-table.tsx",
  );
  const programBuilderSource = readSource(
    "src",
    "pages",
    "pt",
    "program-builder.tsx",
  );

  it("keeps app dialogs inset and scrollable on narrow mobile viewports", () => {
    expect(dialogSource).toContain("w-[calc(100vw-2rem)]");
    expect(dialogSource).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialogSource).toContain("overflow-y-auto");
    expect(dialogSource).toContain("sm:w-full");
  });

  it("stacks sticky save actions cleanly before tablet widths", () => {
    expect(settingsPrimitivesSource).toContain("sm:flex-row");
    expect(settingsPrimitivesSource).toContain("grid grid-cols-2");
    expect(settingsPrimitivesSource).toContain("sm:flex");
    expect(settingsPrimitivesSource).toContain("sm:w-auto");
  });

  it("keeps PT Hub row actions reachable as full-width mobile card actions", () => {
    expect(ptHubClientTableSource).toContain(
      "flex justify-stretch lg:justify-end",
    );
    expect(ptHubClientTableSource).toContain("className=\"w-full sm:w-auto\"");
  });

  it("keeps program builder save controls stacked and reachable on mobile", () => {
    expect(programBuilderSource).toContain("sm:flex-row");
    expect(programBuilderSource).toContain("sm:w-auto");
    expect(programBuilderSource).toContain("Unsaved program changes");
    expect(programBuilderSource).toContain("StickySaveBar");
  });
});
