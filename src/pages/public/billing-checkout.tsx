import { checkoutTransaction } from "../../features/billing/checkout-transaction";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useSessionAuth } from "../../lib/auth";
import { configuredPaddleBrowser } from "../../features/billing/paddle-browser-config";
import { paddlePaymentMethodBrowser } from "../../features/billing/providers/paddle-payment-method";

type Phase =
  | "opening"
  | "checkout"
  | "verifying"
  | "pending"
  | "confirmed"
  | "closed"
  | "failed";
export function BillingCheckoutPage() {
  const [transaction] = useState(() =>
    checkoutTransaction(window.location.search),
  );
  const [phase, setPhase] = useState<Phase>("opening");
  const opened = useRef(false);
  const { user } = useSessionAuth();
  useEffect(() => {
    // Remove the payment identifier before Paddle can automatically open it a second time.
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
    let active = true;
    const unsubscribe = paddlePaymentMethodBrowser.subscribe((signal) => {
      if (active)
        setPhase((current) => {
          if (
            current === "confirmed" ||
            (signal === "closed" && current === "verifying")
          )
            return current;
          return signal === "completed"
            ? "verifying"
            : signal === "closed"
              ? "closed"
              : "failed";
        });
    });
    async function open() {
      try {
        if (!transaction) throw new Error();
        const { realm } = configuredPaddleBrowser();
        await paddlePaymentMethodBrowser.ready();
        if (!active || opened.current) return;
        opened.current = true;
        await paddlePaymentMethodBrowser.open({
          kind: "provider_checkout",
          provider: "paddle",
          environment: realm,
          token: transaction,
        });
        if (active)
          setPhase((current) => (current === "opening" ? "checkout" : current));
      } catch {
        if (active) setPhase("failed");
      }
    }
    void open();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [transaction]);

  useEffect(() => {
    if (phase !== "verifying" || !transaction) return;
    if (!user) {
      setPhase("pending");
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 60_000;
    async function poll() {
      try {
        const { supabase } = await import("../../lib/supabase");
        const { data, error } = await supabase.rpc(
          "get_my_paddle_checkout_status_v1",
          { p_transaction: transaction },
        );
        if (!active) return;
        if (error || data?.status === "unavailable") {
          setPhase("pending");
          return;
        }
        if (data?.status === "confirmed") {
          setPhase("confirmed");
          return;
        }
        if (data?.status === "failed") {
          setPhase("failed");
          return;
        }
      } catch {
        if (active) setPhase("pending");
        return;
      }
      if (!active) return;
      if (Date.now() >= deadline) setPhase("pending");
      else timer = setTimeout(() => void poll(), 2000);
    }
    void poll();
    const timeout = setTimeout(() => {
      if (active) {
        active = false;
        setPhase("pending");
      }
    }, 60_000);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(timeout);
    };
  }, [phase, transaction, user]);
  const message: Record<Phase, string> = {
    opening: "Opening secure checkout…",
    checkout:
      "Complete your subscription payment in the secure Paddle checkout.",
    verifying: "Payment submitted. We’re waiting for confirmation from Paddle.",
    pending:
      "Payment confirmation is still pending. You can check again or return to billing. Avoid starting another purchase while this payment is pending.",
    confirmed: "Your subscription and coach seats are ready.",
    closed:
      "Checkout closed. If you completed a payment, check its status before starting another purchase.",
    failed:
      "Checkout could not be completed. Return to billing or contact support if you already submitted a payment.",
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">
        {phase === "confirmed"
          ? "Subscription confirmed"
          : "Subscription checkout"}
      </h1>
      <p
        role={phase === "failed" ? "alert" : "status"}
        aria-live="polite"
        className="text-muted-foreground"
      >
        {message[phase]}
      </p>
      <div className="flex flex-wrap gap-3">
        {transaction &&
        user &&
        ["pending", "closed", "failed"].includes(phase) ? (
          <Button onClick={() => setPhase("verifying")}>
            Check payment status
          </Button>
        ) : null}
        <Button variant="secondary" asChild>
          <Link to="/pt-hub/settings/billing">Return to billing</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Payments are processed securely by Paddle, our merchant of record.
      </p>
    </main>
  );
}
