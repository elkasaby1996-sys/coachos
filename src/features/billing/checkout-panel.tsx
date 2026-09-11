import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  PUBLIC_PLAN_SNAPSHOT_V1,
  formatCommercialPrice,
} from "../commercial-catalogue/public-plan-snapshot";
import type { PublicPlanKey } from "../commercial-catalogue/contracts";
import { BillingCheckoutError } from "./checkout-errors";
import {
  checkoutReturnAttempt,
  checkoutReturnState,
} from "./checkout-return-state";
import { useBillingCheckout } from "./use-billing-checkout";

export function BillingCheckoutPanel({
  owner,
  requestedPlan,
  subscription,
  refresh,
}: {
  owner: boolean;
  requestedPlan: PublicPlanKey;
  subscription: { kind: string | null; effectiveStatus: string } | undefined;
  refresh: () => Promise<unknown>;
}) {
  const [search, setSearch] = useSearchParams();
  const attempt = checkoutReturnAttempt(search);
  const [plan, setPlan] = useState<PublicPlanKey>(requestedPlan);
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");
  const [pollUntil, setPollUntil] = useState(() =>
    attempt ? Date.now() + 30_000 : 0,
  );
  const [now, setNow] = useState(Date.now);
  const [redirecting, setRedirecting] = useState(false);
  const lock = useRef(false);
  const operation = useRef<{
    plan: PublicPlanKey;
    cadence: string;
    id: string;
  }>();
  const billing = useBillingCheckout(
    attempt,
    Boolean(attempt && now < pollUntil),
    owner,
  );
  const returnState = checkoutReturnState(
    attempt,
    billing.state.data,
    subscription,
  );
  const paid =
    subscription?.kind === "paid" &&
    ["active", "past_due", "grace", "restricted"].includes(
      subscription.effectiveStatus,
    );
  useEffect(() => {
    if (!attempt || returnState !== "finalizing" || now >= pollUntil) return;
    const timer = window.setTimeout(() => {
      setNow(Date.now());
      void refresh();
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [attempt, returnState, now, pollUntil, refresh]);
  useEffect(() => {
    if (returnState !== "confirmed") return;
    const next = new URLSearchParams(search);
    next.delete("checkout");
    next.delete("attempt");
    setSearch(next, { replace: true });
    void refresh();
  }, [returnState, search, setSearch, refresh]);
  const selected = PUBLIC_PLAN_SNAPSHOT_V1.find((p) => p.planKey === plan)!;
  async function start() {
    if (!owner || paid || lock.current) return;
    lock.current = true;
    if (
      !operation.current ||
      operation.current.plan !== plan ||
      operation.current.cadence !== cadence ||
      ["expired", "failed"].includes(billing.state.data?.status ?? "")
    )
      operation.current = { plan, cadence, id: crypto.randomUUID() };
    try {
      const result = await billing.create.mutateAsync({
        planKey: plan,
        cadence,
        operationId: operation.current.id,
      });
      setRedirecting(true);
      window.location.assign(result.checkoutUrl);
    } catch {
      lock.current = false;
      void billing.state.refetch();
    }
  }
  if (!owner)
    return (
      <p className="text-sm text-muted-foreground">
        Only the account owner can start a subscription.
      </p>
    );
  return (
    <div className="space-y-4">
      {paid ? (
        <p role="status" className="text-sm">
          Paid subscription confirmed. Your current account access is shown
          above.
        </p>
      ) : null}
      {returnState === "finalizing" ? (
        <div role="status" className="space-y-2 text-sm">
          <p>
            Finalizing your subscription. We are waiting for verified payment
            confirmation.
          </p>
          {now >= pollUntil ? (
            <p>This is taking longer than expected. Refresh to check again.</p>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              setNow(Date.now());
              setPollUntil(Date.now() + 30_000);
              void billing.state.refetch();
              void refresh();
            }}
          >
            Refresh subscription
          </Button>
        </div>
      ) : null}
      {!paid && returnState !== "finalizing" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Plan
              <select
                aria-label="Plan"
                className="ui-input block min-h-11 w-full"
                value={plan}
                disabled={billing.create.isPending || redirecting}
                onChange={(e) => setPlan(e.target.value as PublicPlanKey)}
              >
                {PUBLIC_PLAN_SNAPSHOT_V1.map((p) => (
                  <option key={p.planKey} value={p.planKey}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Billing frequency
              <select
                aria-label="Billing frequency"
                className="ui-input block min-h-11 w-full"
                value={cadence}
                disabled={billing.create.isPending || redirecting}
                onChange={(e) =>
                  setCadence(e.target.value as "monthly" | "annual")
                }
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
          </div>
          <p className="text-sm font-medium">
            {formatCommercialPrice(
              cadence === "annual"
                ? selected.annualPriceMinor
                : selected.monthlyPriceMinor,
            )}{" "}
            USD {cadence === "annual" ? "charged annually" : "charged monthly"}
          </p>
          {["trial", "complimentary"].includes(subscription?.kind ?? "") ? (
            <p className="text-sm">Paid plan starts immediately</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Applicable taxes are calculated at checkout
          </p>
          <Button
            onClick={() => void start()}
            disabled={billing.create.isPending || redirecting}
          >
            {redirecting
              ? "Redirecting…"
              : billing.create.isPending
                ? "Creating checkout…"
                : "Start subscription"}
          </Button>
        </>
      ) : null}
      {billing.create.error || billing.state.error ? (
        <p role="alert" className="text-sm text-danger">
          {(billing.create.error ?? billing.state.error) instanceof
          BillingCheckoutError
            ? (billing.create.error ?? billing.state.error)?.message
            : "Billing is currently unavailable."}
        </p>
      ) : null}
      {returnState === "stopped" ? (
        <p role="status" className="text-sm">
          This checkout has ended. You can start a new subscription checkout.
        </p>
      ) : null}
    </div>
  );
}
