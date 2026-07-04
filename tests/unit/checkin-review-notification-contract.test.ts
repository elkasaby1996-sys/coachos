import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8");

const migration = readRepo(
  "supabase",
  "migrations",
  "20260704100000_checkin_review_client_notification.sql",
);
const notificationTypes = readRepo(
  "src",
  "features",
  "notifications",
  "lib",
  "types.ts",
);
const notificationUtils = readRepo(
  "src",
  "features",
  "notifications",
  "lib",
  "notification-utils.tsx",
);
const clientCheckinPage = readRepo("src", "pages", "client", "checkin.tsx");

describe("check-in review client notification contract", () => {
  it("notifies the check-in client when review feedback is first completed", () => {
    expect(migration).toContain(
      "create or replace function public.handle_checkin_reviewed_notifications()",
    );
    expect(migration).toContain(
      "old.reviewed_at is not null or new.reviewed_at is null",
    );
    expect(migration).toContain(
      "nullif(trim(coalesce(new.pt_feedback, '')), '') is null",
    );
    expect(migration).toContain("from public.clients c");
    expect(migration).toContain("where c.id = new.client_id");
    expect(migration).toContain("v_client_user_id");
    expect(migration).toContain("public.notify_user");
  });

  it("routes the notification to the client check-in feedback view", () => {
    expect(migration).toContain("'checkin_reviewed'");
    expect(migration).toContain("'Check-in feedback ready'");
    expect(migration).toContain("'Your coach reviewed your check-in.'");
    expect(migration).toContain("format('/app/checkins?checkin=%s', new.id)");
    expect(migration).toContain("'checkin'");
    expect(migration).toContain("new.id");
    expect(migration).toContain("'checkins'");
  });

  it("installs an update trigger without changing the review RPC", () => {
    expect(migration).toContain(
      "create trigger checkin_reviewed_notifications_update",
    );
    expect(migration).toContain("after update on public.checkins");
    expect(migration).not.toContain("create or replace function public.review_checkin");
  });

  it("registers check-in reviewed as a notification-center type", () => {
    expect(notificationTypes).toContain('"checkin_reviewed"');
    expect(notificationUtils).toContain('case "checkin_reviewed":');
    expect(notificationUtils).toContain('return "Check-in reviewed";');
  });

  it("lets notification routes select a reviewed check-in on the client page", () => {
    expect(clientCheckinPage).toContain("const location = useLocation()");
    expect(clientCheckinPage).toContain("notificationTargetCheckinId");
    expect(clientCheckinPage).toContain('params.get("checkin")');
    expect(clientCheckinPage).toContain(
      ".eq(\"id\", notificationTargetCheckinId)",
    );
    expect(clientCheckinPage).toContain(
      "setSelectedCheckinId(notificationTargetCheckinId)",
    );
  });
});
