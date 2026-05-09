import { describe, expect, it } from "vitest";
import {
  FUNCTIONAL_COLOR_VARIANTS,
  getModuleColorVariant,
  getModuleToneForPath,
  getModuleToneStyle,
  moduleTones,
} from "../../src/lib/module-tone";
import {
  SEMANTIC_COLOR_VARIANTS,
  getStateColorVariant,
  getSemanticBadgeVariant,
  getSemanticToneClasses,
  getSemanticToneForStatus,
  semanticTones,
} from "../../src/lib/semantic-status";
import tailwindConfig from "../../tailwind.config";

describe("color language helpers", () => {
  it("maps major product routes to the intended functional module tones", () => {
    expect(getModuleToneForPath("/pt-hub/leads")).toBe("leads");
    expect(getModuleToneForPath("/pt-hub/payments")).toBe("billing");
    expect(getModuleToneForPath("/pt/dashboard")).toBe("overview");
    expect(getModuleToneForPath("/pt/checkins/templates")).toBe("checkins");
    expect(getModuleToneForPath("/app/progress")).toBe("analytics");
    expect(getModuleToneForPath("/app/messages")).toBe("coaching");
    expect(getModuleToneForPath("/app/medical")).toBe("clients");
    expect(getModuleToneForPath("/app/settings")).toBe("settings");
  });

  it("builds a module scope style object that overrides the contextual accent tokens", () => {
    const style = getModuleToneStyle("clients");

    expect(style).toMatchObject({
      "--section-accent": "oklch(var(--module-clients))",
      "--section-accent-bg-soft": "var(--module-clients-bg-soft)",
      "--accent": "var(--module-clients)",
      "--field-glass-ring": "var(--module-clients-ring)",
    });
  });

  it("exposes predictable reusable functional and semantic variant maps", () => {
    expect(Object.keys(FUNCTIONAL_COLOR_VARIANTS)).toEqual([...moduleTones]);
    expect(Object.keys(SEMANTIC_COLOR_VARIANTS)).toEqual([...semanticTones]);
    expect(getModuleColorVariant("clients").badge).toContain(
      "section-accent-badge",
    );
    expect(getStateColorVariant("success").badge).toContain(
      "--state-success-bg-soft",
    );
  });

  it("keeps semantic state mapping separate from functional module mapping", () => {
    expect(getSemanticToneForStatus("Published")).toBe("success");
    expect(getSemanticToneForStatus("At risk")).toBe("danger");
    expect(getSemanticToneForStatus("Awaiting response")).toBe("warning");
    expect(getSemanticBadgeVariant("connected")).toBe("success");
  });

  it("uses the dedicated state token classes for semantic badges", () => {
    expect(getSemanticToneClasses("success").badge).toContain(
      "--state-success-bg-soft",
    );
    expect(getSemanticToneClasses("danger").surface).toContain(
      "--state-danger-border",
    );
  });

  it("makes module and state token families available to Tailwind utilities", () => {
    const colors = tailwindConfig.theme.extend.colors;

    expect(colors.module.clients.DEFAULT).toBe("oklch(var(--module-clients))");
    expect(colors.module.clients.text).toBe("var(--module-clients-text)");
    expect(colors.module.clients.bg).toBe("var(--module-clients-bg-soft)");
    expect(colors.state.success.DEFAULT).toBe("oklch(var(--state-success))");
    expect(colors.state.success.bg).toBe("var(--state-success-bg-soft)");
    expect(colors.state.danger.border).toBe("var(--state-danger-border)");
  });
});
