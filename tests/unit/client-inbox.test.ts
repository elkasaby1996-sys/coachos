import { describe, expect, it } from "vitest";

import { resolveWorkspaceThreadTitle } from "../../src/features/lead-chat/lib/client-inbox";

describe("resolveWorkspaceThreadTitle", () => {
  it("falls back to Coach instead of a generic conversation label", () => {
    expect(resolveWorkspaceThreadTitle({})).toBe("Coach");
  });
});
