import { describe, expect, it } from "vitest";
import {
  getClientRouteCandidates,
  getClientRouteKeyFallback,
} from "../../src/lib/client-route-key";

const clients = [
  { id: "00000000-0000-4000-8000-000000000101", url_key: null },
  { id: "00000000-0000-4000-8000-000000000102", url_key: null },
  { id: "00000000-0000-4000-8000-000000000103", url_key: null },
  { id: "00000000-0000-4000-8000-000000000104", url_key: null },
  { id: "00000000-0000-4000-8000-000000000105", url_key: null },
];

describe("client route identity", () => {
  it("gives clients with the same UUID prefix distinct links that resolve exactly", () => {
    const keys = clients.map((client) => getClientRouteKeyFallback(client.id));
    expect(new Set(keys).size).toBe(5);
    clients.forEach((client, index) => {
      expect(getClientRouteCandidates(clients, keys[index])).toEqual([client]);
      expect(
        getClientRouteCandidates([...clients].reverse(), keys[index]),
      ).toEqual([client]);
    });
  });

  it("rejects ambiguous legacy links instead of selecting the first client", () => {
    expect(getClientRouteCandidates(clients, "c-00000000")).toEqual([]);
  });

  it("preserves unambiguous legacy links", () => {
    expect(getClientRouteCandidates([clients[0]], "c-00000000")).toEqual([
      clients[0],
    ]);
  });

  it("prioritizes a persisted key over a colliding legacy fallback", () => {
    const persisted = { id: "another-client", url_key: "c-00000000" };
    expect(
      getClientRouteCandidates([...clients, persisted], "c-00000000"),
    ).toEqual([persisted]);
  });

  it("does not resolve missing keys or use a fallback for clients with a persisted key", () => {
    expect(getClientRouteCandidates(clients, "c-missing")).toEqual([]);
    expect(
      getClientRouteCandidates(
        [{ ...clients[0], url_key: "c-saved" }],
        getClientRouteKeyFallback(clients[0].id),
      ),
    ).toEqual([]);
    expect(getClientRouteKeyFallback(null)).toBeNull();
  });
});
