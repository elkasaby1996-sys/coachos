import { describe, expect, it, vi } from "vitest";
import { fetchPtHubClientSummaries } from "../../src/features/pt-hub/lib/pt-hub";

describe("fetchPtHubClientSummaries", () => {
  it("loads all workspace clients through one aggregate RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const workspaces = [
      { id: "workspace-1", name: "Alpha" },
      { id: "workspace-2", name: "Beta" },
    ];

    const clients = await fetchPtHubClientSummaries({ rpc }, workspaces);

    expect(clients).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("pt_hub_clients_page", {
      p_limit: 1000,
      p_offset: 0,
      p_workspace_id: null,
      p_lifecycle: null,
      p_search: null,
      p_segment: null,
    });
  });
});
