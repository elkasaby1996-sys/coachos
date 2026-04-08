import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import {
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";
import { usePtHubPayments } from "../../../../features/pt-hub/lib/pt-hub";

export function PtHubSettingsBillingTab() {
  const paymentsQuery = usePtHubPayments();

  if (paymentsQuery.isLoading) {
    return (
      <SettingsSectionCard
        title="Billing"
        description="Loading billing settings..."
      >
        <p className="text-sm text-muted-foreground">
          Please wait while we load billing details.
        </p>
      </SettingsSectionCard>
    );
  }

  if (paymentsQuery.error || !paymentsQuery.data) {
    return (
      <SettingsSectionCard
        title="Billing"
        description="Billing details are currently unavailable."
      >
        <SettingsHelperCallout
          title="Read-only fallback"
          body="Billing and invoice data could not be loaded. Retry later."
          tone="warning"
        />
      </SettingsSectionCard>
    );
  }

  const { subscription, invoices, revenue } = paymentsQuery.data;

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Plan and Subscription"
        description="Global PT Hub subscription controls."
      >
        <SettingsFieldRow label="Current plan" hint="Source: pt_hub_settings">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{subscription.planName}</Badge>
            <Badge variant="muted">{subscription.billingStatus}</Badge>
          </div>
        </SettingsFieldRow>
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
        title="Usage and Revenue Snapshot"
        description="Read-only overview from current data model."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Monthly revenue
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {revenue.monthlyRevenueLabel}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Active paying clients
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {revenue.activePayingClientsLabel}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Potential active clients
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {revenue.potentialActiveClients}
            </p>
          </div>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Invoice History"
        description="Invoice export and payments history."
      >
        <div className="space-y-2">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-center justify-between rounded-xl border border-border/70 bg-card/40 px-4 py-3"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {invoice.label}
                </p>
                <p className="text-xs text-muted-foreground">{invoice.status}</p>
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
