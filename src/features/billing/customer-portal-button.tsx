import { useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { acceptsPaddlePortalUrl } from "./portal-url";
import { configuredPaddleBrowser } from "./paddle-browser-config";

export function CustomerPortalButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  async function open() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setFailed(false);
    try {
      const { supabase } = await import("../../lib/supabase");
      const { data, error } = await supabase.functions.invoke(
        "billing-create-paddle-portal",
        { body: {} },
      );
      const { realm } = configuredPaddleBrowser();
      if (
        error ||
        data?.environment !== realm ||
        !acceptsPaddlePortalUrl(data?.portalUrl, realm)
      )
        throw new Error();
      window.location.assign(data.portalUrl);
    } catch {
      setFailed(true);
      setPending(false);
      lock.current = false;
    }
  }
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => void open()}
      >
        {pending
          ? "Opening billing portal…"
          : "Invoices and subscription management"}
      </Button>
      <p className="text-sm text-muted-foreground">
        View invoices, download receipts, or cancel your subscription securely
        with Paddle.
      </p>
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          The billing portal is unavailable. Try again or contact support.
        </p>
      ) : null}
    </div>
  );
}
