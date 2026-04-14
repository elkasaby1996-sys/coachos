import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientCheckinsPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "checkin.tsx"),
  "utf8",
);

describe("client check-ins page contract", () => {
  it("surfaces assigned and previous check-ins on the same page", () => {
    expect(clientCheckinsPage).toContain("Assigned and previous check-ins");
    expect(clientCheckinsPage).toContain("Assigned check-ins");
    expect(clientCheckinsPage).toContain("Previous check-ins");
  });

  it("allows selecting a check-in cycle from assigned/history rows", () => {
    expect(clientCheckinsPage).toContain("setSelectedCheckinId(item.row.id)");
    expect(clientCheckinsPage).toContain("setStep(2)");
  });
});

