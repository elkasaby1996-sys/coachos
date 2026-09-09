import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const componentCss = readFileSync(
  resolve("src/styles/component-system.css"),
  "utf8",
).replace(/\r\n/g, "\n");
const styleCss = readFileSync(resolve("src/styles/style.css"), "utf8").replace(
  /\r\n/g,
  "\n",
);
const globalsCss = readFileSync(
  resolve("src/styles/globals.css"),
  "utf8",
).replace(/\r\n/g, "\n");
const ptHubShellCss = readFileSync(
  resolve("src/styles/pt-hub-shell.css"),
  "utf8",
).replace(/\r\n/g, "\n");
const ptWorkspaceShellCss = readFileSync(
  resolve("src/styles/pt-workspace-shell.css"),
  "utf8",
).replace(/\r\n/g, "\n");
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
const ptLayoutTsx = readFileSync(
  resolve("src/components/layouts/pt-layout.tsx"),
  "utf8",
);
const publicInfoLayoutTsx = readFileSync(
  resolve("src/pages/public/public-info-layout.tsx"),
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
  const globalsLightTokens = customProperties(
    selectorBlock(globalsCss, ".light"),
  );

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

  test("uses neutral shared card surfaces without decorative panel highlights", () => {
    expect(componentCss).toContain("--ui-surface: oklch(0.995 0.002 240)");
    expect(componentCss).toMatch(
      /\.ui-card\[data-ui="card"\]::after,[\s\S]*?display: none/,
    );
    expect(ptHubShellCss).not.toContain(
      ".pt-hub-theme.pt-hub-theme-light .surface-panel::before",
    );
  });

  test("PT Hub section cards use the shared surface without an extra overlay", () => {
    expect(ptHubSectionCardTsx).toContain("<Card");
    expect(ptHubSectionCardTsx).not.toContain("pt-hub-section-card-overlay");
    expect(ptHubOverviewSectionsTsx).not.toContain(
      "pt-hub-action-center-overlay",
    );
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

    expect(lightSearchInput).toContain(
      "border-color: var(--field-glass-border)",
    );
    expect(lightSearchInput).toContain(
      "background-image: var(--field-glass-bg)",
    );
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

  test("keeps PT workspace local light mode tokens available to portaled dropdowns", () => {
    expect(ptLayoutTsx).toContain("pt-workspace-portal-light");

    const portalLightTokens = customProperties(
      selectorBlock(globalsCss, "body.pt-workspace-portal-light"),
    );

    expect(portalLightTokens["bg-surface"]).toBe("0.988 0.004 255");
    expect(portalLightTokens["bg-surface-elevated"]).toBe("0.995 0.003 255");
    expect(portalLightTokens["menu-surface-bg"]).toContain(
      "oklch(var(--bg-surface-elevated) / 0.99)",
    );
    expect(portalLightTokens["menu-surface-bg"]).toContain(
      "oklch(var(--bg-surface) / 0.96)",
    );
    expect(portalLightTokens["menu-panel-bg"]).toContain(
      "oklch(var(--bg-surface) / 0.97)",
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
  });

  test("forces PT workspace portaled dropdown copy to stay readable in local light mode", () => {
    const portalContent = selectorBlock(
      globalsCss,
      "body.pt-workspace-portal-light .app-dropdown-content",
    );
    const portalItem = selectorBlock(
      globalsCss,
      "body.pt-workspace-portal-light .app-dropdown-item",
    );
    const portalDisabledItem = selectorBlock(
      globalsCss,
      "body.pt-workspace-portal-light .app-dropdown-item[data-disabled]",
    );
    const portalUtilityRow = selectorBlock(
      globalsCss,
      "body.pt-workspace-portal-light .app-dropdown-utility-row",
    );

    expect(portalContent).toContain("color: oklch(var(--text-primary));");
    expect(portalItem).toContain("color: oklch(var(--text-primary));");
    expect(portalDisabledItem).toContain("color: oklch(var(--text-muted));");
    expect(portalDisabledItem).toContain("opacity: 0.68;");
    expect(portalUtilityRow).toContain("color: oklch(var(--text-primary));");
  });

  test("keeps public support and legal pages on the shared light theme", () => {
    expect(publicInfoLayoutTsx).toContain("public-info-shell");
    expect(publicInfoLayoutTsx).toContain("light public-info-shell");
    expect(publicInfoLayoutTsx).toContain(
      'document.body.classList.add("public-info-portal-light")',
    );
    expect(publicInfoLayoutTsx).not.toContain("AuthBackdrop");
    expect(publicInfoLayoutTsx).not.toContain("pt-hub-theme-dark");

    const publicPortalTokens = customProperties(
      selectorBlock(globalsCss, "body.public-info-portal-light"),
    );

    expect(publicPortalTokens["bg-surface"]).toBe("1 0 0");
    expect(publicPortalTokens.foreground).toBe("var(--text-primary)");
    expect(publicPortalTokens["popover-foreground"]).toBe(
      "var(--text-primary)",
    );
    expect(publicPortalTokens["menu-surface-bg"]).toContain("oklch(1 0 0 / 1)");
    expect(publicPortalTokens["menu-item-hover"]).toBe(
      "oklch(var(--bg-muted) / 0.94)",
    );
  });

  test("uses the light background layer for PT workspace light mode", () => {
    expect(ptLayoutTsx).toContain(
      '<AppShellBackgroundLayer mode={isLightMode ? "light" : "dark"} />',
    );

    const workspaceLightShell = selectorBlock(
      ptWorkspaceShellCss,
      ".pt-workspace-theme.pt-workspace-theme-light .theme-shell-canvas::before",
    );
    const workspaceLightGrid = selectorBlock(
      ptWorkspaceShellCss,
      ".pt-workspace-theme.pt-workspace-theme-light .theme-shell-canvas::after",
    );

    expect(workspaceLightShell).not.toContain("var(--accent)");
    expect(workspaceLightShell).not.toContain("var(--chart-2)");
    expect(workspaceLightShell).toContain("var(--bg-muted)");
    expect(workspaceLightShell).toContain("opacity: 0.22;");
    expect(workspaceLightShell).toContain("saturate(68%)");
    expect(workspaceLightGrid).toContain("opacity: 0.05;");
  });
});
