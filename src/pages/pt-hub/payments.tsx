import { FileText, Landmark, ReceiptText, Wallet } from "lucide-react";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Badge } from "../../components/ui/badge";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import { usePtHubPayments } from "../../features/pt-hub/lib/pt-hub";
import { getSemanticBadgeVariant } from "../../lib/semantic-status";

export function PtHubPaymentsPage() {
  const paymentsQuery = usePtHubPayments();
  const subscription = paymentsQuery.data?.subscription;
  const invoices = paymentsQuery.data?.invoices ?? [];
  const revenue = paymentsQuery.data?.revenue;

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow="Payments"
        title="Billing and revenue"
        description="Review your Repsync plan, invoices, and revenue tracking."
      />

      <div className="page-kpi-block grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label="Platform Plan"
          value={subscription?.planName ?? "Repsync Pro"}
          helper={
            subscription?.billingConnected
              ? "Live billing"
              : "Billing not connected yet"
          }
          icon={Wallet}
          accent
        />
        <StatCard
          surface="pt-hub"
          label="Billing State"
          value={subscription?.billingStatus ?? "Billing placeholder"}
          helper="Status of your Repsync plan"
          icon={Landmark}
          delta={{
            value:
              subscription?.billingConnected === true
                ? "Connected"
                : "Manual",
            tone:
              subscription?.billingConnected === true ? "success" : "warning",
          }}
        />
        <StatCard
          surface="pt-hub"
          label="Monthly Revenue"
          value={revenue?.monthlyRevenueLabel ?? "Not connected"}
          helper="Revenue tracking for your coaching business"
          icon={Wallet}
          delta={{
            value:
              revenue?.revenueConnected === true ? "Live" : "Not connected",
            tone:
              revenue?.revenueConnected === true ? "success" : "warning",
          }}
        />
        <StatCard
          surface="pt-hub"
          label="Invoices"
          value={invoices.length}
          helper={
            invoices.some((invoice) => !invoice.placeholder)
              ? "Connected history"
              : "No live invoice history yet"
          }
          icon={ReceiptText}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
        <div className="space-y-6">
          <PtHubSectionCard
            title="Billing Overview"
            description="The key billing details for this account."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <PaymentDetail
                label="Current plan"
                value={subscription?.planName ?? "Repsync Pro"}
              />
              <PaymentDetail
                label="Billing status"
                value={subscription?.billingStatus ?? "Billing placeholder"}
              />
              <PaymentDetail
                label="Renewal date"
                value={subscription?.renewalDate ?? "Not connected yet"}
              />
              <PaymentDetail
                label="Payment method"
                value={
                  subscription?.paymentMethodLabel ??
                  "No payment method connected yet"
                }
              />
            </div>
            <div className="mt-5 rounded-[22px] border border-border/60 bg-background/28 px-4 py-4 text-sm text-muted-foreground">
              Your Repsync subscription is visible here, but billing sync and client billing are not fully live yet.
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Invoices"
            description="Your invoice history appears here when billing is connected."
          >
            {invoices.some((invoice) => !invoice.placeholder) ? (
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/34 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {invoice.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.issuedAt ?? "No issue date"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">
                        {invoice.amountLabel}
                      </p>
                      <div className="mt-1">
                        <Badge
                          variant={getSemanticBadgeVariant(invoice.status)}
                          className="text-[10px]"
                        >
                          {invoice.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Invoices are not connected yet"
                description="Billing is not fully connected yet, so invoice history is placeholder-only for now."
              />
            )}
          </PtHubSectionCard>
        </div>

        <PtHubSectionCard
          title="Revenue Outlook"
          description="Current revenue placeholders and future billing notes."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <PaymentDetail
              label="Monthly revenue"
              value={revenue?.monthlyRevenueLabel ?? "Not connected"}
            />
            <PaymentDetail
              label="Trailing revenue"
              value={revenue?.trailingRevenueLabel ?? "Not connected"}
            />
            <PaymentDetail
              label="Active paying clients"
              value={revenue?.activePayingClientsLabel ?? "Not connected"}
            />
            <PaymentDetail
              label="Potential active client base"
              value={String(revenue?.potentialActiveClients ?? 0)}
            />
          </div>
          <div className="mt-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              {subscription?.packagePricingLabel ||
                revenue?.packagePricingLabel ||
                "Offer pricing will appear here once client billing and checkout are introduced."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="warning">Not yet connected</Badge>
              <Badge variant="info">Future billing tools</Badge>
            </div>
          </div>
        </PtHubSectionCard>
      </div>
    </section>
  );
}

function PaymentDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
