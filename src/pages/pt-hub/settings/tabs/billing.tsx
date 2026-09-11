import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import {
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";
import { useCallback } from "react";
import { BillingCheckoutPanel } from "../../../../features/billing/checkout-panel";
import { CustomerPortalPanel } from "../../../../features/billing/customer-portal-panel";
import { PlanChangePanel } from "../../../../features/billing/plan-change-panel";
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
  const entitlementsQuery = useMyEffectiveAccountEntitlements();
  const capacityQuery = useMyAccountCapacitySnapshot();
  const subscription = entitlementsQuery.data?.subscription;
  const refetchEntitlements = entitlementsQuery.refetch;
  const refetchCapacity = capacityQuery.refetch;
  const refreshBilling = useCallback(async () => {
    await Promise.all([refetchEntitlements(), refetchCapacity()]);
  }, [refetchEntitlements, refetchCapacity]);
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
            <p className="text-sm font-medium">
              Subscription details unavailable
            </p>
            <p className="text-sm text-muted-foreground">
              {entitlementsQuery.error instanceof AccountEntitlementError
                ? entitlementsQuery.error.message
                : "Subscription details could not be loaded. Please try again."}
            </p>
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
        {entitlementsQuery.data ? (
          <BillingCheckoutPanel
            owner={entitlementsQuery.data.billingAccount.canManageBilling}
            requestedPlan={
              entitlementsQuery.data.billingAccount.requestedPaidPlanKey
            }
            subscription={subscription}
            refresh={refreshBilling}
          />
        ) : null}
      </SettingsSectionCard>

      {entitlementsQuery.data?.billingAccount.canManageBilling &&
      subscription?.kind === "paid" ? (
        <SettingsSectionCard
          title="Plan changes"
          description="Review plan, billing frequency and capacity before confirming."
        >
          <PlanChangePanel owner={true} refresh={refreshBilling} />
        </SettingsSectionCard>
      ) : null}

      {entitlementsQuery.data?.billingAccount.canManageBilling ? (
        <SettingsSectionCard
          title="Billing management"
          description="Manage payment details and your subscription securely with our billing provider."
        >
          <CustomerPortalPanel
            owner={entitlementsQuery.data.billingAccount.canManageBilling}
            refresh={refreshBilling}
          />
        </SettingsSectionCard>
      ) : null}

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

      <SettingsHelperCallout
        title="Scope boundary"
        body="Billing is managed only in PT Hub. Workspace settings do not expose subscription controls."
      />
    </div>
  );
}
