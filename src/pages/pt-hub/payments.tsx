import { CreditCard, FileText, Landmark, Wallet } from "lucide-react";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Badge } from "../../components/ui/badge";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import { usePtHubPayments } from "../../features/pt-hub/lib/pt-hub";

export function PtHubPaymentsPage() {
  const paymentsQuery = usePtHubPayments();
  const subscription = paymentsQuery.data?.subscription;
  const invoices = paymentsQuery.data?.invoices ?? [];
  const revenue = paymentsQuery.data?.revenue;

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow="Payments"
        title="CoachOS billing and revenue structure"
        description="This page separates your platform subscription from your future trainer-business revenue tooling. Billing is intentionally honest about what is and is not connected yet."
      />

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label="Subscription Plan"
          value={subscription?.planName ?? "CoachOS Pro"}
          helper={
            subscription?.billingConnected
              ? "Live billing"
              : "Subscription placeholder"
          }
          icon={CreditCard}
          accent
        />
        <StatCard
          surface="pt-hub"
          label="Billing Status"
          value={subscription?.billingStatus ?? "Billing placeholder"}
          helper="Platform subscription state"
          icon={Landmark}
        />
        <StatCard
          surface="pt-hub"
          label="Monthly Revenue"
          value={revenue?.monthlyRevenueLabel ?? "Not connected"}
          helper="Trainer business revenue tracking"
          icon={Wallet}
        />
        <StatCard
          surface="pt-hub"
          label="Invoices"
          value={invoices.length}
          helper={
            invoices.some((invoice) => !invoice.placeholder)
              ? "Connected history"
              : "Placeholder history"
          }
          icon={FileText}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
        <div className="space-y-6">
          <PtHubSectionCard
            title="CoachOS subscription"
            description="Platform-level billing information for the trainer account."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <PaymentDetail
                label="Current plan"
                value={subscription?.planName ?? "CoachOS Pro"}
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
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Invoice history"
            description="Invoice records will populate here once subscription billing is integrated."
          >
            {invoices.some((invoice) => !invoice.placeholder) ? (
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/40 px-4 py-3"
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
                      <p className="text-xs text-muted-foreground">
                        {invoice.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Invoice history not connected yet"
                description="CoachOS subscription billing has not been wired to a live processor yet, so invoices are intentionally placeholder-only."
              />
            )}
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Trainer business revenue"
            description="A structure for future PT-side monetization tracking without pretending client billing is already integrated."
          >
            <div className="grid gap-4 md:grid-cols-2">
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
          </PtHubSectionCard>
        </div>

        <div className="space-y-6">
          <PtHubSectionCard
            title="Package pricing"
            description="A placeholder for future productized offers, packages, or service tiers."
          >
            <p className="text-sm text-muted-foreground">
              {subscription?.packagePricingLabel ||
                revenue?.packagePricingLabel ||
                "Package pricing will live here once client billing and checkout infrastructure are introduced."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="muted">Not yet connected</Badge>
              <Badge variant="secondary">Phase 3 structure</Badge>
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Billing clarity"
            description="What this page means today."
          >
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                CoachOS subscription information is structured here, but live
                billing events and invoice sync are not connected yet.
              </p>
              <p>
                Revenue widgets are deliberate placeholders so the PT Hub can
                grow into a trainer business platform without fabricating money
                data.
              </p>
            </div>
          </PtHubSectionCard>
        </div>
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
