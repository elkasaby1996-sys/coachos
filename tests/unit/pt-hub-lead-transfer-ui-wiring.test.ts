import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(pathFromRoot: string) {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

describe("pt hub lead transfer UI wiring", () => {
  it("shows an explicit transfer confirmation warning in lead detail", () => {
    const source = readSource("src/features/pt-hub/components/pt-hub-lead-detail-view.tsx");

    expect(source).toContain('This lead has been converted and assigned to "{currentWorkspaceName}" workspace.');
    expect(source).toContain("disabled={approveDisabled || isConvertedLead}");
    expect(source).toContain("disabled={saving || isConvertedLead}");
    expect(source).toContain("Lead already converted");
    expect(source).toContain("Transfer lead to another workspace?");
    expect(source).toMatch(
      /lose workspace-related client data in the current workspace and start\s+over in the new workspace\./,
    );
    expect(source).toContain("Transfer lead and reset workspace data");
    expect(source).toContain("requiresTransferConfirmation");
    expect(source).toContain("void submitApproval(true);");
  });

  it("passes transfer confirmation through page and RPC payload", () => {
    const pageSource = readSource("src/pages/pt-hub/lead-detail.tsx");
    const libSource = readSource("src/features/pt-hub/lib/pt-hub.ts");

    expect(pageSource).toContain("allowTransfer: params.allowTransfer");
    expect(libSource).toContain("allowTransfer?: boolean;");
    expect(libSource).toContain("p_allow_transfer: params.allowTransfer ?? false");
    expect(libSource).toContain("LEAD_TRANSFER_REQUIRES_CONFIRMATION");
  });
});
