import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useSessionAuth } from "../../lib/auth";
import {
  fetchSeatQuantityState,
  requestSeatQuantity,
} from "./seat-quantity-api";
import {
  seatQuantityPreviewSchema,
  seatQuantityMessage,
  type SeatQuantityPreview,
  type SeatQuantityState,
} from "./seat-quantity-contracts";
const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
export function SeatQuantitySummary({
  summary: s,
}: {
  summary: NonNullable<SeatQuantityState["summary"]>;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p>
        {s.actual} active team identities · {s.pending} pending invitations ·{" "}
        {s.reserved} reserved
      </p>
      <p>
        {s.includedSeats} included seats + {s.currentAdditionalSeats} purchased
        additional seats
      </p>
      <p>
        Effective limit: {s.currentEffectiveLimit} · Plan maximum:{" "}
        {s.maximumSeats}
      </p>
      <p>
        Each additional seat: {money(s.unitPriceMinor)} USD /{" "}
        {s.cadence === "annual" ? "year" : "month"}
      </p>
      <p>
        Current recurring list total: {money(s.currentTotalMinor)} USD /{" "}
        {s.cadence === "annual" ? "year" : "month"}
      </p>
      {s.growthLimit < s.currentEffectiveLimit && (
        <p>
          New invitations must fit the scheduled limit of {s.growthLimit} seats.
        </p>
      )}
    </div>
  );
}
export function SeatQuantityPreviewDetails({
  preview: p,
}: {
  preview: SeatQuantityPreview;
}) {
  return (
    <div className="space-y-2 text-sm" aria-live="polite">
      <p>
        Target: {p.targetAdditionalSeats} additional seats ·{" "}
        {p.targetEffectiveLimit} total seats
      </p>
      <p>
        Target recurring list total: {money(p.targetTotalMinor)} USD /{" "}
        {p.cadence === "annual" ? "year" : "month"}
      </p>
      <p>
        {p.direction === "no-op"
          ? "This is your current seat count."
          : p.timing === "immediate"
            ? "Payment is attempted immediately. Additional seats become available after verified payment."
            : `Reduction takes effect at renewal${p.effectiveAt ? ` on ${new Date(p.effectiveAt).toLocaleDateString()}` : ""}. New invitations use the lower limit immediately.`}
      </p>
      <p>
        Proration, taxes and credits are calculated by Lemon Squeezy. These
        recurring list totals are not an exact charge preview.
      </p>
      {!p.eligible && <p role="alert">{seatQuantityMessage(p.errorCode)}</p>}
      {p.capacityBlocked && (
        <p>
          {p.actual} active + {p.pending} pending + {p.reserved} reserved ={" "}
          {p.committed} committed. Target limit: {p.targetEffectiveLimit}.{" "}
          <Link to="/pt-hub/workspaces" className="underline">
            Manage team and invitations
          </Link>
        </p>
      )}
    </div>
  );
}
export function SeatQuantityPanel({
  owner,
  refresh,
}: {
  owner: boolean;
  refresh: () => Promise<unknown>;
}) {
  const { user } = useSessionAuth();
  const client = useQueryClient();
  const state = useQuery({
    queryKey: ["billing", "seat-quantity", user?.id],
    queryFn: fetchSeatQuantityState,
    enabled: owner && !!user,
  });
  const [target, setTarget] = useState<number | null>(null);
  const [preview, setPreview] = useState<SeatQuantityPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intent = useRef<{ id: string; target: number } | null>(null);
  if (!owner) return null;
  const s = state.data?.summary;
  const op = state.data?.operation;
  const open = op && !["completed", "canceled", "failed"].includes(op.status);
  const run = async (action: "preview" | "apply" | "cancel" | "refresh") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const n = target ?? s?.currentAdditionalSeats ?? 0;
      if (
        action === "apply" &&
        (!intent.current || intent.current.target !== n)
      )
        intent.current = { id: crypto.randomUUID(), target: n };
      const result = await requestSeatQuantity(
        action,
        action === "refresh"
          ? {}
          : action === "cancel"
            ? { operationId: op!.id }
            : {
                targetAdditionalSeats: n,
                ...(action === "apply"
                  ? { operationId: intent.current!.id }
                  : {}),
              },
      );
      if (action === "preview")
        setPreview(seatQuantityPreviewSchema.parse(result));
      else {
        setPreview(null);
        await Promise.all([
          client.invalidateQueries({ queryKey: ["billing"] }),
          client.invalidateQueries({ queryKey: ["account-capacity"] }),
          client.invalidateQueries({ queryKey: ["account-entitlements"] }),
          refresh(),
        ]);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Coach-seat billing could not be verified. Refresh billing.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {state.isLoading && <p role="status">Loading coach seats…</p>}
      {state.error && <p role="alert">Coach-seat details are unavailable.</p>}
      {s && <SeatQuantitySummary summary={s} />}
      {s?.manualReview && (
        <p role="alert">
          {seatQuantityMessage("BILLING_SEAT_QUANTITY_MANUAL_REVIEW")}
        </p>
      )}
      {open && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            {op.status === "scheduled"
              ? `Reduction to ${op.targetAdditionalSeats} additional seats is scheduled for ${new Date(op.effectiveAt!).toLocaleDateString()}. Current seats remain available until then.`
              : op.status === "cancel_pending"
                ? "Cancellation is awaiting verification. The lower growth limit remains in effect."
                : seatQuantityMessage(
                    op.errorCode ??
                      (op.status === "awaiting_payment"
                        ? "BILLING_SEAT_QUANTITY_AWAITING_PAYMENT"
                        : "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS"),
                  )}
          </p>
          {op.status === "scheduled" &&
            op.effectiveAt &&
            Date.parse(op.effectiveAt) > Date.now() && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void run("cancel")}
              >
                Cancel scheduled reduction
              </Button>
            )}
        </div>
      )}
      {s && !open && !s.manualReview && (
        <div className="space-y-3">
          <label className="block text-sm" htmlFor="coach-seat-count">
            Additional coach seats
          </label>
          <select
            id="coach-seat-count"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            disabled={busy}
            value={target ?? s.currentAdditionalSeats}
            onChange={(e) => {
              setTarget(Number(e.target.value));
              setPreview(null);
              intent.current = null;
            }}
          >
            {Array.from({ length: s.maximumAdditionalSeats + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            className="ml-3"
            disabled={busy}
            onClick={() => void run("preview")}
          >
            Preview seat change
          </Button>
          {preview && (
            <>
              <SeatQuantityPreviewDetails preview={preview} />
              <Button
                disabled={
                  busy || !preview.eligible || preview.direction === "no-op"
                }
                onClick={() => void run("apply")}
              >
                {preview.direction === "reduction"
                  ? "Confirm scheduled reduction"
                  : "Confirm seat purchase"}
              </Button>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void run("refresh")}
      >
        {busy ? "Checking…" : "Refresh coach seats"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Inviting a team member never purchases a seat. Manage coach-seat
        quantities here; billing portal quantity changes are not supported.
      </p>
    </div>
  );
}
