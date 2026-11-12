import { CustomerPortalButton } from "./customer-portal-button";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import type { AccountSubscriptionSummary } from "../account-entitlements/contracts";
import {
  usePaymentMethodState,
  usePaymentMethodSeatState,
  usePaymentMethodUpdateMutation,
} from "./use-payment-method-update";
import {
  safePaymentMethodError,
  PaymentMethodError,
} from "./payment-method-errors";
import { paymentMethodBrowserRegistry } from "./providers/payment-method-browser";
import {
  PAYMENT_METHOD_POLL_DURATION_MS,
  PAYMENT_METHOD_POLL_MS,
  paymentMethodRecoveryConfirmed,
} from "./payment-method-verification";

export function BillingRecoveryMessage({
  summary,
}: {
  summary?: AccountSubscriptionSummary;
}) {
  const state = !summary
    ? "unavailable"
    : summary.cancelAtPeriodEnd
      ? "cancellation_scheduled"
      : summary.effectiveStatus;
  return (
    <div role="status" className="space-y-2 text-sm">
      {state === "active" ? <p>Your paid subscription is active.</p> : null}
      {state === "past_due" ? (
        <p>
          A payment failed. Your access remains full. Update your payment method
          when recovery is available.
        </p>
      ) : null}
      {state === "grace" || state === "restricted" ? (
        <p>
          Payment is overdue. Your account is in existing-delivery-only access.
          Contact support if payment recovery is unavailable.
        </p>
      ) : null}
      {state === "cancellation_scheduled" ? (
        <p>
          Cancellation scheduled
          {summary?.currentPeriodEndsAt
            ? ` for ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(summary.currentPeriodEndsAt))}`
            : ""}
          . Your paid access continues through that date.
        </p>
      ) : null}
      {state === "expired" ? (
        <p>
          This subscription has ended. Start a new subscription using Checkout
          when available.
        </p>
      ) : null}
    </div>
  );
}
type Phase = "idle" | "checkout" | "verifying" | "pending" | "refreshed";
export function BillingManagementPanel({
  owner,
  subscription,
  refresh,
}: {
  owner: boolean;
  subscription?: AccountSubscriptionSummary;
  refresh: () => Promise<unknown>;
}) {
  const state = usePaymentMethodState(owner);
  const seats = usePaymentMethodSeatState(
    owner && state.data?.available === false,
  );
  const mutation = usePaymentMethodUpdateMutation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const busy = useRef(false);
  const launched = useRef(false);
  const wasPastDue = useRef(false);
  const refetchState = state.refetch;
  useEffect(
    () =>
      paymentMethodBrowserRegistry.subscribe((signal) => {
        if (owner && launched.current) {
          setCheckoutFailed(signal === "failed");
          // A failure alone does not prove that the checkout has closed.
          // Accept the first close/completion, then ignore late SDK callbacks.
          if (signal !== "failed") launched.current = false;
          setPhase(signal === "failed" ? "pending" : "verifying");
        }
      }),
    [owner],
  );
  useEffect(() => {
    if (!owner || phase !== "verifying") return;
    let stopped = false,
      inFlight = false;
    const deadline = performance.now() + PAYMENT_METHOD_POLL_DURATION_MS;
    async function tick() {
      if (stopped || inFlight) return;
      // A throttled tab may run a delayed interval before its expiry callback.
      if (performance.now() >= deadline) {
        stopped = true;
        launched.current = false;
        setPhase("pending");
        return;
      }
      inFlight = true;
      try {
        const [p] = await Promise.all([refetchState(), refresh()]);
        if (stopped) return;
        if (p.isError) throw new Error("unavailable");
        if (paymentMethodRecoveryConfirmed(wasPastDue.current, p.data)) {
          stopped = true;
          launched.current = false;
          setPhase("refreshed");
        }
      } catch {
        if (!stopped) {
          stopped = true;
          setRefreshFailed(true);
          setPhase("pending");
        }
      } finally {
        inFlight = false;
      }
    }
    void tick();
    const interval = window.setInterval(
      () => void tick(),
      PAYMENT_METHOD_POLL_MS,
    );
    const timeout = window.setTimeout(() => {
      stopped = true;
      launched.current = false;
      setPhase("pending");
      window.clearInterval(interval);
    }, PAYMENT_METHOD_POLL_DURATION_MS);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [owner, phase, refetchState, refresh]);
  const eligible = Boolean(owner && state.data?.available && !state.isError);
  const canOpen = phase === "idle" || phase === "refreshed";
  const reduction =
    !state.isError &&
    !seats.isError &&
    seats.data?.provider === "paddle" &&
    seats.data.summary &&
    !seats.data.summary.manualReview &&
    seats.data.operation?.status === "scheduled" &&
    seats.data.operation.direction === "reduction" &&
    seats.data.operation.errorCode === null &&
    seats.data.operation.targetAdditionalSeats <
      seats.data.summary.currentAdditionalSeats
      ? seats.data.operation
      : null;
  const reductionDate = reduction?.effectiveAt
    ? new Date(reduction.effectiveAt)
    : null;
  async function open() {
    if (!eligible || busy.current || launched.current || !canOpen) return;
    busy.current = true;
    launched.current = true;
    setRefreshFailed(false);
    setCheckoutFailed(false);
    setPhase("checkout");
    wasPastDue.current = Boolean(
      state.data?.available && state.data.status === "past_due",
    );
    try {
      await mutation.mutateAsync();
    } catch {
      launched.current = false;
      setPhase("pending");
    } finally {
      busy.current = false;
    }
  }
  async function manualRefresh() {
    if (busy.current || launched.current || phase === "verifying") return;
    busy.current = true;
    try {
      const [p] = await Promise.all([refetchState(), refresh()]);
      if (state.data?.available === false) await seats.refetch();
      setRefreshFailed(Boolean(p.isError));
      // A fresh positive RPC permits a new action or reuse of the server's
      // ready preparation. Never retry on cached data or a refresh error.
      // This says nothing about completion of an active update-only checkout.
      if (!p.isError && p.data?.available) {
        setCheckoutFailed(false);
        setPhase("refreshed");
      }
    } catch {
      setRefreshFailed(true);
    } finally {
      busy.current = false;
    }
  }
  if (!owner) return null;
  const error =
    mutation.error ??
    state.error ??
    (checkoutFailed ? new PaymentMethodError("client_launch") : undefined);
  return (
    <div className="space-y-3">
      <BillingRecoveryMessage summary={subscription} />
      {subscription?.kind === "paid" ? <CustomerPortalButton /> : null}
      {state.data?.available && state.data.maySettleExistingBalance ? (
        <p className="text-sm">
          Updating your payment method may collect your existing outstanding
          balance.
        </p>
      ) : null}
      {state.isLoading ? (
        <p role="status" className="text-sm">
          Loading billing management…
        </p>
      ) : null}
      {subscription?.kind === "paid" &&
      !["expired", "canceled"].includes(subscription.effectiveStatus) ? (
        <Button
          disabled={!eligible || mutation.isPending || !canOpen}
          onClick={() => void open()}
        >
          {mutation.isPending
            ? "Opening payment-method checkout…"
            : "Update payment method"}
        </Button>
      ) : null}
      {!eligible && !state.isLoading ? (
        <p className="text-sm text-muted-foreground">
          {reduction ? (
            <>
              A seat reduction is scheduled
              {reductionDate && Number.isFinite(reductionDate.getTime()) ? (
                <>
                  {" for "}
                  <time dateTime={reduction!.effectiveAt!}>
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "long",
                      timeStyle: "short",
                    }).format(reductionDate)}
                  </time>
                </>
              ) : null}
              . RepSync pauses payment-method updates while this change is
              pending. Refresh billing after it takes effect, or contact support
              for help sooner. Other billing checks may also need to resolve.
            </>
          ) : (
            <>
              Payment-method update is unavailable. Refresh billing or contact
              support.
            </>
          )}
        </p>
      ) : null}
      {phase === "checkout" ? (
        <p role="status" className="text-sm">
          Complete or close checkout to refresh billing. Checkout is not payment
          confirmation.
        </p>
      ) : null}
      {phase === "verifying" ? (
        <p role="status" className="text-sm">
          Confirming your payment update with Paddle…
        </p>
      ) : null}
      {phase === "pending" || phase === "refreshed" ? (
        <p role="status" className="text-sm">
          {phase === "refreshed"
            ? "Billing status refreshed from the server."
            : "Billing update is not yet confirmed. Refresh billing to check again."}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {safePaymentMethodError(error).message}
        </p>
      ) : null}
      {refreshFailed ? (
        <p role="alert" className="text-sm text-danger">
          Billing status is temporarily unavailable.
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={
          mutation.isPending ||
          phase === "checkout" ||
          phase === "verifying" ||
          launched.current
        }
        onClick={() => void manualRefresh()}
      >
        Refresh billing
      </Button>
    </div>
  );
}
