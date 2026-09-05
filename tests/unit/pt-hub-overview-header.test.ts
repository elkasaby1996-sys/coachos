import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("PT Hub shell chrome", () => {
  it("uses the compact workspace rail and utility dock without a page header", () => {
    const hubLayout = readSource("src/components/layouts/pt-hub-layout.tsx");

    expect(hubLayout).toContain("pt-hub-workspace-rail");
    expect(hubLayout).toContain("pt-hub-workspace-rail-desktop");
    expect(hubLayout).toContain("lg:inset-y-0");
    expect(hubLayout).not.toContain("lg:bottom-[72px]");
    expect(hubLayout).not.toContain("lg:p-3");
    expect(hubLayout).toContain('className="lg:pl-[268px]"');
    expect(hubLayout).toContain("pt-hub-shell-utilities");
    expect(hubLayout).toContain("pt-hub-header-action-cluster");
    expect(hubLayout).not.toMatch(
      /pt-hub-header-action-cluster[^"]*\bborder\b/,
    );
    expect(hubLayout).toContain("R E P S Y N C");
    expect(hubLayout).toContain('aria-label="RepSync"');
    expect(hubLayout).not.toContain("pt-hub-sync-rail");
    expect(hubLayout).not.toContain('t("ptHub.coachOperations"');
    expect(hubLayout).not.toContain(
      '<Building className="h-4 w-4 [stroke-width:1.7]" />',
    );
    expect(hubLayout).toContain(
      "min-w-[136px] flex-1 items-center gap-2 rounded-[12px] border border-transparent px-2",
    );
    expect(
      hubLayout.match(/getPtHubHeaderPillClassName\(isLightMode\)/g),
    ).toHaveLength(2);
    expect(hubLayout).toContain("lg:pl-[276px]");
    expect(hubLayout).not.toContain("lg:pl-[312px]");
    expect(hubLayout).not.toContain("<header");
  });

  it("keeps page content below the utility dock", () => {
    const shellCss = readSource("src/styles/pt-hub-shell.css");

    expect(shellCss).not.toContain("margin-top: -47px");
    expect(shellCss).not.toContain(
      ".pt-content-zoom > div > .pt-hub-page-stack",
    );
    expect(shellCss).toContain(".pt-hub-theme .pt-hub-workspace-rail-desktop");
    expect(shellCss).toContain("border-radius: 0");
    expect(shellCss).toContain("box-shadow: none");
  });

  it("does not repeat setup readiness above the overview metrics", () => {
    const overviewPage = readSource("src/pages/pt-hub/overview.tsx");
    const overviewSections = readSource(
      "src/features/pt-hub/components/pt-hub-overview-sections.tsx",
    );

    expect(overviewPage).not.toContain("PtHubSetupNoticeStrip");
    expect(overviewSections).not.toContain("Setup not finished");
    expect(overviewSections).not.toContain("pt-hub-setup-notice");
  });

  it("keeps the profile checklist concise and action rows left aligned", () => {
    const overviewPage = readSource("src/pages/pt-hub/overview.tsx");
    const overviewSections = readSource(
      "src/features/pt-hub/components/pt-hub-overview-sections.tsx",
    );

    expect(overviewPage).not.toContain("PtHubLaunchChecklistCard");
    expect(overviewPage).toContain(
      "profileItems={(readiness?.checklist ?? [])",
    );
    expect(overviewSections).toContain('aria-label="Coach setup"');
    expect(overviewSections).toContain('aria-label="Profile essentials"');
    expect(overviewPage).not.toContain("Top setup blockers only.");
    expect(overviewSections).not.toContain("blockers shown");
    expect(overviewSections).not.toContain("more blocker");
    expect(overviewSections).not.toContain("% ready");
    expect(overviewSections).toContain('role="progressbar"');
    expect(overviewSections).toContain("aria-valuenow={completionPercent}");
    expect(overviewSections).not.toContain('item.id === "billing-manual"');
    expect(overviewSections).toContain(
      "group flex w-full items-start gap-3 px-0 text-left",
    );
  });

  it("does not render removed route subtitles", () => {
    const hubLayout = readSource("src/components/layouts/pt-hub-layout.tsx");
    const i18nSource = readSource("src/lib/i18n.tsx");

    for (const removedSubtitle of [
      "Run your coaching business from one dashboard.",
      "Update the public trainer page clients will see.",
      "See every client across your coaching spaces.",
      "Open, create, and manage your coaching spaces.",
      "Check billing, invoices, and revenue at a glance.",
      "Track inquiries, conversions, and client growth.",
    ]) {
      expect(hubLayout).not.toContain(removedSubtitle);
      expect(i18nSource).not.toContain(removedSubtitle);
    }
  });
});
