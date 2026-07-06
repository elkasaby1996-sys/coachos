import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ptHubLayout = readFileSync(
  "src/components/layouts/pt-hub-layout.tsx",
  "utf8",
);

describe("PT Hub sidebar counts", () => {
  it("uses the total client count for the Clients nav badge", () => {
    expect(ptHubLayout).toContain(
      '"/pt-hub/clients": clientStats?.totalClients ?? 0',
    );
    expect(ptHubLayout).not.toContain("clientAttentionCount");
    expect(ptHubLayout).not.toContain(
      '(clientStats?.atRiskClients ?? 0) +',
    );
  });
});
