import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  useBillingProviderSummary,
  useCustomerPortalLinkMutation,
} from "./use-customer-portal";
import {
  billingRecoveryState,
  cleanPortalReturn,
  portalReturnState,
  PORTAL_POLL_DURATION_MS,
  PORTAL_POLL_MS,
} from "./portal-return-state";
import type {
  BillingProviderSummary,
  PortalLinkPurpose,
  PortalReturnState,
} from "./portal-contracts";
import { CustomerPortalError } from "./portal-errors";

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
          to help recover billing.
        </p>
      ) : null}
      {state === "grace" ? (
        <p>
          Payment is overdue. Your account is in existing-delivery-only access.
          Update your payment method to recover billing.
        </p>
      ) : null}
      {state === "cancellation_scheduled" ? (
        <p>
          Cancellation scheduled
          {summary?.currentPeriodEndsAt
            ? ` for ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(summary.currentPeriodEndsAt))}`
            : ""}
          . Your paid access continues through that date. Open Manage billing to
          resume before it ends.
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
const returnMessages: Partial<Record<PortalReturnState, string>> = {
  checking:
    "Checking for billing changes. Payment and subscription changes require verified reconciliation.",
  reconciliation_pending:
    "Waiting for verified billing reconciliation. Refresh to check again.",
  no_detected_change:
    "No billing change detected. Refresh if you are waiting for a recent update.",
  resumed: "Your subscription is active again.",
  provider_unavailable:
    "Billing status is temporarily unavailable. Refresh to try again.",
};
export function CustomerPortalPanel({
  owner,
  refresh,
}: {
  owner: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [search, setSearch] = useSearchParams();
  const [returned] = useState(() => search.get("portal") === "return");
  const [polling, setPolling] = useState(returned);
  const [returnState, setReturnState] = useState<PortalReturnState>("checking");
  const summary = useBillingProviderSummary(owner);
  const mutation = useCustomerPortalLinkMutation();
  const busy = useRef(false);
  const initial = useRef<BillingProviderSummary>();
  const refetch = summary.refetch;
  const searchRef = useRef(search);
  useEffect(() => {
    if (returned)
      setSearch(cleanPortalReturn(searchRef.current), { replace: true });
  }, [returned, setSearch]);
  useEffect(() => {
    if (!owner || !returned) return;
    let stopped = false,
      inFlight = false;
    const started = Date.now();
    async function tick() {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const [result] = await Promise.all([refetch(), refresh()]);
        if (stopped) return;
        const state = portalReturnState(
          initial.current,
          result.data,
          Date.now() - started < PORTAL_POLL_DURATION_MS,
          result.isError,
        );
        initial.current ??= result.data;
        setReturnState(state);
        if (!["checking", "reconciliation_pending"].includes(state)) {
          stopped = true;
          setPolling(false);
        }
      } catch {
        if (!stopped) {
          setReturnState("provider_unavailable");
          setPolling(false);
          stopped = true;
        }
      } finally {
        inFlight = false;
      }
    }
    void tick();
    const interval = window.setInterval(() => void tick(), PORTAL_POLL_MS);
    const timeout = window.setTimeout(() => {
      stopped = true;
      setPolling(false);
      setReturnState((state) =>
        state === "checking" ? "no_detected_change" : state,
      );
      window.clearInterval(interval);
    }, PORTAL_POLL_DURATION_MS);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [owner, returned, refetch, refresh]);
  async function open(purpose: PortalLinkPurpose) {
    if (!owner || busy.current) return;
    busy.current = true;
    try {
      await mutation.mutateAsync(purpose);
    } catch {
      /* Mutation exposes only a safe typed error. */
    } finally {
      busy.current = false;
    }
  }
  async function manualRefresh() {
    const [result] = await Promise.all([refetch(), refresh()]);
    setReturnState(
      portalReturnState(initial.current, result.data, false, result.isError),
    );
  }
  if (!owner) return null;
  const state = billingRecoveryState(summary.data);
  return (
    <div className="space-y-3">
      <BillingRecoveryMessage summary={summary.data} />
      {returned && returnMessages[returnState] ? (
        <p role="status" className="text-sm text-muted-foreground">
          {returnMessages[returnState]}
        </p>
      ) : null}
      {summary.data?.linked ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => void open("manage_billing")}
          >
            {mutation.isPending ? "Opening billing…" : "Manage billing"}
          </Button>
          {["past_due", "grace"].includes(state) ? (
            <Button
              disabled={mutation.isPending}
              onClick={() => void open("update_payment_method")}
            >
              Update payment method
            </Button>
          ) : null}
        </div>
      ) : null}
      {summary.isLoading ? (
        <p role="status" className="text-sm">
          Loading billing management…
        </p>
      ) : null}
      {mutation.error || summary.error ? (
        <p role="alert" className="text-sm text-danger">
          {(mutation.error ?? summary.error) instanceof CustomerPortalError
            ? (mutation.error ?? summary.error)?.message
            : "Billing management is temporarily unavailable."}
        </p>
      ) : null}
      {(returned && !polling) || summary.error ? (
        <Button variant="secondary" onClick={() => void manualRefresh()}>
          Refresh billing
        </Button>
      ) : null}
    </div>
  );
}
