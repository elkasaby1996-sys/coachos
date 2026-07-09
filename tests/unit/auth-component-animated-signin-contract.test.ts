import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src/components/ui/sign-up.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const backdropSource = readFileSync(
  join(process.cwd(), "src/components/common/auth-backdrop.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const globalsSource = readFileSync(
  join(process.cwd(), "src/styles/globals.css"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("animated auth component contract", () => {
  it("keeps 21st.dev-inspired polish inside the existing Repsync auth surface", () => {
    expect(source).toContain("auth-flow-canvas");
    expect(source).toContain("auth-flow-card");
    expect(source).toContain("<AuthFlowBackground />");
    expect(source).toContain("const isEmailValid =");
    expect(source).toContain('aria-label="Email"');
    expect(source).toContain('aria-label="Password"');
    expect(source).toContain("glass-input-single");
  });

  it("keeps the auth card crisp without a separate ambient halo behind the modal", () => {
    expect(source).toContain("backdrop-blur-2xl");
    expect(source).toContain("shadow-[0_28px_90px_-54px_oklch");
    expect(source).not.toContain("auth-card-ambient");
    expect(source).not.toContain("data-auth-card");
  });

  it("keeps the sign-in form first with compact social buttons second", () => {
    expect(source.indexOf("<form")).toBeLessThan(
      source.indexOf("{showSocialBlock ?"),
    );
    expect(source).toContain('runSocial("google", onGoogle)');
    expect(source).toContain('runSocial("apple", onApple)');
    expect(source).toContain("Forgot your password?");
    expect(globalsSource).toContain(".auth-secondary-link:hover");
    expect(globalsSource).toContain("color: #22d3ee");
    expect(source).not.toContain(
      "Use your workspace email and existing password.",
    );
    expect(source).not.toContain("headerTitle");
    expect(source).not.toContain("headerSubtitle");
  });

  it("uses glassmorphic modal buttons without glossy legacy capsules", () => {
    expect(source).toContain(".glass-button-wrap");
    expect(source).toContain(".glass-button-shadow");
    expect(source).toContain("backdrop-filter: blur");
    expect(source).toContain("conic-gradient(from var(--angle-1)");
    expect(source).toContain("mask-composite: exclude");
    expect(source).not.toContain("rgba(56,189,248,0.22)");
    expect(source).not.toContain("rgba(255,255,255,0.26)");
  });

  it("keeps auth inputs transparent so they do not appear nested", () => {
    expect(source).toContain(
      ".auth-flow-card .glass-input-single {\n          border-color: oklch(1 0 0 / 0.5);\n          background: transparent;",
    );
    expect(source).toContain(
      ".auth-flow-card .glass-input-wrap:focus-within .glass-input-single {\n          border-color: oklch(1 0 0 / 0.72);\n          background: transparent;",
    );
    expect(source).toContain("background: transparent !important;");
    expect(source).toContain("box-shadow: none !important;");
  });

  it("keeps the auth footer pinned in a viewport shell without an after-footer band", () => {
    expect(backdropSource).toContain("flex h-dvh flex-col overflow-hidden");
    expect(backdropSource).toContain("min-h-0");
    expect(backdropSource).toContain("overflow-y-auto");
    expect(backdropSource).toContain("shrink-0");
    expect(backdropSource).not.toContain("fixed inset-x-0 bottom-0");
    expect(backdropSource).not.toContain("min-h-dvh");
    expect(backdropSource).not.toContain("pb-28");
  });

  it("uses the animated backdrop on auth screens", () => {
    expect(backdropSource).toContain("AuthFlowBackground");
    expect(backdropSource).toContain("backdrop-blur-[36px]");
    expect(source).toContain("<AuthFlowBackground />");
  });
});
