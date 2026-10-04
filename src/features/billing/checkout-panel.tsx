import { useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  PUBLIC_PLAN_SNAPSHOT_V1,
  formatCommercialPrice,
} from "../commercial-catalogue/public-plan-snapshot";
import type { PublicPlanKey } from "../commercial-catalogue/contracts";
import { BillingCheckoutError } from "./checkout-errors";
import { useBillingCheckout } from "./use-billing-checkout";
import { billingBrowserProvider } from "./providers/active-provider";
import { legalSiteConfig } from "../../lib/legal-site";

export function BillingCheckoutPanel({
  owner,
  requestedPlan,
  subscription,
  billingUnavailable = false,
}: {
  owner: boolean;
  requestedPlan: PublicPlanKey;
  subscription: { kind: string | null; effectiveStatus: string } | undefined;
  billingUnavailable?: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [additionalCoachSeats, setAdditionalCoachSeats] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [refundAcknowledged, setRefundAcknowledged] = useState(false);
  const [plan, setPlan] = useState<PublicPlanKey>(requestedPlan);
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");
  const [redirecting, setRedirecting] = useState(false);
  const lock = useRef(false);
  const billing = useBillingCheckout();
  const paid =
    subscription?.kind === "paid" &&
    ["active", "past_due", "grace", "restricted"].includes(
      subscription.effectiveStatus,
    );
  const selected = PUBLIC_PLAN_SNAPSHOT_V1.find((p) => p.planKey === plan)!;
  const blocked =
    billing.create.error instanceof BillingCheckoutError &&
    billing.create.error.blocksNewCheckout;
  const consentMissing = !termsAccepted || !refundAcknowledged;
  async function start() {
    if (
      !owner ||
      billingUnavailable ||
      paid ||
      !billingBrowserProvider ||
      lock.current ||
      blocked ||
      consentMissing
    )
      return;
    lock.current = true;
    try {
      const result = await billing.create.mutateAsync({
        planKey: plan,
        cadence,
        additionalCoachSeats,
        legal: {
          termsAccepted: true,
          refundAcknowledged: true,
          termsVersion: legalSiteConfig.version,
          refundVersion: legalSiteConfig.version,
        },
      });
      setRedirecting(true);
      window.location.assign(result.checkoutUrl);
    } catch {
      lock.current = false;
    }
  }
  if (!owner)
    return (
      <p className="text-sm text-muted-foreground">
        Only the account owner can start a subscription.
      </p>
    );
  if (billingUnavailable)
    return (
      <p role="alert" className="text-sm text-danger">
        Billing could not be verified. Refresh billing or contact support before
        starting a subscription.
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
      {!paid && !billingBrowserProvider ? (
        <p role="alert" className="text-sm text-danger">
          Subscription checkout is currently unavailable.
        </p>
      ) : null}
      {!paid && billingBrowserProvider ? (
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
            Base plan:{" "}
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
          <fieldset
            className="space-y-3"
            disabled={billing.create.isPending || redirecting || blocked}
          >
            <legend className="sr-only">Checkout acknowledgements</legend>
            <label className="block space-y-2 text-sm font-medium">
              Additional coach seats
              <input
                type="number"
                min={0}
                max={5}
                step={1}
                className="ui-input block min-h-11 w-full"
                value={additionalCoachSeats}
                onChange={(e) =>
                  setAdditionalCoachSeats(e.target.valueAsNumber)
                }
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Additional seat pricing is confirmed at checkout.
            </p>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <span>
                I accept the{" "}
                <a
                  className="underline"
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                >
                  Terms of Service
                </a>
              </span>
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={refundAcknowledged}
                onChange={(e) => setRefundAcknowledged(e.target.checked)}
              />
              <span>
                I acknowledge the{" "}
                <a
                  className="underline"
                  href="/refunds"
                  target="_blank"
                  rel="noreferrer"
                >
                  Refund Policy
                </a>
              </span>
            </label>
          </fieldset>
          <Button
            onClick={() => void start()}
            disabled={
              billing.create.isPending ||
              redirecting ||
              blocked ||
              consentMissing
            }
          >
            {redirecting
              ? "Redirecting…"
              : billing.create.isPending
                ? "Creating checkout…"
                : "Start subscription"}
          </Button>
        </>
      ) : null}
      {billing.create.error ? (
        <p role="alert" className="text-sm text-danger">
          {billing.create.error instanceof BillingCheckoutError
            ? billing.create.error.message
            : "Billing is currently unavailable."}
        </p>
      ) : null}
    </div>
  );
}
