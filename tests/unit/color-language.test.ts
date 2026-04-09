import { describe, expect, it } from "vitest";
import {
  getModuleToneForPath,
  getModuleToneStyle,
} from "../../src/lib/module-tone";
import {
  getSemanticBadgeVariant,
  getSemanticToneClasses,
  getSemanticToneForStatus,
} from "../../src/lib/semantic-status";

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
});
