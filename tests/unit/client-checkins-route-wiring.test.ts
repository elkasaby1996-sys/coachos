import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoutes = readFileSync(
  resolve(process.cwd(), "src", "routes", "app.tsx"),
  "utf8",
);
const clientLayout = readFileSync(
  resolve(process.cwd(), "src", "components", "layouts", "client-layout.tsx"),
  "utf8",
);

describe("client check-ins route wiring", () => {
  it("registers /app/checkins as a first-class route", () => {
    expect(appRoutes).toContain('path="checkins" element={<ClientCheckinPage />}');
  });

  it("keeps /app/checkin as a compatibility alias", () => {
    expect(appRoutes).toContain('path="checkin" element={<ClientCheckinPage />}');
  });

  it("shows Check-ins in the client navigation", () => {
    expect(clientLayout).toContain('label: "Check-ins"');
    expect(clientLayout).toContain('to: "/app/checkins"');
  });
});
