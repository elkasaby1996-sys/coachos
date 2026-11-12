// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentMethodState } from "../../src/features/billing/payment-method-contracts";
import type { AccountSubscriptionSummary } from "../../src/features/account-entitlements/contracts";
const mocks = vi.hoisted(() => ({
  state: {
    available: true,
    status: "active",
    maySettleExistingBalance: false,
  } as PaymentMethodState,
  isError: false,
  refetch: vi.fn(),
  seats: vi.fn(),
  mutate: vi.fn(),
  refresh: vi.fn(),
  signal: undefined as
    | undefined
    | ((signal: "closed" | "completed" | "failed") => void),
}));
vi.mock("../../src/features/billing/use-payment-method-update", () => ({
  usePaymentMethodState: () => ({
    data: mocks.state,
    isError: mocks.isError,
    refetch: mocks.refetch,
  }),
  usePaymentMethodSeatState: () => ({ refetch: mocks.seats }),
  usePaymentMethodUpdateMutation: () => ({
    mutateAsync: mocks.mutate,
    isPending: false,
  }),
}));
vi.mock("../../src/features/billing/providers/payment-method-browser", () => ({
  paymentMethodBrowserRegistry: {
    subscribe: (listener: typeof mocks.signal) => {
      mocks.signal = listener;
      return () => {
        mocks.signal = undefined;
      };
    },
  },
}));
import { BillingManagementPanel } from "../../src/features/billing/billing-management-panel";
let root: Root, container: HTMLDivElement;
function button(label: string) {
  return [...container.querySelectorAll("button")].find(
    (entry) => entry.textContent === label,
  )!;
}
const update = () => button("Update payment method");
const refresh = () => button("Refresh billing");
async function click(target: HTMLButtonElement) {
  await act(async () => target.click());
}
async function signal(value: "closed" | "completed" | "failed") {
  await act(async () => mocks.signal?.(value));
}
async function mount(status: "active" | "past_due" = "active") {
  mocks.state = {
    available: true,
    status,
    maySettleExistingBalance: status === "past_due",
  };
  await act(async () =>
    root.render(
      createElement(BillingManagementPanel, {
        owner: true,
        subscription: {
          kind: "paid",
          effectiveStatus: status,
        } as AccountSubscriptionSummary,
        refresh: mocks.refresh,
      }),
    ),
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.isError = false;
  mocks.mutate.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.seats.mockResolvedValue({});
  mocks.refetch.mockImplementation(async () => ({
    data: mocks.state,
    isError: mocks.isError,
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
describe("payment-method interactions and retry fences", () => {
  it("can act after an idle refresh and fences same-tick double clicks", async () => {
    await mount();
    await click(refresh());
    expect(update().disabled).toBe(false);
    await act(async () => {
      update().click();
      update().click();
    });
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(update().disabled).toBe(true);
    expect(refresh().disabled).toBe(true);
  });
  it("allows a later explicit action after server-confirmed recovery", async () => {
    await mount("past_due");
    await click(update());
    mocks.state = {
      available: true,
      status: "active",
      maySettleExistingBalance: false,
    };
    await signal("completed");
    expect(container.textContent).toContain(
      "Billing status refreshed from the server",
    );
    expect(update().disabled).toBe(false);
    await signal("closed"); // Late callback from the old checkout is ignored.
    expect(update().disabled).toBe(false);
    await click(update());
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
    expect(update().disabled).toBe(true);
    expect(refresh().disabled).toBe(true);
  });
  it("keeps an early checkout callback when launch resolves later", async () => {
    let finish!: () => void;
    mocks.mutate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await mount();
    await click(update());
    await signal("closed");
    expect(container.textContent).toContain("Confirming your payment update");
    await act(async () => finish());
    expect(container.textContent).toContain("Confirming your payment update");
    expect(update().disabled).toBe(true);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
  it("never treats active status as update-only completion or automatically retries", async () => {
    await mount();
    await click(update());
    await signal("closed");
    await act(async () => vi.advanceTimersByTime(30_001));
    expect(container.textContent).toContain("not yet confirmed");
    expect(update().disabled).toBe(true);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    await click(refresh()); // Fresh availability can authorize server-side reuse.
    expect(update().disabled).toBe(false);
    expect(container.textContent).not.toContain("payment method updated");
    await click(update());
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
  it.each(["ambiguous", "stale-error", "refresh-rejection"])(
    "does not unlock a pending attempt after %s",
    async (failure) => {
      mocks.mutate.mockRejectedValue(new Error("unavailable"));
      await mount();
      await click(update());
      if (failure === "ambiguous")
        mocks.state = {
          available: false,
          reason: "not_available",
          maySettleExistingBalance: false,
        };
      if (failure === "stale-error") mocks.isError = true;
      if (failure === "refresh-rejection")
        mocks.refresh.mockRejectedValue(new Error("offline"));
      await click(refresh());
      expect(update().disabled).toBe(true);
      await click(update());
      expect(mocks.mutate).toHaveBeenCalledTimes(1);
    },
  );
  it("waits for checkout close after failure even if cached state is available", async () => {
    await mount();
    await click(update());
    await signal("failed");
    expect(update().disabled).toBe(true);
    expect(refresh().disabled).toBe(true);
    await click(refresh());
    expect(mocks.refetch).not.toHaveBeenCalled();
    await signal("closed");
    expect(container.textContent).toContain("Confirming your payment update");
  });
});
