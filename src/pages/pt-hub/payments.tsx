import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Landmark,
  ReceiptText,
  Settings,
  TrendingUp,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Skeleton } from "../../components/ui/skeleton";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import { usePtHubPayments } from "../../features/pt-hub/lib/pt-hub";
import { getSemanticBadgeVariant } from "../../lib/semantic-status";

export function PtHubPaymentsPage() {
  const paymentsQuery = usePtHubPayments();

  if (paymentsQuery.isLoading) {
    return <PtHubPaymentsLoadingState />;
  }

  const subscription = paymentsQuery.data?.subscription;
  const invoices = paymentsQuery.data?.invoices ?? [];
  const revenue = paymentsQuery.data?.revenue;
  const billingConnected = subscription?.billingConnected === true;
  const revenueConnected = revenue?.revenueConnected === true;
  const hasLiveInvoices = invoices.some((invoice) => !invoice.placeholder);
  const liveInvoices = invoices.filter((invoice) => !invoice.placeholder);
  const planName = subscription?.planName ?? "Repsync Pro";
  const billingStatus = subscription?.billingStatus ?? "Manual billing";
  const monthlyRevenue = revenue?.monthlyRevenueLabel ?? "Not connected";
  const activePayingClients =
    revenue?.activePayingClientsLabel ?? "Not connected";
  const potentialActiveClients = revenue?.potentialActiveClients ?? 0;
  const readinessScore =
    Number(billingConnected) +
    Number(revenueConnected) +
    Number(hasLiveInvoices);
  const readinessLabel = `${readinessScore}/3`;
  const readinessCopy =
    readinessScore === 3
      ? "Billing, revenue, and invoices are live."
      : "Finish the missing billing connections before this becomes a live cashflow view.";

  const paymentMetrics = [
    {
      label: "Billing readiness",
      value: readinessLabel,
      helper: readinessCopy,
      icon: billingConnected ? CheckCircle2 : AlertTriangle,
      accent: !billingConnected,
      delta: {
        value: billingConnected ? "Live" : "Setup",
        tone: billingConnected ? "positive" : "warning",
      },
    },
    {
      label: "Monthly revenue",
      value: monthlyRevenue,
      helper: revenueConnected
        ? "Synced from billing"
        : "Awaiting payment sync",
      icon: TrendingUp,
      accent: false,
      delta: {
        value: revenueConnected ? "Live" : "Pending",
        tone: revenueConnected ? "positive" : "neutral",
      },
    },
    {
      label: "Paying clients",
      value: activePayingClients,
      helper: `${potentialActiveClients} active client${potentialActiveClients === 1 ? "" : "s"} can become billable`,
      icon: UsersRound,
      accent: false,
      delta: {
        value: revenueConnected ? "Synced" : "Estimate",
        tone: revenueConnected ? "positive" : "neutral",
      },
    },
    {
      label: "Invoices",
      value: hasLiveInvoices ? liveInvoices.length : "0",
      helper: hasLiveInvoices ? "Live invoice history" : "No live invoices yet",
      icon: ReceiptText,
      accent: false,
      delta: {
        value: hasLiveInvoices ? "Ready" : "Quiet",
        tone: hasLiveInvoices ? "positive" : "neutral",
      },
    },
  ] as const;

  const setupSteps = [
    {
      label: "Subscription plan",
      value: planName,
      complete: Boolean(subscription?.planName),
      icon: Wallet,
    },
    {
      label: "Billing connection",
      value: billingConnected ? "Connected" : billingStatus,
      complete: billingConnected,
      icon: Landmark,
    },
    {
      label: "Revenue sync",
      value: revenueConnected ? "Connected" : "Not connected",
      complete: revenueConnected,
      icon: TrendingUp,
    },
    {
      label: "Invoice feed",
      value: hasLiveInvoices ? `${liveInvoices.length} invoices` : "Not live",
      complete: hasLiveInvoices,
      icon: ReceiptText,
    },
  ] as const;

  return (
    <section className="pt-hub-page-stack">
      <PtHubPageHeader
        eyebrow="Payments"
        title="Billing and revenue"
        description="Track billing readiness, client revenue potential, and invoice history."
      />

      <div
        className="page-kpi-block pt-hub-kpi-grid"
        data-columns="4"
        aria-label="Payments summary"
      >
        {paymentMetrics.map((metric) => (
          <StatCard
            key={metric.label}
            surface="pt-hub"
            module="billing"
            label={metric.label}
            value={metric.value}
            helper={metric.helper}
            icon={metric.icon}
            accent={metric.accent}
            delta={metric.delta}
          />
        ))}
      </div>

      {paymentsQuery.isError ? (
        <PtHubSectionCard
          title="Billing data unavailable"
          description="The page is showing fallback values until billing data can be loaded."
          module="billing"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Retry from billing settings or refresh the page if this persists.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/pt-hub/settings/billing">Open billing settings</Link>
            </Button>
          </div>
        </PtHubSectionCard>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.42fr)]">
        <PtHubSectionCard
          title="Billing Command Center"
          description="A practical read on what is billable now and what still needs setup."
          module="billing"
          actions={
            <Button asChild variant="secondary" size="sm">
              <Link to="/pt-hub/settings/billing">
                Billing settings
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          }
          contentClassName="space-y-5"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(18rem,0.5fr)]">
            <div className="rounded-[24px] border border-border/60 bg-background/34 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {billingConnected
                      ? "Billing is connected"
                      : "Billing is still manual"}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {billingConnected
                      ? "Invoices and subscription status can support live payment decisions."
                      : "Use this as a readiness view until checkout, subscription management, and invoice sync are connected."}
                  </p>
                </div>
                <Badge variant={billingConnected ? "success" : "warning"}>
                  {billingConnected ? "Live billing" : "Setup required"}
                </Badge>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <PaymentSignal
                  icon={CreditCard}
                  label="Payment method"
                  value={
                    subscription?.paymentMethodLabel ??
                    "No payment method connected"
                  }
                />
                <PaymentSignal
                  icon={CalendarClock}
                  label="Renewal date"
                  value={subscription?.renewalDate ?? "Not connected yet"}
                />
                <PaymentSignal
                  icon={TrendingUp}
                  label="Trailing revenue"
                  value={revenue?.trailingRevenueLabel ?? "Not connected"}
                />
                <PaymentSignal
                  icon={Wallet}
                  label="Package pricing"
                  value={
                    subscription?.packagePricingLabel ||
                    revenue?.packagePricingLabel ||
                    "Add package pricing once billing is integrated"
                  }
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-border/60 bg-background/24 p-5">
              <p className="text-sm font-semibold text-foreground">
                Revenue potential
              </p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground tabular-nums">
                {potentialActiveClients}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Active client{potentialActiveClients === 1 ? "" : "s"} that can
                become paying clients once payment collection is live.
              </p>
              <div className="mt-5 rounded-2xl border border-border/50 bg-background/38 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Next meaningful upgrade
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  Show expected monthly revenue from active packages when
                  pricing is connected.
                </p>
              </div>
            </div>
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Setup Rail"
          description="What must be connected before the page becomes live."
          module="billing"
          contentClassName="space-y-3"
        >
          {setupSteps.map((step) => (
            <PaymentSetupStep key={step.label} {...step} />
          ))}
          <Button asChild className="mt-2 w-full" variant="default">
            <Link to="/pt-hub/settings/billing">
              Configure billing
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </PtHubSectionCard>
      </div>

      <PtHubSectionCard
        title="Invoice Ledger"
        description="A durable record of invoices once billing history is available."
        module="billing"
      >
        {hasLiveInvoices ? (
          <div className="overflow-hidden rounded-[22px] border border-border/60">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,0.34fr)_minmax(8rem,0.28fr)] gap-3 border-b border-border/55 bg-background/28 px-4 py-3 text-xs font-semibold text-muted-foreground">
              <span>Invoice</span>
              <span>Issued</span>
              <span className="text-right">Amount / Status</span>
            </div>
            {liveInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,0.34fr)_minmax(8rem,0.28fr)] items-center gap-3 border-b border-border/45 px-4 py-3 transition-colors last:border-b-0 hover:bg-background/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {invoice.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {invoice.downloadUrl
                      ? "Download available"
                      : "No download attached"}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {invoice.issuedAt ?? "No issue date"}
                </p>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">
                    {invoice.amountLabel}
                  </p>
                  <Badge
                    variant={getSemanticBadgeVariant(invoice.status)}
                    className="mt-1 text-[10px]"
                  >
                    {invoice.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No live invoices yet"
            description="Invoice history will stay quiet until billing sync is connected. Keep the setup rail current so this ledger has a clear path to become useful."
            actionLabel="Open billing settings"
            onAction={() => {
              window.location.href = "/pt-hub/settings/billing";
            }}
          />
        )}
      </PtHubSectionCard>
    </section>
  );
}

function PtHubPaymentsLoadingState() {
  return (
    <section className="pt-hub-page-stack">
      <PtHubPageHeader
        eyebrow="Payments"
        title="Billing and revenue"
        description="Loading billing readiness, revenue, and invoice history."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[152px] rounded-[26px]" />
        ))}
      </div>
      <Skeleton className="h-[340px] rounded-[28px]" />
    </section>
  );
}

function PaymentSignal({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/55 bg-background/36 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-billing" aria-hidden="true" />
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function PaymentSetupStep({
  icon: Icon,
  label,
  value,
  complete,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  complete: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/55 bg-background/32 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/55 bg-background/45 text-billing">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <Badge
            variant={complete ? "success" : "muted"}
            className="shrink-0 text-[10px]"
          >
            {complete ? "Ready" : "Pending"}
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}
