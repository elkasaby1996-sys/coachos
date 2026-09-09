import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Card, CardHeader, CardContent } from "../../src/components/ui/card";
import {
  SurfaceCard,
  SurfaceCardHeader,
  SurfaceCardContent,
} from "../../src/components/client/portal/portal-ui";
import { Button } from "../../src/components/ui/button";
import { Input } from "../../src/components/ui/input";
import { Alert } from "../../src/components/ui/alert";

describe("shared application component contracts", () => {
  it("uses the same primitives in the client portal and workspace", () => {
    expect(SurfaceCard).toBe(Card);
    expect(SurfaceCardHeader).toBe(CardHeader);
    expect(SurfaceCardContent).toBe(CardContent);
  });

  it("preserves semantic error styling independently of the card surface", () => {
    const card = renderToStaticMarkup(
      React.createElement(
        Card,
        { tone: "danger", variant: "inset" },
        "Failed to save",
      ),
    );
    const alert = renderToStaticMarkup(
      React.createElement(Alert, { tone: "danger" }, "Failed to save"),
    );
    expect(card).toContain('data-tone="danger"');
    expect(card).toContain('data-surface="inset"');
    expect(alert).toContain('role="alert"');
    expect(alert).toContain('data-tone="danger"');
  });

  it("retains link semantics, disabled buttons, and field error associations", () => {
    const link = renderToStaticMarkup(
      React.createElement(
        Button,
        { asChild: true, variant: "secondary" },
        React.createElement("a", { href: "/pt/programs" }, "Programs"),
      ),
    );
    const disabled = renderToStaticMarkup(
      React.createElement(Button, { disabled: true }, "Save"),
    );
    const field = renderToStaticMarkup(
      React.createElement(Input, {
        isInvalid: true,
        "aria-describedby": "name-error",
        "aria-label": "Name",
      }),
    );
    expect(link).toContain("<a ");
    expect(link).toContain('href="/pt/programs"');
    expect(link).not.toContain("<button");
    expect(disabled).toContain('disabled=""');
    expect(field).toContain('aria-invalid="true"');
    expect(field).toContain('aria-describedby="name-error"');
  });
});
