import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styleCss = readFileSync(resolve("src/styles/style.css"), "utf8");
const globalsCss = readFileSync(resolve("src/styles/globals.css"), "utf8");
const ptHubShellCss = readFileSync(resolve("src/styles/pt-hub-shell.css"), "utf8");
const ptHubOverviewSectionsTsx = readFileSync(
  resolve("src/features/pt-hub/components/pt-hub-overview-sections.tsx"),
  "utf8",
);
const ptHubSectionCardTsx = readFileSync(
  resolve("src/features/pt-hub/components/pt-hub-section-card.tsx"),
  "utf8",
);
const ptHubLayoutTsx = readFileSync(
  resolve("src/components/layouts/pt-hub-layout.tsx"),
  "utf8",
);

function selectorBlock(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Missing CSS selector ${selector}`).toBeGreaterThanOrEqual(0);

  const openBrace = css.indexOf("{", start);
  let depth = 0;

  for (let index = openBrace; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return css.slice(openBrace + 1, index);
    }
  }

  throw new Error(`Could not parse CSS selector ${selector}`);
}

function customProperties(block: string) {
  return Object.fromEntries(
    Array.from(block.matchAll(/--([\w-]+):\s*([^;]+);/g)).map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

function oklchParts(value: string) {
  const [lightness, chroma, hue] = value.split(/\s+/).map(Number);
  return { lightness, chroma, hue };
}

describe("light mode theme CSS contract", () => {
  const lightTokens = customProperties(selectorBlock(styleCss, ".light"));
  const globalsLightTokens = customProperties(selectorBlock(globalsCss, ".light"));

  function expectWarmLightThemeTokens(tokens: Record<string, string>) {
    const canvas = oklchParts(tokens["bg-canvas"]);
    const surface = oklchParts(tokens["bg-surface"]);
    const elevatedSurface = oklchParts(tokens["bg-surface-elevated"]);
    const primaryText = oklchParts(tokens["text-primary"]);
    const secondaryText = oklchParts(tokens["text-secondary"]);
    const mutedText = oklchParts(tokens["text-muted"]);
    const defaultBorder = oklchParts(tokens["border-default"]);
    const accent = oklchParts(tokens.accent);

    expect(canvas.lightness).toBeGreaterThanOrEqual(0.94);
    expect(canvas.hue).toBeGreaterThanOrEqual(70);
    expect(canvas.hue).toBeLessThanOrEqual(115);
    expect(surface.lightness).toBeGreaterThanOrEqual(0.97);
    expect(elevatedSurface.lightness).toBeGreaterThanOrEqual(0.98);
    expect(primaryText.lightness).toBeLessThanOrEqual(0.27);
    expect(secondaryText.lightness).toBeLessThanOrEqual(0.3);
    expect(mutedText.lightness).toBeLessThanOrEqual(0.38);
    expect(defaultBorder.lightness).toBeLessThanOrEqual(0.78);
    expect(accent.lightness).toBeGreaterThanOrEqual(0.55);
    expect(accent.lightness).toBeLessThanOrEqual(0.62);
    expect(accent.chroma).toBeGreaterThanOrEqual(0.09);
    expect(accent.hue).toBeGreaterThanOrEqual(145);
    expect(accent.hue).toBeLessThanOrEqual(158);
  }

  test("uses a warm studio canvas instead of the previous cool mint-gray base", () => {
    expectWarmLightThemeTokens(lightTokens);
    expectWarmLightThemeTokens(globalsLightTokens);
  });

  test("keeps light-mode text and borders readable on translucent surfaces", () => {
    expectWarmLightThemeTokens(lightTokens);
  });

  test("keeps the RepSync green accent grounded for light backgrounds", () => {
    expectWarmLightThemeTokens(lightTokens);
  });

  test("keeps PT Hub and PT workspace light themes aligned with warm studio tokens", () => {
    const ptHubLightTokens = customProperties(
      selectorBlock(globalsCss, ".pt-hub-theme.pt-hub-theme-light"),
    );
    const ptWorkspaceLightTokens = customProperties(
      selectorBlock(globalsCss, ".pt-workspace-theme.pt-workspace-theme-light"),
    );

    expectWarmLightThemeTokens(ptHubLightTokens);
    expectWarmLightThemeTokens(ptWorkspaceLightTokens);
  });

  test("keeps PT Hub light surfaces opaque and warm instead of blue glass", () => {
    const ptHubLightTokens = customProperties(
      selectorBlock(globalsCss, ".pt-hub-theme.pt-hub-theme-light"),
    );

    expect(ptHubLightTokens["surface-bg"]).toContain(
      "oklch(var(--bg-surface-elevated) / 0.99)",
    );
    expect(ptHubLightTokens["surface-bg"]).toContain(
      "oklch(var(--bg-surface) / 0.95)",
    );
    expect(ptHubLightTokens["surface-strong-bg"]).toContain(
      "oklch(var(--bg-surface-elevated) / 1)",
    );
    expect(ptHubLightTokens["surface-strong-bg"]).toContain(
      "oklch(var(--bg-surface) / 0.97)",
    );
    expect(ptHubLightTokens["overlay-bg"]).toBe("oklch(0.65 0.018 88 / 0.42)");
  });

  test("does not rewrite the dark root canvas token", () => {
    const rootTokens = customProperties(selectorBlock(styleCss, ":root"));

    expect(rootTokens["bg-canvas"]).toBe("0.094 0.008 206");
  });

  test("reduces PT Hub light-shell ambience so warm surfaces stay readable", () => {
    const lightShell = selectorBlock(
      ptHubShellCss,
      ".pt-hub-theme.pt-hub-theme-light .theme-shell-canvas::before",
    );

    expect(lightShell).not.toContain("var(--accent)");
    expect(lightShell).not.toContain("var(--success)");
    expect(lightShell).toContain("var(--bg-muted)");
    expect(lightShell).toContain("opacity: 0.22;");
    expect(lightShell).toContain("saturate(68%)");

    const lightScrolledShell = selectorBlock(
      ptHubShellCss,
      ".pt-hub-theme.pt-hub-theme-light.pt-hub-scroll-active .theme-shell-canvas::before",
    );

    expect(lightScrolledShell).toContain("opacity: 0.22;");
    expect(lightScrolledShell).toContain("saturate(68%)");
  });

  test("keeps light-mode panel highlights from reintroducing cyan ambience", () => {
    const appLightPanelHighlight = selectorBlock(
      styleCss,
      ".light .surface-panel::before,\n.light .surface-panel-strong::before,\n.light .surface-panel-portal::before",
    );
    const ptHubLightPanelHighlight = selectorBlock(
      ptHubShellCss,
      ".pt-hub-theme.pt-hub-theme-light .surface-panel::before,\n.pt-hub-theme.pt-hub-theme-light .surface-panel-strong::before,\n.pt-hub-theme.pt-hub-theme-light .surface-panel-portal::before",
    );

    expect(appLightPanelHighlight).not.toContain("var(--accent)");
    expect(ptHubLightPanelHighlight).not.toContain("var(--accent)");
    expect(appLightPanelHighlight).toContain("var(--chart-4)");
    expect(ptHubLightPanelHighlight).toContain("var(--chart-4)");
  });

  test("uses light-mode-specific warm overlays for PT Hub content panels", () => {
    expect(ptHubOverviewSectionsTsx).toContain("pt-hub-action-center-overlay");
    expect(ptHubSectionCardTsx).toContain("pt-hub-section-card-overlay");

    const actionOverlay = selectorBlock(
      ptHubShellCss,
      ".pt-hub-theme.pt-hub-theme-light .pt-hub-action-center-overlay",
    );
    const sectionOverlay = selectorBlock(
      ptHubShellCss,
      ".pt-hub-theme.pt-hub-theme-light .pt-hub-section-card-overlay",
    );

    expect(actionOverlay).not.toContain("var(--accent)");
    expect(actionOverlay).not.toContain("var(--chart-3)");
    expect(sectionOverlay).not.toContain("var(--accent)");
    expect(sectionOverlay).not.toContain("var(--chart-3)");
    expect(actionOverlay).toContain("var(--bg-muted)");
    expect(sectionOverlay).toContain("var(--bg-muted)");
  });

  test("keeps light-mode inputs and dropdown menus opaque and warm", () => {
    const ptHubLightTokens = customProperties(
      selectorBlock(globalsCss, ".pt-hub-theme.pt-hub-theme-light"),
    );
    const ptWorkspaceLightTokens = customProperties(
      selectorBlock(globalsCss, ".pt-workspace-theme.pt-workspace-theme-light"),
    );

    for (const tokens of [
      lightTokens,
      globalsLightTokens,
      ptHubLightTokens,
      ptWorkspaceLightTokens,
    ]) {
      expect(tokens["field-glass-bg"]).toContain(
        "oklch(var(--bg-surface-elevated) / 0.96)",
      );
      expect(tokens["field-glass-bg"]).toContain(
        "oklch(var(--bg-surface) / 0.88)",
      );
      expect(tokens["field-glass-bg-focus"]).toContain(
        "oklch(var(--bg-surface-elevated) / 0.99)",
      );
      expect(tokens["field-glass-bg-focus"]).toContain(
        "oklch(var(--bg-surface) / 0.92)",
      );
      expect(tokens["menu-surface-bg"]).toContain(
        "oklch(var(--bg-surface-elevated) / 0.99)",
      );
      expect(tokens["menu-panel-bg"]).toContain(
        "oklch(var(--bg-surface) / 0.96)",
      );
      expect(tokens["menu-item-hover"]).toBe("oklch(var(--bg-muted) / 0.78)");
      expect(tokens["select-filter-border"]).toBe(
        "oklch(var(--border-default) / 0.9)",
      );
    }

    const lightSearchInput = selectorBlock(
      styleCss,
      ".light .app-search-input,\n.pt-hub-theme.pt-hub-theme-light .app-search-input,\n.pt-workspace-theme.pt-workspace-theme-light .app-search-input",
    );

    expect(lightSearchInput).toContain("border-color: var(--field-glass-border)");
    expect(lightSearchInput).toContain("background-image: var(--field-glass-bg)");
    expect(lightSearchInput).toContain("box-shadow: var(--field-glass-shadow)");
  });

  test("keeps PT Hub local light mode tokens available to portaled dropdowns", () => {
    expect(ptHubLayoutTsx).toContain("pt-hub-portal-light");

    const portalLightTokens = customProperties(
      selectorBlock(ptHubShellCss, "body.pt-hub-portal-light"),
    );

    expect(portalLightTokens["menu-surface-bg"]).toContain(
      "oklch(var(--bg-surface-elevated) / 0.99)",
    );
    expect(portalLightTokens["menu-panel-bg"]).toContain(
      "oklch(var(--bg-surface) / 0.96)",
    );
    expect(portalLightTokens["menu-item-hover"]).toBe(
      "oklch(var(--bg-muted) / 0.78)",
    );
    expect(portalLightTokens["menu-border-color"]).toBe(
      "oklch(var(--border-default) / 0.9)",
    );
    expect(portalLightTokens.foreground).toBe("var(--text-primary)");
    expect(portalLightTokens["popover-foreground"]).toBe("var(--text-primary)");
    expect(portalLightTokens["muted-foreground"]).toBe("var(--text-muted)");
    expect(portalLightTokens["module-settings-text"]).toBe(
      "oklch(var(--module-settings-hover))",
    );
    expect(portalLightTokens["state-danger-text"]).toBe(
      "oklch(var(--state-danger))",
    );
  });

  test("forces PT Hub portaled dropdown copy to stay readable in local light mode", () => {
    const portalContent = selectorBlock(
      ptHubShellCss,
      "body.pt-hub-portal-light .app-dropdown-content",
    );
    const portalItem = selectorBlock(
      ptHubShellCss,
      "body.pt-hub-portal-light .app-dropdown-item",
    );
    const portalDisabledItem = selectorBlock(
      ptHubShellCss,
      "body.pt-hub-portal-light .app-dropdown-item[data-disabled]",
    );
    const portalUtilityRow = selectorBlock(
      ptHubShellCss,
      "body.pt-hub-portal-light .app-dropdown-utility-row",
    );

    expect(portalContent).toContain("color: oklch(var(--text-primary));");
    expect(portalItem).toContain("color: oklch(var(--text-primary));");
    expect(portalDisabledItem).toContain("color: oklch(var(--text-muted));");
    expect(portalDisabledItem).toContain("opacity: 0.68;");
    expect(portalUtilityRow).toContain("color: oklch(var(--text-primary));");
  });
});
