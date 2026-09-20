import { describe, it, expect, vi } from "vitest";
import {
  createPaddleCheckoutOrchestrator,
  parsePaddleCheckoutIntent,
  checkoutLegalVersion,
} from "../../supabase/functions/_shared/paddle-checkout-orchestration";
import { PaddleCheckoutError } from "../../supabase/functions/_shared/paddle-checkout/validation";
const actor = "00000000-0000-4000-8000-000000000001";
const attempt = "00000000-0000-4000-8000-000000000002";
const intent = (seats = 0) => ({
  planKey: "growth",
  cadence: "monthly",
  additionalCoachSeats: seats,
  legal: {
    termsAccepted: true,
    refundAcknowledged: true,
    termsVersion: checkoutLegalVersion,
    refundVersion: checkoutLegalVersion,
  },
});
function setup(seats = 0) {
  const destination = {
    kind: "merchant_payment_link" as const,
    destination: () => ({ url: "https://example.invalid/pay" }),
    toJSON() {
      throw Error("not serializable");
    },
  };
  const rpc = vi.fn(async (name: string, args: any) =>
    name === "begin_paddle_checkout_v1"
      ? {
          dispatch: true,
          status: "creating",
          attemptReference: attempt,
          operationReference: args.p_operation,
          base: {
            priceReference: "synthetic/base",
            productReference: "synthetic/product/base",
            quantity: 1,
          },
          seats: seats
            ? {
                priceReference: "synthetic/seat",
                productReference: "synthetic/product/seat",
                quantity: seats,
              }
            : null,
        }
      : null,
  );
  const create = vi.fn(async (input: any) => ({
    provider: "paddle" as const,
    environment: "test" as const,
    transactionReference: "synthetic/transaction",
    status: "ready" as const,
    correlation: input.correlation,
    items: [
      { ...input.base, productReference: "synthetic/product/base" },
      ...(input.seats
        ? [{ ...input.seats, productReference: "synthetic/product/seat" }]
        : []),
    ],
    currency: "USD",
    total: null,
    createdAt: "2026-09-20T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
    billedAt: null,
    checkout: destination,
  }));
  const deps = {
    authenticate: vi.fn(async () => ({ id: actor })),
    serviceRpc: rpc,
    transport: vi.fn(() => ({
      createCheckoutTransaction: create,
      retrieveCheckoutTransaction: vi.fn(),
    })),
  };
  return {
    deps,
    rpc,
    create,
    destination,
    run: (body: unknown = intent(seats)) =>
      createPaddleCheckoutOrchestrator(deps).checkout(
        "trusted-auth-token",
        body,
      ),
  };
}
describe("dormant Paddle checkout orchestration", () => {
  for (const plan of ["launch", "growth", "scale"])
    for (const cadence of ["monthly", "annual"])
      it(`${plan} ${cadence} persists before dispatch`, async () => {
        const x = setup();
        const result = await x.run({ ...intent(), planKey: plan, cadence });
        expect(result).toEqual({ status: "ready", destination: x.destination });
        expect(x.rpc.mock.invocationCallOrder[0]).toBeLessThan(
          x.create.mock.invocationCallOrder[0],
        );
        expect(x.create).toHaveBeenCalledTimes(1);
        const input = x.create.mock.calls[0][0];
        expect(input.base.quantity).toBe(1);
        expect(input.correlation.attemptReference).toBe(attempt);
        expect(input.correlation.operationReference).toMatch(/^[a-f0-9-]{36}$/);
        expect(x.rpc.mock.calls[1][1]).not.toHaveProperty("url");
        expect(() => JSON.stringify(result)).toThrow("not serializable");
      });
  it.each([1, 2, 5])("sends only purchased extra seats (%i)", async (n) => {
    const x = setup(n);
    await x.run();
    expect(x.create.mock.calls[0][0].seats.quantity).toBe(n);
  });
  it.each([
    "priceReference",
    "productReference",
    "mappingId",
    "environment",
    "transactionReference",
    "checkoutUrl",
    "operationId",
    "userId",
    "billingAccountId",
  ])("rejects browser field %s", async (field) => {
    const x = setup();
    await expect(x.run({ ...intent(), [field]: "injected" })).rejects.toThrow(
      "INVALID",
    );
    expect(x.rpc).not.toHaveBeenCalled();
  });
  it.each([-1, 1.5, 6, NaN, "1"])("rejects invalid seats %s", (seats) => {
    expect(() =>
      parsePaddleCheckoutIntent({ ...intent(), additionalCoachSeats: seats }),
    ).toThrow("INVALID");
  });
  it.each([
    "termsAccepted",
    "refundAcknowledged",
    "termsVersion",
    "refundVersion",
  ])("rejects missing legal %s", async (field) => {
    const body = intent();
    delete (body.legal as any)[field];
    const x = setup();
    await expect(x.run(body)).rejects.toThrow();
    expect(x.rpc).not.toHaveBeenCalled();
  });
  it("rejects false consent and stale versions", () => {
    for (const change of [
      { termsAccepted: false },
      { refundAcknowledged: false },
      { termsVersion: "old" },
    ])
      expect(() =>
        parsePaddleCheckoutIntent({
          ...intent(),
          legal: { ...intent().legal, ...change },
        }),
      ).toThrow("LEGAL_REQUIRED");
  });
  it("requires authenticated actor", async () => {
    const x = setup();
    x.deps.authenticate.mockResolvedValue(null as any);
    await expect(x.run()).rejects.toThrow("FORBIDDEN");
    expect(x.rpc).not.toHaveBeenCalled();
  });
  it("sales=false blocks transport construction, transaction and destination", async () => {
    const x = setup();
    x.rpc.mockRejectedValue(Error("PADDLE_CHECKOUT_DISABLED"));
    await expect(x.run()).rejects.toThrow("DISABLED");
    expect(x.deps.transport).not.toHaveBeenCalled();
    expect(x.create).not.toHaveBeenCalled();
    expect(x.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["creating", "ready", "failed", "expired", "completed"])(
    "reuses %s without another POST",
    async (status) => {
      const x = setup();
      x.rpc.mockResolvedValue({ dispatch: false, status } as any);
      expect(await x.run()).toEqual({ status, reused: true });
      expect(x.create).not.toHaveBeenCalled();
    },
  );
  it("blocks ambiguous state without dispatch", async () => {
    const x = setup();
    x.rpc.mockResolvedValue({ dispatch: false, status: "ambiguous" } as any);
    await expect(x.run()).rejects.toThrow("AMBIGUOUS");
    expect(x.create).not.toHaveBeenCalled();
  });
  it("marks a pre-dispatch configuration failure failed", async () => {
    const x = setup();
    x.deps.transport.mockImplementation(() => {
      throw Error("private detail");
    });
    await expect(x.run()).rejects.toThrow("NOT_DISPATCHED");
    expect(x.rpc.mock.calls.at(-1)?.[0]).toBe("mark_paddle_checkout_failed_v1");
    expect(x.create).not.toHaveBeenCalled();
  });
  it("known transport rejection can fail without retry", async () => {
    const x = setup();
    x.create.mockRejectedValue(
      new PaddleCheckoutError("unprocessable", 422, false),
    );
    await expect(x.run()).rejects.toThrow("NOT_DISPATCHED");
    expect(x.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    new PaddleCheckoutError("timeout", undefined, true),
    Error("secret-network-details"),
  ])("uncertain POST remains ambiguous", async (error) => {
    const x = setup();
    x.create.mockRejectedValue(error);
    await expect(x.run()).rejects.toThrow("AMBIGUOUS");
    expect(x.create).toHaveBeenCalledTimes(1);
    expect(x.rpc.mock.calls.at(-1)?.[0]).toBe(
      "mark_paddle_checkout_ambiguous_v1",
    );
  });
  it.each(["environment", "correlation", "items", "status", "checkout"])(
    "response drift in %s is ambiguous",
    async (field) => {
      const x = setup();
      const original = x.create.getMockImplementation()!;
      x.create.mockImplementation(async (input: any) => ({
        ...(await original(input)),
        [field]: (
          {
            environment: "live",
            correlation: { operationReference: "wrong" },
            items: [],
            status: "paid",
            checkout: null,
          } as any
        )[field],
      }));
      await expect(x.run()).rejects.toThrow("AMBIGUOUS");
      expect(x.rpc.mock.calls.at(-1)?.[0]).toBe(
        "mark_paddle_checkout_ambiguous_v1",
      );
    },
  );
  it("lost ready persistence does not release destination or retry POST", async () => {
    const x = setup();
    const original = x.rpc.getMockImplementation()!;
    x.rpc.mockImplementation(async (n, a) => {
      if (n === "mark_paddle_checkout_ready_v1") throw Error("connection");
      return original(n, a);
    });
    await expect(x.run()).rejects.toThrow("AMBIGUOUS");
    expect(x.create).toHaveBeenCalledTimes(1);
  });
  it("persistence uncertainty fails closed", async () => {
    const x = setup();
    x.create.mockRejectedValue(Error());
    const original = x.rpc.getMockImplementation()!;
    x.rpc.mockImplementation(async (n, a) => {
      if (n === "mark_paddle_checkout_ambiguous_v1") throw Error();
      return original(n, a);
    });
    await expect(x.run()).rejects.toThrow("RECOVERY_REQUIRED");
  });
  it("has no payment or entitlement write port", async () => {
    const x = setup();
    await x.run();
    expect(x.rpc.mock.calls.map((c) => c[0])).toEqual([
      "begin_paddle_checkout_v1",
      "mark_paddle_checkout_ready_v1",
    ]);
  });
});
