import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  billingRecoveryState,
  type BillingProviderSummary,
} from "./billing-management-contracts";
import {
  useBillingProviderSummary,
  usePaymentMethodState,
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
  summary?: BillingProviderSummary;
}) {
  const state = billingRecoveryState(summary);
  return (
    <div role="status" className="space-y-2 text-sm">
      {state === "active" ? <p>Your paid subscription is active.</p> : null}
      {state === "past_due" ? (
        <p>
          A payment failed. Your access remains full. Update your payment method
          when recovery is available.
        </p>
      ) : null}
      {state === "grace" ? (
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
      {state === "manual_review" ? (
        <p>
          Your billing needs manual review. Your previous plan has been
          preserved. Please contact support.
        </p>
      ) : null}
    </div>
  );
}
type Phase = "idle" | "checkout" | "verifying" | "pending" | "refreshed";
export function BillingManagementPanel({
  owner,
  refresh,
}: {
  owner: boolean;
  refresh: () => Promise<unknown>;
}) {
  const summary = useBillingProviderSummary(owner);
  const state = usePaymentMethodState(owner);
  const mutation = usePaymentMethodUpdateMutation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const busy = useRef(false);
  const launched = useRef(false);
  const wasPastDue = useRef(false);
  const refetchSummary = summary.refetch,
    refetchState = state.refetch;
  useEffect(
    () =>
      paymentMethodBrowserRegistry.subscribe((signal) => {
        if (owner && launched.current) {
          setCheckoutFailed(signal === "failed");
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
        const [s, p] = await Promise.all([
          refetchSummary(),
          refetchState(),
          refresh(),
        ]);
        if (stopped) return;
        if (s.isError || p.isError) throw new Error("unavailable");
        if (
          paymentMethodRecoveryConfirmed(wasPastDue.current, p.data, s.data)
        ) {
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
  }, [owner, phase, refetchSummary, refetchState, refresh]);
  const eligible = Boolean(
    owner &&
    state.data?.available &&
    summary.data?.linked &&
    !summary.data.pending &&
    summary.data.reconciliationStatus === "processed" &&
    ["active", "past_due"].includes(summary.data.status ?? "") &&
    state.data.status === summary.data.status &&
    !state.isError &&
    !summary.isError,
  );
  async function open() {
    if (!eligible || busy.current || phase !== "idle") return;
    busy.current = true;
    launched.current = true;
    wasPastDue.current = Boolean(
      state.data?.available && state.data.status === "past_due",
    );
    try {
      await mutation.mutateAsync();
      setPhase((current) => (current === "idle" ? "checkout" : current));
    } catch {
      launched.current = false;
      setPhase("pending");
    } finally {
      busy.current = false;
    }
  }
  async function manualRefresh() {
    if (busy.current) return;
    busy.current = true;
    try {
      const [s, p] = await Promise.all([
        refetchSummary(),
        refetchState(),
        refresh(),
      ]);
      setRefreshFailed(Boolean(s.isError || p.isError));
      if (paymentMethodRecoveryConfirmed(wasPastDue.current, p.data, s.data))
        setPhase("refreshed");
    } catch {
      setRefreshFailed(true);
    } finally {
      busy.current = false;
    }
  }
  if (!owner) return null;
  const error =
    mutation.error ??
    summary.error ??
    state.error ??
    (checkoutFailed ? new PaymentMethodError("client_launch") : undefined);
  return (
    <div className="space-y-3">
      <BillingRecoveryMessage summary={summary.data} />
      {state.data?.available && state.data.maySettleExistingBalance ? (
        <p className="text-sm">
          Updating your payment method may collect your existing outstanding
          balance.
        </p>
      ) : null}
      {state.isLoading || summary.isLoading ? (
        <p role="status" className="text-sm">
          Loading billing management…
        </p>
      ) : null}
      {summary.data?.linked &&
      !["expired", "canceled"].includes(summary.data.status ?? "") ? (
        <Button
          disabled={!eligible || mutation.isPending || phase !== "idle"}
          onClick={() => void open()}
        >
          {mutation.isPending
            ? "Opening payment-method checkout…"
            : "Update payment method"}
        </Button>
      ) : null}
      {!eligible && !state.isLoading && !summary.isLoading ? (
        <p className="text-sm text-muted-foreground">
          Payment-method update is unavailable. Refresh billing or contact
          support.
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
          Verifying billing update… Waiting for authenticated backend
          reconciliation.
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
        disabled={mutation.isPending || phase === "verifying"}
        onClick={() => void manualRefresh()}
      >
        Refresh billing
      </Button>
    </div>
  );
}
