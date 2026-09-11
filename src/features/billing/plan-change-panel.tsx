import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSessionAuth } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { fetchPlanChangeState, requestPlanChange } from "./plan-change-api";
import {
  planChangePreviewSchema,
  safePlanChangeError,
  type PlanChangePreview,
  type PlanChangeInput,
} from "./plan-change-contracts";

const price = (minor: number, cadence: string) =>
  `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100)} USD ${cadence === "annual" ? "charged annually" : "charged monthly"}`;
export function PlanChangePreviewDetails({
  preview: p,
}: {
  preview: PlanChangePreview;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p>Current: {price(p.currentPriceMinor, p.sourceCadence)}</p>
      <p>Target: {price(p.targetPriceMinor, p.targetCadence)}</p>
      <p>
        {p.effectiveTiming === "immediate"
          ? "Immediate change. Expanded access starts after verified payment."
          : `Scheduled for ${new Date(p.effectiveAt!).toLocaleDateString()}. Your current plan continues until then.`}
      </p>
      <p>
        {p.effectiveTiming === "immediate"
          ? "Lemon Squeezy calculates proration and attempts payment immediately."
          : "Proration is disabled. Lemon Squeezy charges the target price at renewal."}{" "}
        Taxes and credits are determined by Lemon Squeezy. These list prices are
        not an exact charge preview.
      </p>
      {p.dataQualityIssue ? (
        <p role="alert">
          Capacity needs review before this change can proceed.
        </p>
      ) : null}
      {p.blockers.map((b) => (
        <p key={b.dimension} role="alert">
          {b.dimension.replace(/_/g, " ")}: {b.committed} committed; target
          limit {b.targetLimit ?? "unlimited"}. {b.overBy} over. {b.remediation}{" "}
          <Link className="underline" to={b.managementRoute}>
            Review {b.dimension.replace(/_/g, " ")}
          </Link>
        </p>
      ))}
    </div>
  );
}
export function PlanChangePanel({
  owner,
  refresh,
}: {
  owner: boolean;
  refresh: () => Promise<unknown>;
}) {
  const { user } = useSessionAuth();
  const state = useQuery({
    queryKey: ["billing", "plan-change", user?.id],
    queryFn: fetchPlanChangeState,
    enabled: Boolean(owner && user),
    retry: false,
  });
  const [editing, setEditing] = useState(false),
    [dialog, setDialog] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const [target, setTarget] = useState<PlanChangeInput>({
    targetPlanKey: "growth",
    targetCadence: "monthly",
    operationId: crypto.randomUUID(),
  });
  const [preview, setPreview] = useState<PlanChangePreview>();
  const lock = useRef(false);
  async function act(action: "preview" | "apply" | "cancel" | "refresh") {
    if (lock.current || !owner) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await requestPlanChange(
        action,
        action === "refresh"
          ? {}
          : action === "cancel"
            ? { operationId: state.data?.operation?.operationId }
            : target,
      );
      if (action === "preview")
        setPreview(planChangePreviewSchema.parse(result));
      else {
        setDialog(false);
        setPreview(undefined);
        setEditing(false);
        await Promise.all([state.refetch(), refresh()]);
      }
    } catch (e) {
      setError(safePlanChangeError(e).message);
      if (action !== "preview") await state.refetch();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!owner) return null;
  if (state.isLoading)
    return (
      <p role="status" className="text-sm">
        Loading plan changes…
      </p>
    );
  if (state.error)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm">
          Plan change status is unavailable. Refresh to try again.
        </p>
        <Button variant="secondary" onClick={() => void state.refetch()}>
          Refresh plan change
        </Button>
      </div>
    );
  if (!state.data?.linked) return null;
  const operation = state.data.operation;
  const pending =
    operation &&
    !["completed", "canceled", "failed"].includes(operation.status);
  return (
    <div className="space-y-3">
      <p className="text-sm">Current billing frequency: {state.data.cadence}</p>
      {pending ? (
        <div role="status" className="space-y-2 text-sm">
          <p>
            Plan change to {operation.targetPlanKey} / {operation.targetCadence}
            : {operation.status.replace(/_/g, " ")}
          </p>
          {operation.status === "awaiting_payment" ? (
            <p>
              Waiting for verified payment. Your source plan and capacity remain
              in place. Use payment recovery if payment failed.
            </p>
          ) : null}
          {operation.effectiveTiming === "period_end" ? (
            <p>
              Scheduled date:{" "}
              {new Date(operation.effectiveAt!).toLocaleDateString()}. The
              target plan limits new capacity commitments. Existing delivery
              remains available.
            </p>
          ) : null}
          {[
            "ambiguous",
            "manual_review",
            "cancel_pending",
            "provider_pending",
          ].includes(operation.status) ? (
            <p>
              The provider result needs confirmation. Refresh billing or contact
              support before requesting another change.
            </p>
          ) : null}
          {operation.status === "scheduled" ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void act("cancel")}
            >
              Cancel scheduled change
            </Button>
          ) : null}
        </div>
      ) : null}
      {state.data.eligible && !editing ? (
        <Button
          variant="secondary"
          onClick={() => {
            setTarget((t) => ({ ...t, operationId: crypto.randomUUID() }));
            setEditing(true);
          }}
        >
          Change plan
        </Button>
      ) : null}
      {editing ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Target plan
              <select
                aria-label="Target plan"
                className="ui-input block w-full"
                disabled={busy}
                value={target.targetPlanKey}
                onChange={(e) => {
                  setTarget((t) => ({
                    ...t,
                    targetPlanKey: e.target
                      .value as PlanChangeInput["targetPlanKey"],
                    operationId: crypto.randomUUID(),
                  }));
                  setPreview(undefined);
                }}
              >
                {["launch", "growth", "scale"].map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Target billing frequency
              <select
                aria-label="Target billing frequency"
                className="ui-input block w-full"
                disabled={busy}
                value={target.targetCadence}
                onChange={(e) => {
                  setTarget((t) => ({
                    ...t,
                    targetCadence: e.target
                      .value as PlanChangeInput["targetCadence"],
                    operationId: crypto.randomUUID(),
                  }));
                  setPreview(undefined);
                }}
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
          </div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void act("preview")}
          >
            Preview plan change
          </Button>
          {preview ? (
            <>
              <PlanChangePreviewDetails preview={preview} />
              {!preview.dataQualityIssue && !preview.blockers.length ? (
                <Button disabled={busy} onClick={() => setDialog(true)}>
                  Review and confirm
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="text-sm">
          Checking billing…
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void act("refresh")}
      >
        Refresh plan change
      </Button>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogTitle>Confirm plan change</DialogTitle>
          <DialogDescription>
            Review timing and list prices. Capacity and eligibility are checked
            again when you confirm.
          </DialogDescription>
          {preview ? <PlanChangePreviewDetails preview={preview} /> : null}
          <Button disabled={busy} onClick={() => void act("apply")}>
            Confirm plan change
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
