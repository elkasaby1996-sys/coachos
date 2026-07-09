import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const checkinsPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "checkins.tsx"),
  "utf8",
);

describe("PT check-ins queue row surface", () => {
  it("renders queue rows with client names and due dates without extra status fragments", () => {
    expect(checkinsPage).toContain(
      "client:clients(id, display_name, full_name, user_id, status)",
    );
    expect(checkinsPage).toContain("row.client.full_name?.trim()");
    expect(checkinsPage).toContain("Due {dueDateLabel}");
    expect(checkinsPage).not.toContain("Week ending");
    expect(checkinsPage).not.toContain("Scheduled ahead");
    expect(checkinsPage).not.toContain("Missing:");
    expect(checkinsPage).not.toContain("Latest:");
  });

  it("keeps queue empty states title-only", () => {
    expect(checkinsPage).toContain('emptyTitle: "No check-ins due now"');
    expect(checkinsPage).toContain('emptyTitle: "No overdue check-ins"');
    expect(checkinsPage).toContain('emptyTitle: "No upcoming check-ins"');
    expect(checkinsPage).toContain("<EmptyState title={section.emptyTitle} />");
    expect(checkinsPage).not.toContain("emptyDescription");
    expect(checkinsPage).not.toContain("Nothing needs immediate review.");
    expect(checkinsPage).not.toContain("Nothing is overdue right now.");
    expect(checkinsPage).not.toContain(
      "Future scheduled check-ins will appear here.",
    );
  });
});
