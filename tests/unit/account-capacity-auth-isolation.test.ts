import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  accountCapacityKeys,
  invalidateAccountCapacity,
} from "../../src/features/account-capacity/query-keys";
describe("capacity auth isolation", () => {
  it.each([
    "src/lib/auth.tsx",
    "src/components/common/theme-provider.tsx",
    "src/components/common/bootstrap-gate.tsx",
    "src/main.tsx",
    "src/routes/app.tsx",
    "src/lib/auth-callback.ts",
    "src/pages/Login.tsx",
    "src/pages/public/login.tsx",
  ])("does not introduce capacity in %s", (path) =>
    expect(readFileSync(path, "utf8")).not.toMatch(
      /account-capacity|AccountCapacity/,
    ),
  );
  it("isolates cached snapshots by authenticated identity", () =>
    expect(accountCapacityKeys.owner("one")).not.toEqual(
      accountCapacityKeys.owner("two"),
    ));
  it("invalidation cannot fail a successful domain mutation", async () => {
    const client = new QueryClient();
    const mock = vi
      .spyOn(client, "invalidateQueries")
      .mockRejectedValue(new Error("offline"));
    expect(invalidateAccountCapacity(client)).toBeUndefined();
    await Promise.resolve();
    expect(mock).toHaveBeenCalledWith({ queryKey: accountCapacityKeys.all });
  });
});
