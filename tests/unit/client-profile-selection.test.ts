import { describe, expect, it } from "vitest";
import { selectActiveClientProfile } from "../../src/lib/client-profile-selection";

type ClientRow = {
  id: string;
  workspace_id: string | null;
  relationship_status?: string | null;
  created_at: string | null;
};

const rows: ClientRow[] = [
  {
    id: "personal-client",
    workspace_id: null,
    created_at: "2026-04-01T08:00:00.000Z",
  },
  {
    id: "workspace-client-old",
    workspace_id: "workspace-old",
    created_at: "2026-04-02T08:00:00.000Z",
  },
  {
    id: "workspace-client-active",
    workspace_id: "workspace-active",
    created_at: "2026-04-03T08:00:00.000Z",
  },
];

describe("selectActiveClientProfile", () => {
  it("prefers the bootstrap active client id when it is present", () => {
    expect(selectActiveClientProfile(rows, "workspace-client-active")?.id).toBe(
      "workspace-client-active",
    );
  });

  it("ignores a stale transferred-out active client id after workspace transfer", () => {
    expect(
      selectActiveClientProfile(
        [
          {
            ...rows[1],
            relationship_status: "transferred_out",
          },
          rows[2],
        ],
        "workspace-client-old",
      )?.id,
    ).toBe("workspace-client-active");
  });

  it("falls back to the first workspace-backed client row", () => {
    expect(selectActiveClientProfile(rows, null)?.id).toBe(
      "workspace-client-old",
    );
  });

  it("skips removed workspace relationships when choosing the active row", () => {
    expect(
      selectActiveClientProfile(
        [
          {
            ...rows[1],
            relationship_status: "removed",
          },
          rows[2],
        ],
        null,
      )?.id,
    ).toBe("workspace-client-active");
  });

  it("skips transferred-out workspace relationships when choosing the active row", () => {
    expect(
      selectActiveClientProfile(
        [
          {
            ...rows[1],
            relationship_status: "transferred_out",
          },
          rows[2],
        ],
        null,
      )?.id,
    ).toBe("workspace-client-active");
  });

  it("keeps personal clients available when no workspace row exists", () => {
    expect(selectActiveClientProfile([rows[0]], null)?.id).toBe(
      "personal-client",
    );
  });
});
