import { vi } from "vitest";
import { Socket } from "node:net";
import { Socket as DatagramSocket } from "node:dgram";

// Permanent worker-local baseline: restoring test spies must not restore network.
// HTTP(S), SDKs and fetch must be explicitly mocked by each unit test.
const forbiddenNetwork = (): never => {
  throw new Error("Unit network boundary: provide a mocked transport.");
};
globalThis.fetch = forbiddenNetwork;
Socket.prototype.connect = forbiddenNetwork;
DatagramSocket.prototype.send = forbiddenNetwork;

// Unit tests must provide their own behavior instead of constructing a real client.
// File-local vi.mock factories can replace this boundary for service tests.
vi.mock("../../src/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    from: () => {
      throw new Error(
        "Unit Supabase boundary: mock supabase.from explicitly before using it.",
      );
    },
  },
}));
