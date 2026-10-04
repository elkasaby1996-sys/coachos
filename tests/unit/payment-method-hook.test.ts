// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  ready: vi.fn(),
}));
vi.mock("../../src/lib/supabase", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("../../src/features/billing/providers/payment-method-browser", () => ({
  paymentMethodBrowserRegistry: {
    ready: mocks.ready,
    forContinuation: () => ({ open: mocks.open }),
  },
}));
vi.mock("../../src/lib/auth", () => ({
  useSessionAuth: () => ({ user: { id: "synthetic-owner" } }),
}));
import { usePaymentMethodUpdateMutation } from "../../src/features/billing/use-payment-method-update";
const token = `txn_${"a".repeat(26)}`;
let root: Root, container: HTMLDivElement, client: QueryClient;
let mutation: ReturnType<typeof usePaymentMethodUpdateMutation>;
function Harness() {
  mutation = usePaymentMethodUpdateMutation();
  return null;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mocks.ready.mockResolvedValue(undefined);
  mocks.open.mockResolvedValue(undefined);
  mocks.invoke.mockResolvedValue({
    data: {
      intent: "update_payment_method",
      effect: { kind: "update_only" },
      continuation: {
        kind: "provider_checkout",
        provider: "paddle",
        environment: "test",
        token,
      },
    },
    error: null,
  });
  client = new QueryClient({ defaultOptions: { mutations: { retry: 2 } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Harness)),
    );
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  client.clear();
});
describe("actual payment-method mutation cache", () => {
  it("immediately launches and never caches the continuation or variables", async () => {
    let result: unknown = "unset";
    await act(async () => {
      result = await mutation.mutateAsync();
    });
    expect(result).toBeUndefined();
    expect(mocks.invoke.mock.calls).toEqual([
      [
        "billing-update-payment-method",
        { body: { intent: "update_payment_method" } },
      ],
    ]);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    const states = client
      .getMutationCache()
      .getAll()
      .map((entry) => entry.state);
    expect(states).toHaveLength(1);
    expect(states[0].data).toBeUndefined();
    expect(states[0].variables).toBeUndefined();
    expect(JSON.stringify(states)).not.toContain(token);
    expect(window.location.href).not.toContain(token);
    expect(
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ).not.toContain(token);
  });
  it("overrides application retry defaults and caches only safe failure", async () => {
    mocks.invoke.mockRejectedValue(new Error(token));
    await act(async () => {
      await expect(mutation.mutateAsync()).rejects.toThrow(
        "temporarily unavailable",
      );
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.open).not.toHaveBeenCalled();
    const states = client
      .getMutationCache()
      .getAll()
      .map((entry) => entry.state);
    expect(JSON.stringify(states)).not.toContain(token);
    expect(states[0].error?.message).not.toContain(token);
  });
});
