import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src/components/ui/sign-up.tsx"),
  "utf8",
);
const backdropSource = readFileSync(
  join(process.cwd(), "src/components/common/auth-backdrop.tsx"),
  "utf8",
);
const globalsSource = readFileSync(
  join(process.cwd(), "src/styles/globals.css"),
  "utf8",
);

describe("animated auth component contract", () => {
  it("keeps 21st.dev-inspired polish inside the existing Repsync auth surface", () => {
    expect(source).toContain("auth-card-ambient");
    expect(source).toContain("data-auth-card");
    expect(source).toContain("const isEmailValid =");
    expect(source).toContain("aria-invalid");
    expect(source).toContain("data-auth-social");
  });

  it("keeps the auth card crisp without a visible halo behind the modal", () => {
    expect(source).toContain("backdrop-blur-xl");
    expect(source).toContain("rgba(15,23,32,0.74)");
    expect(source).toContain("auth-card-ambient pointer-events-none hidden");
    expect(source).not.toContain("backdrop-blur-[34px]");
  });

  it("keeps the sign-in form first with compact social icons second", () => {
    expect(source.indexOf("<form")).toBeLessThan(
      source.lastIndexOf("{socialButtons}"),
    );
    expect(source).toContain("data-auth-social={provider.id}");
    expect(source).toContain("Forgot Your Password?");
    expect(source).toContain("displayBrandName");
    expect(source).toContain("auth-secondary-link");
    expect(globalsSource).toContain(".auth-secondary-link:hover");
    expect(globalsSource).toContain("color: #22d3ee");
    expect(source).toContain("group-hover:translate-x-0.5");
    expect(source).not.toContain(
      "Use your workspace email and existing password.",
    );
    expect(source).not.toContain("headerTitle");
    expect(source).not.toContain("headerSubtitle");
  });

  it("uses glassmorphic modal buttons without glossy legacy capsules", () => {
    expect(source).toContain("rgba(255,255,255,0.15)");
    expect(source).toContain("rgba(20,38,54,0.24)");
    expect(source).toContain("rgba(34,211,238,0.14)");
    expect(source).toContain("backdrop-blur-xl");
    expect(source).toContain("inset_0_1px_0");
    expect(source).not.toContain("rgba(56,189,248,0.22)");
    expect(source).not.toContain("rgba(255,255,255,0.26)");
    expect(source).not.toContain("rounded-full transition-all");
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
    expect(backdropSource).toContain("<AppShellBackgroundLayer animated />");
  });
});
