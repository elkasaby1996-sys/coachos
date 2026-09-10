import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import {
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";
import { usePtHubPayments } from "../../../../features/pt-hub/lib/pt-hub";
import {
  useMyEffectiveAccountEntitlements,
  AccountEntitlementError,
} from "../../../../features/account-entitlements";
import { getPublicPlanLabel } from "../../../../features/commercial-catalogue/contracts";
import {
  useMyAccountCapacitySnapshot,
  AccountCapacityError,
} from "../../../../features/account-capacity";
import { CapacityMeters } from "../../../../features/account-capacity/capacity-meters";

export function PtHubSettingsBillingTab() {
  const paymentsQuery = usePtHubPayments();
  const entitlementsQuery = useMyEffectiveAccountEntitlements();
  const capacityQuery = useMyAccountCapacitySnapshot();
  const subscription = entitlementsQuery.data?.subscription;
  const invoices = paymentsQuery.data?.invoices ?? [];
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(value),
    );

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Plan and Subscription"
        description="Global PT Hub subscription controls."
      >
        {entitlementsQuery.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading subscription details...
          </p>
        ) : entitlementsQuery.error ? (
          <div role="alert">
            <SettingsHelperCallout
              title="Subscription details unavailable"
              body={
                entitlementsQuery.error instanceof AccountEntitlementError
                  ? entitlementsQuery.error.message
                  : "Subscription details could not be loaded. Please try again."
              }
              tone="warning"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void entitlementsQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : subscription ? (
          <>
            <SettingsFieldRow label="Current plan" hint="Account subscription">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{subscription.accessLabel}</Badge>
              </div>
            </SettingsFieldRow>
            {subscription.effectiveStatus === "no_subscription" ? (
              <p className="text-sm text-muted-foreground">
                Your 14-day Growth trial begins when you create your first
                workspace.
              </p>
            ) : null}
            {subscription.effectiveStatus === "trialing" &&
            subscription.trialEndsAt ? (
              <SettingsFieldRow
                label="Trial end date"
                hint="Growth trial; no automatic conversion."
              >
                <span className="text-sm">
                  {dateLabel(subscription.trialEndsAt)}
                </span>
              </SettingsFieldRow>
            ) : null}
            {subscription.effectiveStatus === "trial_recovery" &&
            subscription.trialRecoveryEndsAt ? (
              <SettingsFieldRow
                label="Recovery end date"
                hint="Trial ended. The recovery state is existing delivery only; access restrictions are not enforced yet."
              >
                <span className="text-sm">
                  {dateLabel(subscription.trialRecoveryEndsAt)}
                </span>
              </SettingsFieldRow>
            ) : null}
            {subscription.kind === "complimentary" ? (
              <p className="text-sm text-muted-foreground">
                Complimentary beta access follows the Scale v1 entitlement
                contract.
              </p>
            ) : null}
            {subscription.kind === "paid" &&
            subscription.currentPeriodStartedAt &&
            subscription.currentPeriodEndsAt ? (
              <SettingsFieldRow label="Current period">
                <span className="text-sm">
                  {dateLabel(subscription.currentPeriodStartedAt)} –{" "}
                  {dateLabel(subscription.currentPeriodEndsAt)}
                </span>
              </SettingsFieldRow>
            ) : null}
            {["restricted", "canceled", "expired", "grace"].includes(
              subscription.effectiveStatus,
            ) ? (
              <p className="text-sm text-muted-foreground">
                Subscription state: {subscription.effectiveStatus}. Access mode:{" "}
                {subscription.accessMode.replace(/_/g, " ")}. This is a
                read-only status display; access restrictions are not enforced
                yet.
              </p>
            ) : null}
            {entitlementsQuery.data ? (
              <SettingsFieldRow
                label="Intended paid plan"
                hint="A preference only; does not change your current access."
              >
                <span className="text-sm">
                  {getPublicPlanLabel(
                    entitlementsQuery.data.billingAccount.requestedPaidPlanKey,
                  )}
                </span>
              </SettingsFieldRow>
            ) : null}
          </>
        ) : null}
        <SettingsFieldRow
          label="Billing portal"
          hint="Self-serve billing portal is not connected yet."
        >
          <Button type="button" variant="secondary" disabled>
            Manage subscription (Unavailable)
          </Button>
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Account capacity"
        description="Current usage across all workspaces you own. Pending invitations and short-lived reservations are shown separately."
      >
        <p className="text-sm text-muted-foreground">
          Current usage across all workspaces you own. Pending invitations and
          short-lived reservations are shown separately.
        </p>
        {capacityQuery.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading account capacity...
          </p>
        ) : capacityQuery.error ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm font-medium">Account capacity unavailable</p>
            <p className="text-sm text-muted-foreground">
              {capacityQuery.error instanceof AccountCapacityError
                ? capacityQuery.error.message
                : "Account capacity could not be loaded. Please try again."}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void capacityQuery.refetch()}
            >
              Retry capacity
            </Button>
          </div>
        ) : capacityQuery.data ? (
          <CapacityMeters snapshot={capacityQuery.data} />
        ) : null}
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Payment Methods"
        description="Cards and bank details for subscription billing."
      >
        <div className="ui-inset flex flex-wrap items-center justify-between gap-3 border border-border/70 px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              No payment method connected
            </p>
            <p className="text-xs text-muted-foreground">
              Add a card when the billing portal is connected.
            </p>
          </div>
          <Button type="button" variant="secondary" disabled>
            Add payment method (Unavailable)
          </Button>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Invoice History"
        description="Invoice export and payments history."
      >
        <div className="space-y-2">
          {paymentsQuery.isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading invoice placeholder...
            </p>
          ) : null}
          {paymentsQuery.error ? (
            <p role="alert" className="text-sm text-muted-foreground">
              Invoice details are currently unavailable.
            </p>
          ) : null}
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="ui-inset flex items-center justify-between border border-border/70 px-4 py-3"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {invoice.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {invoice.status}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {invoice.amountLabel}
              </p>
            </div>
          ))}
        </div>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Scope boundary"
        body="Billing is managed only in PT Hub. Workspace settings do not expose subscription controls."
      />
    </div>
  );
}
