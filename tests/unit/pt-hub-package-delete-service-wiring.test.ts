import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("pt hub package delete service wiring", () => {
  it("routes deletion through guarded server RPC and exposes explicit error codes", () => {
    const source = readSource("src/features/pt-hub/lib/pt-hub.ts");

    expect(source).toContain("PT_PACKAGE_DELETE_ERROR_REFERENCED");
    expect(source).toContain("PT_PACKAGE_DELETE_ERROR_FORBIDDEN");
    expect(source).toContain("getPtPackageDeleteErrorCode");
    expect(source).toContain('supabase.rpc("delete_pt_package_guarded"');
  });

  it("loads PT-scoped lead reference counts to support disabled delete UI", () => {
    const source = readSource("src/features/pt-hub/lib/pt-hub.ts");

    expect(source).toContain("usePtPackageLeadReferenceCounts");
    expect(source).toContain('from("pt_hub_leads")');
    expect(source).toContain('.eq("user_id", userId)');
    expect(source).toContain('.select("package_interest_id")');
    expect(source).toContain("counts[packageId] = (counts[packageId] ?? 0) + 1;");
    expect(source).toContain('queryKey: ["pt-package-lead-reference-counts", user?.id]');
  });
});
