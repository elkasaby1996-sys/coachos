import type { ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CircleDollarSign,
  CreditCard,
  Download,
  Landmark,
  ReceiptText,
  RefreshCw,
  Settings2,
  TrendingUp,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { usePtHubPayments } from "../../features/pt-hub/lib/pt-hub";
import { getSemanticBadgeVariant } from "../../lib/semantic-status";
import "../../styles/pt-hub-analytics.css";
import "../../styles/pt-hub-payments.css";

function PaymentPanel({
  title,
  description,
  children,
  action,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`analytics-panel ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ReceiptIllustration() {
  return (
    <svg
      className="payments-receipt-art"
      viewBox="0 0 168 156"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="84" cy="78" r="66" fill="currentColor" opacity=".05" />
      <circle
        cx="84"
        cy="78"
        r="53"
        stroke="currentColor"
        opacity=".16"
        strokeDasharray="3 6"
      />
      <path
        d="M61 21h64v109l-8-5-8 5-8-5-8 5-8-5-8 5-8-5-8 5V21Z"
        fill="var(--analytics-panel)"
        stroke="currentColor"
        opacity=".4"
      />
      <path
        d="M43 32h64v111l-8-5-8 5-8-5-8 5-8-5-8 5-8-5-8 5V32Z"
        fill="var(--analytics-panel)"
        stroke="currentColor"
      />
      <rect
        x="54"
        y="45"
        width="18"
        height="18"
        rx="5"
        fill="currentColor"
        opacity=".12"
      />
      <path
        d="M59 54h8m-4-4v8M55 79h40M55 89h25M55 112h15m14 0h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M53 101h44"
        stroke="currentColor"
        opacity=".25"
        strokeDasharray="3 3"
      />
      <circle
        cx="119"
        cy="112"
        r="19"
        fill="var(--analytics-panel)"
        stroke="currentColor"
      />
      <path
        d="M119 104v16m-4-12h6a3 3 0 0 1 0 6h-4a3 3 0 0 1 0-6m0 9h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PtHubPaymentsPage() {
  const paymentsQuery = usePtHubPayments();
  const subscription = paymentsQuery.data?.subscription;
  const revenue = paymentsQuery.data?.revenue;
  const invoices = (paymentsQuery.data?.invoices ?? []).filter(
    (invoice) => !invoice.placeholder,
  );
  const billingConnected = subscription?.billingConnected === true;
  const revenueConnected = revenue?.revenueConnected === true;
  const loading = paymentsQuery.isPending && !paymentsQuery.sourceError;
  const error = paymentsQuery.error || paymentsQuery.sourceError;
  const metrics = [
    {
      label: "Monthly revenue",
      value: revenueConnected ? (revenue?.monthlyRevenueLabel ?? "—") : "—",
      detail: revenueConnected
        ? "Reported by your payment provider"
        : "Available when revenue sync is connected",
      icon: TrendingUp,
    },
    {
      label: "Trailing revenue",
      value: revenueConnected ? (revenue?.trailingRevenueLabel ?? "—") : "—",
      detail: revenueConnected
        ? "Provider-reported reporting window"
        : "Historical revenue is not connected",
      icon: Wallet,
    },
    {
      label: "Paying clients",
      value: revenueConnected
        ? (revenue?.activePayingClientsLabel ?? "—")
        : "—",
      detail: revenueConnected
        ? "Clients with recorded billing activity"
        : "Payment records are not available yet",
      icon: UsersRound,
    },
    {
      label: "Invoices",
      value: invoices.length ? invoices.length : billingConnected ? 0 : "—",
      detail: invoices.length
        ? "Available in your invoice history"
        : billingConnected
          ? "No invoices recorded yet"
          : "Invoice history is not connected",
      icon: ReceiptText,
    },
  ];

  return (
    <main className="analytics-page payments-page">
      <header className="analytics-heading">
        <div>
          <p className="analytics-eyebrow">
            <CircleDollarSign size={14} /> YOUR BUSINESS, BALANCED
          </p>
          <h1>
            Payments<span>.</span>
          </h1>
          <p>Client revenue, your subscription, and every invoice.</p>
        </div>
        <Link to="/pt-hub/settings/billing" className="payments-settings-link">
          <Settings2 size={16} />
          Billing settings
          <ArrowUpRight size={15} />
        </Link>
      </header>
      {error ? (
        <section className="analytics-error" role="alert">
          <h2>Payment details couldn’t be loaded</h2>
          <p>Retry to load your subscription and payment information.</p>
          <Button
            variant="secondary"
            onClick={() => void paymentsQuery.retrySources()}
          >
            <RefreshCw size={16} />
            Retry
          </Button>
        </section>
      ) : loading ? (
        <div className="payments-loading" role="status">
          <span>Loading payment details…</span>
          <div className="payments-loading-metrics" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} />
            ))}
          </div>
          <div className="payments-loading-panel" aria-hidden="true" />
        </div>
      ) : (
        <>
          <div className="payments-overview-label">
            <span>FINANCIAL OVERVIEW</span>
            <span
              className={`payments-status ${revenueConnected ? "is-connected" : ""}`}
            >
              <i />
              {revenueConnected
                ? "Revenue connected"
                : "Payment data not connected"}
            </span>
          </div>
          <div className="analytics-metrics" aria-label="Payments summary">
            {metrics.map(({ label, value, detail, icon: Icon }) => (
              <div className="analytics-metric" key={label}>
                <div className="analytics-metric-label">
                  {label}
                  <Icon aria-hidden="true" />
                </div>
                <strong>{value}</strong>
                <p>{detail}</p>
              </div>
            ))}
          </div>
          <div className="payments-main-grid">
            <PaymentPanel
              title="Client revenue"
              description="A home for the money your coaching business earns."
              action={
                <span className="analytics-tag">
                  {revenueConnected ? "Connected" : "Not connected"}
                </span>
              }
            >
              <div className="payments-revenue-intro">
                <ReceiptIllustration />
                <div>
                  <p className="payments-kicker">
                    {revenueConnected ? "REVENUE REPORTING" : "CLIENT BILLING"}
                  </p>
                  <h3>
                    {revenueConnected
                      ? "Your revenue, in view."
                      : "Bring your payments into focus."}
                  </h3>
                  <p>
                    {revenueConnected
                      ? "Your payment provider supplies the revenue totals above. Invoice details appear below when available."
                      : "Client payment collection is not available yet. Revenue totals will appear here when payment collection and reporting are connected."}
                  </p>
                  <Link className="analytics-link" to="/pt-hub/packages">
                    View coaching packages <ArrowUpRight size={16} />
                  </Link>
                </div>
              </div>
              <div className="payments-connections">
                <div>
                  <span className="payments-connection-icon">
                    <Landmark size={17} />
                  </span>
                  <div>
                    <strong>Revenue sync</strong>
                    <p>
                      {revenueConnected
                        ? "Revenue records are connected"
                        : "Waiting for a payment data connection"}
                    </p>
                  </div>
                  <span
                    className={`payments-status ${revenueConnected ? "is-connected" : ""}`}
                  >
                    {revenueConnected ? <Check size={13} /> : <i />}
                    {revenueConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <div>
                  <span className="payments-connection-icon">
                    <ReceiptText size={17} />
                  </span>
                  <div>
                    <strong>Invoice history</strong>
                    <p>
                      {invoices.length
                        ? `${invoices.length} invoice${invoices.length === 1 ? "" : "s"} available`
                        : billingConnected
                          ? "Connected · no invoices recorded yet"
                          : "Available when billing history is connected"}
                    </p>
                  </div>
                  <span
                    className={`payments-status ${billingConnected || invoices.length ? "is-connected" : ""}`}
                  >
                    {billingConnected || invoices.length ? (
                      <Check size={13} />
                    ) : (
                      <i />
                    )}
                    {billingConnected || invoices.length
                      ? "Available"
                      : "Not connected"}
                  </span>
                </div>
              </div>
            </PaymentPanel>
            <PaymentPanel
              title="Your RepSync plan"
              description="Your subscription to the coaching platform."
              className="payments-subscription"
              action={<CreditCard size={20} className="analytics-panel-icon" />}
            >
              <div className="payments-plan">
                <span className="payments-kicker">CURRENT PLAN</span>
                <h3>{subscription?.planName || "No plan recorded"}</h3>
                <span
                  className={`payments-status ${billingConnected ? "is-connected" : ""}`}
                >
                  <i />
                  {billingConnected
                    ? "Billing connected"
                    : "Billing not connected"}
                </span>
              </div>
              <dl className="payments-plan-details">
                <div>
                  <dt>
                    <Wallet size={15} />
                    Plan status
                  </dt>
                  <dd>
                    {billingConnected
                      ? subscription?.billingStatus || "Not recorded"
                      : "Not connected"}
                  </dd>
                </div>
                <div>
                  <dt>
                    <CreditCard size={15} />
                    Payment method
                  </dt>
                  <dd>{subscription?.paymentMethodLabel || "Not connected"}</dd>
                </div>
                <div>
                  <dt>
                    <CalendarClock size={15} />
                    Renews on
                  </dt>
                  <dd>{subscription?.renewalDate || "Not available"}</dd>
                </div>
              </dl>
              <Link
                to="/pt-hub/settings/billing"
                className="payments-plan-link"
              >
                View subscription details <ArrowUpRight size={16} />
              </Link>
              <p className="payments-plan-note">
                {billingConnected
                  ? "Subscription billing is separate from the payments you collect from clients."
                  : "Self-service subscription management will be available when the billing portal is connected."}
              </p>
            </PaymentPanel>
          </div>
          <PaymentPanel
            title="Invoice history"
            description="Issued invoices, amounts, and payment status."
            action={
              <span className="analytics-tag">
                {invoices.length
                  ? `${invoices.length} records`
                  : billingConnected
                    ? "No invoices"
                    : "Not connected"}
              </span>
            }
          >
            {invoices.length ? (
              <div className="payments-invoice-scroll">
                <table className="payments-invoices">
                  <caption className="sr-only">Invoice history</caption>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Issued</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Download</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <th scope="row">{invoice.label}</th>
                        <td>{invoice.issuedAt || "Not recorded"}</td>
                        <td>{invoice.amountLabel}</td>
                        <td>
                          <Badge
                            variant={getSemanticBadgeVariant(invoice.status)}
                          >
                            {invoice.status}
                          </Badge>
                        </td>
                        <td>
                          {invoice.downloadUrl &&
                          /^https?:\/\//i.test(invoice.downloadUrl) ? (
                            <a
                              className="analytics-link"
                              href={invoice.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Download ${invoice.label}`}
                            >
                              <Download size={16} />
                            </a>
                          ) : (
                            <span className="payments-no-download">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="payments-invoice-empty">
                <span className="payments-empty-icon">
                  <ReceiptText size={24} strokeWidth={1.4} />
                </span>
                <div>
                  <h3>
                    {billingConnected
                      ? "Your invoice history starts here."
                      : "A clear record of every invoice."}
                  </h3>
                  <p>
                    {billingConnected
                      ? "There are no invoices to display yet. Issued invoices will appear here."
                      : "Invoice details and downloads will appear once billing history is connected."}
                  </p>
                </div>
              </div>
            )}
          </PaymentPanel>
          <details className="analytics-coverage">
            <summary>
              About payment data <span aria-hidden="true">+</span>
            </summary>
            <div>
              <p>
                Revenue and paying-client totals use payment records when
                connected. A dash means the data is unavailable. Active clients
                and listed package prices are not used to estimate collected
                revenue.
              </p>
              <p>
                Your RepSync subscription covers your use of the platform.
                Client revenue represents payments to your coaching business.
                They are reported separately.
              </p>
            </div>
          </details>
        </>
      )}
    </main>
  );
}
