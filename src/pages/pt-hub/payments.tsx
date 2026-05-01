import {
  ArrowRight,
  CheckCircle2,
  Landmark,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui/coachos/empty-state";
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
  const billingConnected = subscription?.billingConnected === true;
  const revenueConnected = revenue?.revenueConnected === true;
  const hasLiveInvoices = invoices.some((invoice) => !invoice.placeholder);
  const planName = subscription?.planName ?? "Repsync Pro";
  const billingStatus = subscription?.billingStatus ?? "Manual billing";
  const monthlyRevenue = revenue?.monthlyRevenueLabel ?? "Not connected";

  return (
    <section className="pt-hub-page-stack">
      <PtHubPageHeader
        eyebrow="Payments"
        title="Billing and revenue"
        description="Review your Repsync plan, invoices, and revenue tracking."
      />

      <div className="surface-panel-strong pt-hub-surface-hero overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)]">
          <div className="space-y-5 p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45 text-billing">
                    {billingConnected ? (
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Landmark className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-billing">
                      Billing control
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                      {billingConnected
                        ? "Billing is connected"
                        : "Billing setup is still manual"}
                    </h2>
                  </div>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {billingConnected
                    ? "Plan, invoices, and revenue tracking are ready to support client billing decisions."
                    : "Keep this page focused on setup status until live billing and invoice sync are connected."}
                </p>
              </div>
              <Link
                to="/pt-hub/settings/billing"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/55 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-billing/55 hover:bg-background/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-billing/40"
              >
                Billing settings
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <PaymentFact
                icon={Wallet}
                label="Plan"
                value={planName}
                helper={
                  billingConnected ? "Live subscription" : "Read-only plan"
                }
              />
              <PaymentFact
                icon={Landmark}
                label="Status"
                value={billingStatus}
                helper={billingConnected ? "Connected" : "Manual setup"}
              />
              <PaymentFact
                icon={ReceiptText}
                label="Invoices"
                value={hasLiveInvoices ? String(invoices.length) : "Not live"}
                helper={
                  hasLiveInvoices ? "History connected" : "Placeholder only"
                }
              />
            </div>
          </div>

          <div className="border-t border-border/60 bg-background/24 p-6 sm:p-7 lg:border-l lg:border-t-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Revenue signal
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
              {monthlyRevenue}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {revenueConnected
                ? "Revenue tracking is live for active client billing."
                : "Revenue is intentionally shown as not connected until checkout and payment sync are live."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant={billingConnected ? "success" : "warning"}>
                {billingConnected ? "Billing live" : "Manual billing"}
              </Badge>
              <Badge variant={revenueConnected ? "success" : "muted"}>
                {revenueConnected ? "Revenue live" : "Revenue pending"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-hub-work-grid xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <div className="pt-hub-page-stack">
          <PtHubSectionCard
            title="Billing Overview"
            description="The key billing details for this account."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <PaymentDetail label="Current plan" value={planName} />
              <PaymentDetail label="Billing status" value={billingStatus} />
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
            <div className="mt-5 rounded-[22px] border border-border/60 bg-background/28 px-4 py-4 text-sm leading-6 text-muted-foreground">
              {billingConnected
                ? "Your Repsync subscription is connected and ready for live billing workflows."
                : "Your Repsync subscription is visible here, but billing sync and client billing are not fully live yet."}
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Invoices"
            description="Your invoice history appears here when billing is connected."
          >
            {hasLiveInvoices ? (
              <div className="space-y-3">
                {invoices
                  .filter((invoice) => !invoice.placeholder)
                  .map((invoice) => (
                    <div
                      key={invoice.id}
                      className="pt-hub-inline-row flex flex-wrap items-center justify-between gap-3 px-4 py-3"
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
                title="No live invoices yet"
                description="Invoice history will stay quiet until billing sync is connected."
              />
            )}
          </PtHubSectionCard>
        </div>

        <PtHubSectionCard
          title="Revenue Outlook"
          description="Current revenue placeholders and future billing notes."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <PaymentDetail label="Monthly revenue" value={monthlyRevenue} />
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

function PaymentFact({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[22px] border border-border/60 bg-background/36 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <Icon className="h-4 w-4 text-billing" aria-hidden="true" />
      </div>
      <p className="mt-3 text-base font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
