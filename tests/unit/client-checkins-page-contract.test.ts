import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientCheckinsPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "checkin.tsx"),
  "utf8",
);

describe("client check-ins page contract", () => {
  it("surfaces assigned and previous check-ins on the same page", () => {
    expect(clientCheckinsPage).toContain("Assigned check-ins");
    expect(clientCheckinsPage).toContain("Previous check-ins");
  });

  it("allows selecting a check-in cycle from assigned/history rows", () => {
    expect(clientCheckinsPage).toContain("setSelectedCheckinId(item.row.id)");
    expect(clientCheckinsPage).toContain("setStep(2)");
  });

  it("keeps the check-in form stepper and review details in one card", () => {
    const selectedCycleStart = clientCheckinsPage.indexOf("Check-in Form");
    const reviewStart = clientCheckinsPage.indexOf("Review and submit");
    const selectedCycleClose = clientCheckinsPage.indexOf(
      "{checkinIsUpcoming ?",
      selectedCycleStart,
    );
    const selectedCycleCard = clientCheckinsPage.slice(
      selectedCycleStart,
      selectedCycleClose,
    );

    expect(selectedCycleStart).toBeGreaterThan(-1);
    expect(reviewStart).toBeGreaterThan(selectedCycleStart);
    expect(selectedCycleClose).toBeGreaterThan(reviewStart);
    expect(clientCheckinsPage).not.toContain("Selected cycle");
    expect(selectedCycleCard).not.toContain("onClick={() => setStep(0)}");
    expect(selectedCycleCard).not.toContain("onClick={() => setStep(1)}");
    expect(selectedCycleCard).not.toContain("onClick={() => setStep(2)}");
  });
});
