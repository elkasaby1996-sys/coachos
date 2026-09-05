import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StatCard } from "../../src/components/ui/coachos/stat-card";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
  },
  useReducedMotion: () => true,
}));

function TestIcon({ className }: { className?: string }) {
  return React.createElement("svg", {
    className,
    viewBox: "0 0 16 16",
    "aria-hidden": "true",
  });
}

describe("StatCard", () => {
  it("keeps deprecated decorative icons out of metric content", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StatCard, {
        label: "New Leads",
        value: 12,
        icon: TestIcon,
        module: "leads",
      }),
    );

    expect(markup).toContain("New Leads");
    expect(markup).toContain("12");
    expect(markup).not.toContain("<svg");
  });

  it.each(["default", "pt-hub"] as const)(
    "preserves zero values and accessible actions on the %s surface",
    (surface) => {
      const markup = renderToStaticMarkup(
        React.createElement(StatCard, {
          label: "Draft",
          value: 0,
          icon: TestIcon,
          iconClassName: "text-amber-500",
          surface,
          helper: "No drafts yet",
          delta: { value: "-2", tone: "warning" },
          onClick: () => {},
          ariaLabel: "Open drafts",
        }),
      );

      expect(markup).toContain('aria-label="Open drafts"');
      expect(markup).toContain("No drafts yet");
      expect(markup).toContain("-2");
      expect(markup).toMatch(/>0</);
      expect(markup).not.toContain("<svg");
    },
  );
});
