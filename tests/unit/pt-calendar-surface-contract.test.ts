import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const calendarPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "calendar.tsx"),
  "utf8",
);

describe("PT calendar surface contracts", () => {
  it("highlights the full current day tile instead of only the date number", () => {
    expect(calendarPage).toContain(
      'aria-current={isToday ? "date" : undefined}',
    );
    expect(calendarPage).toContain("isToday &&");
    expect(calendarPage).toContain(
      '"border-primary/60 bg-primary/[0.10] shadow-[0_20px_42px_-32px_rgba(37,99,235,0.7)] ring-2 ring-primary/30"',
    );
    expect(calendarPage).not.toContain(
      'isToday\n                              ? "border-primary/45 bg-primary/16 text-primary"',
    );
  });
});
