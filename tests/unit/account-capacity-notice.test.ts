import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/lib/auth", () => ({
  useSessionAuth: () => ({ user: { id: "owner" } }),
}));
import { CapacityMutationNotice } from "../../src/features/account-capacity/mutation-notice";
import { CapacityMutationError } from "../../src/features/account-capacity/mutation-errors";
import { accountCapacityKeys } from "../../src/features/account-capacity/query-keys";
const error = new CapacityMutationError(
  "ACCOUNT_CAPACITY_LIMIT_REACHED",
  "coach_seats",
);
function render(audience: "owner" | "team" | "client") {
  const client = new QueryClient();
  client.setQueryData(accountCapacityKeys.owner("owner"), {
    dimensions: [{ key: "coach_seats", committed: 7, limit: 5 }],
  });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        null,
        createElement(CapacityMutationNotice, { error, audience }),
      ),
    ),
  );
}
describe("capacity denial notice", () => {
  it("renders an accessible owner alert with numbers and a working Billing link", () => {
    const html = render("owner");
    expect(html).toContain('role="alert"');
    expect(html).toContain("7 committed of 5");
    expect(html).toContain('href="/pt-hub/settings/billing"');
  });
  it.each(["team", "client"] as const)(
    "does not expose cached owner quantities to %s",
    (audience) => {
      const html = render(audience);
      expect(html).not.toContain("7 committed");
      expect(html).not.toContain("View Billing");
      expect(html).not.toContain("Coach seats");
      expect(html).toContain(
        audience === "client"
          ? "This coach is not accepting additional clients right now."
          : "Ask the owner to review Billing.",
      );
    },
  );
});
