import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const accountTabSource = readFileSync(
  "src/pages/pt-hub/settings/tabs/account.tsx",
  "utf8",
);

describe("PT Hub account settings layout", () => {
  it("keeps country and phone fields aligned in a balanced desktop row", () => {
    expect(accountTabSource).toContain('label="Country & Phone"');
    expect(accountTabSource).toContain(
      'className="grid gap-3 md:grid-cols-2 md:items-start"',
    );
    expect(accountTabSource).not.toContain(
      "md:grid-cols-[minmax(13rem,0.36fr)_minmax(0,1fr)]",
    );
  });
});
