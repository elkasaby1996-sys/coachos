import { describe, expect, it, vi } from "vitest";
import {
  OpenWearablesClient,
  mapOpenWearablesConnectionStatus,
} from "../../src/features/wearables/open-wearables-client";

describe("Open Wearables client", () => {
  it("prevents duplicate Open Wearables users by reusing external_user_id matches", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [{ id: "ow-user-1", external_user_id: "client-1" }],
      }),
    }));
    const client = new OpenWearablesClient({
      apiUrl: "https://wearables.example",
      apiKey: "server-secret",
      fetchImpl: fetchMock,
    });

    const user = await client.ensureUser({
      clientId: "client-1",
      workspaceId: "workspace-1",
    });

    expect(user.id).toBe("ow-user-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://wearables.example/api/v1/users?search=client-1&limit=100",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-Open-Wearables-API-Key": "server-secret",
        }),
      }),
    );
  });

  it("uses the server-only API key header and creates a mapped user when no duplicate exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "ow-user-1", external_user_id: "client-1" }),
      });
    const client = new OpenWearablesClient({
      apiUrl: "https://wearables.example/api/v1",
      apiKey: "server-secret",
      fetchImpl: fetchMock,
    });

    await client.ensureUser({
      clientId: "client-1",
      workspaceId: "workspace-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://wearables.example/api/v1/users",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Open-Wearables-API-Key": "server-secret",
        }),
        body: JSON.stringify({
          external_user_id: "client-1",
          email: "client-1@repsync.local",
          first_name: null,
          last_name: "workspace-1",
        }),
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("VITE_");
  });

  it("generates provider authorization URLs for the mapped Open Wearables user", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        authorization_url: "https://wearables.example/oauth/garmin",
      }),
    }));
    const client = new OpenWearablesClient({
      apiUrl: "https://wearables.example/",
      apiKey: "server-secret",
      fetchImpl: fetchMock,
    });

    const url = await client.getAuthorizationUrl({
      provider: "garmin",
      clientId: "ow-user-1",
      redirectUri: "https://app.example/app/wearables",
    });

    expect(url).toBe("https://wearables.example/oauth/garmin");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://wearables.example/api/v1/oauth/garmin/authorize?user_id=ow-user-1&redirect_uri=https%3A%2F%2Fapp.example%2Fapp%2Fwearables",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("maps external connection statuses to RepSync states", () => {
    expect(mapOpenWearablesConnectionStatus("active")).toBe("connected");
    expect(mapOpenWearablesConnectionStatus("revoked")).toBe("revoked");
    expect(mapOpenWearablesConnectionStatus("error")).toBe("sync_failed");
    expect(mapOpenWearablesConnectionStatus("unknown")).toBe("disconnected");
  });
});
