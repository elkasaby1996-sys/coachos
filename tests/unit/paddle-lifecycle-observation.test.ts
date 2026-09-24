import { describe, expect, it } from "vitest";
import { observeEvent } from "../../supabase/functions/_shared/paddle-webhook/observation";

const stamp = "2026-09-24T12:00:00.123456Z";
const period = {
  starts_at: "2026-09-20T00:00:00Z",
  ends_at: "2026-10-20T00:00:00Z",
};
function observation(
  data: Record<string, unknown> = {},
  kind = "subscription.updated",
) {
  return observeEvent(
    new TextEncoder().encode(
      JSON.stringify({
        event_id: "synthetic/lifecycle-event",
        notification_id: "synthetic/lifecycle-delivery",
        event_type: kind,
        occurred_at: stamp,
        data: {
          id: "synthetic/resource",
          customer_id: "synthetic/customer",
          subscription_id: "synthetic/subscription",
          status: kind === "transaction.completed" ? "completed" : "active",
          currency_code: "USD",
          items: [
            {
              status: "active",
              quantity: 1,
              price: {
                id: "synthetic/price",
                product_id: "synthetic/product",
                unit_price: { amount: "5900", currency_code: "USD" },
              },
            },
          ],
          ...data,
        },
      }),
    ),
  );
}
describe("Paddle retained lifecycle projection", () => {
  it("retains only lifecycle authority facts with exact timestamp spelling", () => {
    const value = observation({
      updated_at: stamp,
      current_billing_period: { ...period, private: "drop" },
      next_billed_at: null,
      canceled_at: null,
      paused_at: null,
      scheduled_change: {
        action: "cancel",
        effective_at: period.ends_at,
        private: "drop",
      },
      private: "drop",
    });
    expect(value).toMatchObject({
      updatedAt: stamp,
      currentBillingPeriod: {
        startsAt: period.starts_at,
        endsAt: period.ends_at,
      },
      nextBilledAt: null,
      canceledAt: null,
      pausedAt: null,
      scheduledChange: { action: "cancel", effectiveAt: period.ends_at },
    });
    expect(JSON.stringify(value)).not.toContain("drop");
  });
  it("distinguishes effective cancellation and absent scheduled change", () => {
    expect(
      observation({
        status: "canceled",
        canceled_at: stamp,
        current_billing_period: null,
        scheduled_change: null,
      }),
    ).toMatchObject({
      status: "canceled",
      canceledAt: stamp,
      currentBillingPeriod: null,
      scheduledChange: null,
    });
  });
  it("retains recurring transaction origin and period without unrelated fields", () => {
    expect(
      observation(
        { origin: "subscription_recurring", billing_period: period },
        "transaction.completed",
      ),
    ).toMatchObject({
      origin: "subscription_recurring",
      billingPeriod: { startsAt: period.starts_at, endsAt: period.ends_at },
    });
  });
  it("preserves legacy observation shape when new facts are absent", () => {
    expect(observation()).not.toHaveProperty("updatedAt");
    expect(observation({}, "transaction.completed")).not.toHaveProperty(
      "origin",
    );
    expect(
      observation({ updated_at: stamp }, "subscription.created"),
    ).not.toHaveProperty("updatedAt");
  });
  it.each([
    "2026-02-30T00:00:00Z",
    "2026-09-20",
    "2026-09-20T24:00:00Z",
    "2026-09-20T00:00:60Z",
    "0000-01-01T00:00:00Z",
    "2026-09-20T00:00:00+24:00",
    null,
    123,
  ])("rejects malformed updated_at %s", (updated_at) =>
    expect(() => observation({ updated_at })).toThrow(),
  );
  it.each(["next_billed_at", "canceled_at", "paused_at"])(
    "strictly validates %s",
    (key) => {
      expect(() => observation({ [key]: "2026-02-29T00:00:00Z" })).toThrow();
    },
  );
  it.each([
    {
      current_billing_period: {
        starts_at: period.ends_at,
        ends_at: period.starts_at,
      },
    },
    {
      current_billing_period: {
        starts_at: period.starts_at,
        ends_at: period.starts_at,
      },
    },
    { current_billing_period: { ends_at: period.ends_at } },
    { scheduled_change: { action: "cancel", effective_at: "tomorrow" } },
    { scheduled_change: { effective_at: stamp } },
  ])("rejects incomplete or contradictory lifecycle shape %j", (data) =>
    expect(() => observation(data)).toThrow(),
  );
  it("rejects invalid transaction period", () => {
    expect(() =>
      observation(
        { billing_period: { starts_at: stamp, ends_at: "invalid" } },
        "transaction.completed",
      ),
    ).toThrow();
  });
});
