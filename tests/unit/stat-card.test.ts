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
  it("renders icons without the legacy bordered badge wrapper", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StatCard, {
        label: "New Leads",
        value: 12,
        icon: TestIcon,
        module: "leads",
      }),
    );

    expect(markup).not.toContain("border-border/60");
    expect(markup).not.toContain("bg-background/42");
  });

  it("lets callers apply card-specific icon tones directly to the icon", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StatCard, {
        label: "Draft",
        value: 0,
        icon: TestIcon,
        iconClassName: "text-amber-500",
      }),
    );

    expect(markup).toContain("text-amber-500");
  });
});
