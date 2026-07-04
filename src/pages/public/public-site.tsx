import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Contact,
  Gauge,
  GitBranch,
  Handshake,
  Layers3,
  LineChart,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Network,
  ShieldAlert,
  UserRoundCheck,
  UsersRound,
  Workflow,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { usePublicMeta } from "./public-meta";
import "../../styles/public-site.css";

type PublicLayoutProps = {
  children: ReactNode;
};

type Module = {
  title: string;
  description: string;
  icon: ReactNode;
};

type DemoFormState = {
  name: string;
  email: string;
  businessType: string;
  clientCount: string;
  message: string;
};

const navItems = [
  { label: "Product", to: "/product" },
  { label: "Pricing", to: "/pricing" },
  { label: "Demo", to: "/demo" },
];

const modules: Module[] = [
  {
    title: "Leads",
    description:
      "Track inbound interest, source, package fit, and next follow-up before prospects disappear into messages.",
    icon: <Handshake />,
  },
  {
    title: "Clients",
    description:
      "Keep training, notes, nutrition, messages, and progress attached to one client record.",
    icon: <UsersRound />,
  },
  {
    title: "Workspaces",
    description:
      "Separate teams, brands, or coaching operations while keeping the owner view organized.",
    icon: <Layers3 />,
  },
  {
    title: "Check-ins",
    description:
      "Review client status, adherence, blockers, and risk signals without rebuilding a tracker.",
    icon: <ClipboardCheck />,
  },
  {
    title: "Billing",
    description:
      "Connect package context and payment readiness to the coaching relationship.",
    icon: <CircleDollarSign />,
  },
  {
    title: "Analytics",
    description:
      "See pipeline, client health, workload, and delivery patterns without exporting spreadsheets.",
    icon: <BarChart3 />,
  },
  {
    title: "Public Profile",
    description:
      "Publish coach proof, offer structure, and a focused application path for qualified clients.",
    icon: <Contact />,
  },
  {
    title: "Automations",
    description:
      "Surface overdue actions, missed check-ins, and operational risk before clients drift.",
    icon: <Bot />,
  },
];

const productFeatures: Module[] = [
  {
    title: "PT Hub",
    description:
      "The owner-level operating view for profile, packages, leads, clients, analytics, payments, and settings.",
    icon: <Gauge />,
  },
  {
    title: "Workspaces",
    description:
      "Focused delivery environments for coaches and teams managing real client work.",
    icon: <Network />,
  },
  ...modules.filter((module) => module.title !== "Workspaces"),
  {
    title: "Integrations",
    description:
      "Designed for billing, notifications, wearables, and future connected coaching systems.",
    icon: <GitBranch />,
  },
];

function BrandMark() {
  return (
    <Link className="public-brand" to="/" aria-label="RepSync home">
      <span className="public-brand-mark" aria-hidden="true">
        <Activity className="h-5 w-5" />
      </span>
      <span>RepSync</span>
    </Link>
  );
}

export function PublicSiteLayout({ children }: PublicLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(
      ".public-site .hero-copy, .public-site .product-mockup, .public-site .section-band, .public-site .signal-strip",
    );

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    elements.forEach((element) => {
      element.classList.add("reveal-up");
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="public-site">
      <div className="public-shell">
        <header className="public-header">
          <div className="public-header-inner">
            <BrandMark />
            <button
              className="public-menu-button"
              type="button"
              aria-controls="public-site-menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="menu-line" />
              <span className="menu-line" />
              <span className="sr-only">Toggle navigation</span>
            </button>
            <nav
              className={`public-nav${menuOpen ? " open" : ""}`}
              id="public-site-menu"
              aria-label="Public navigation"
            >
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
              <NavLink to="/privacy" onClick={() => setMenuOpen(false)}>
                Privacy
              </NavLink>
              <NavLink to="/terms" onClick={() => setMenuOpen(false)}>
                Terms
              </NavLink>
            </nav>
            <div className={`public-header-actions${menuOpen ? " open" : ""}`}>
              <Link className="site-link-button text" to="/login">
                Login
              </Link>
              <Link className="site-link-button" to="/signup">
                Start free
              </Link>
            </div>
          </div>
        </header>

        <main className="public-main">{children}</main>

        <footer className="public-footer">
          <div className="public-container footer-grid">
            <div>
              <BrandMark />
              <p className="site-copy mt-4">
                A public website and coaching operating system for personal
                trainers, teams, and clients.
              </p>
            </div>
            <nav className="footer-links" aria-label="Footer navigation">
              <Link to="/product">Product</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/demo">Book a demo</Link>
              <Link to="/login">Login</Link>
              <Link to="/signup">Signup</Link>
              <Link to="/forgot-password">Forgot password</Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SiteButtonLink({
  to,
  children,
  variant = "primary",
}: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      className={`site-link-button${variant === "secondary" ? " secondary" : ""}`}
      to={to}
    >
      <span>{children}</span>
      {variant === "primary" ? (
        <span className="button-orbit" aria-hidden="true">
          <ArrowRight className="h-4 w-4" />
        </span>
      ) : null}
    </Link>
  );
}

function ProductMockup() {
  return (
    <div className="product-mockup" aria-label="RepSync product snapshot">
      <div className="mockup-top">
        <span>PT Hub command view</span>
        <div className="mockup-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="mockup-body">
        <div className="mockup-rail" aria-hidden="true">
          {["Leads", "Clients", "Check-ins", "Billing", "Analytics"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="mockup-main" aria-hidden="true">
          <div className="mockup-panel">
            <div>
              <strong>14</strong>
              <span>open client actions</span>
            </div>
            <div>
              <strong>6</strong>
              <span>leads need follow-up</span>
            </div>
          </div>
          <div className="mockup-split">
            <div className="mockup-feed">
              <strong>Delivery queue</strong>
              <span>Check-in review due</span>
              <span>Nutrition note updated</span>
              <span>Program block ready</span>
            </div>
            <div className="mockup-risk">
              <strong>Risk signals</strong>
              <span>Missed check-in</span>
              <span>Inactive lead</span>
              <span>Roster load high</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ module }: { module: Module }) {
  return (
    <article className="module-card bezel-shell">
      <div className="bezel-core">
        <span className="module-icon" aria-hidden="true">
          {module.icon}
        </span>
        <h3>{module.title}</h3>
        <p>{module.description}</p>
      </div>
    </article>
  );
}

function CTASection({
  title = "Run the business from one clean operating system.",
  copy = "Start with the public profile, then connect leads, client delivery, check-ins, billing, analytics, and team operations as your coaching business grows.",
}: {
  title?: string;
  copy?: string;
}) {
  return (
    <section className="section-band tight">
      <div className="public-container cta-panel bezel-shell">
        <div className="bezel-core cta-core">
          <div className="section-head mb-0">
            <p className="site-kicker">Ready when you are</p>
            <h2 className="site-h2">{title}</h2>
            <p className="site-copy">{copy}</p>
          </div>
          <div className="section-actions">
            <SiteButtonLink to="/signup">Start free</SiteButtonLink>
            <SiteButtonLink to="/demo" variant="secondary">
              Book a demo
            </SiteButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function TransformationPanel() {
  return (
    <section className="section-band">
      <div className="public-container transformation-grid">
        <div className="section-head">
          <p className="site-kicker">Before and after</p>
          <h2 className="site-h2">The business stops feeling scattered.</h2>
          <p className="site-copy">
            RepSync turns disconnected lead capture, client delivery, check-ins,
            and billing context into one visible operating rhythm.
          </p>
        </div>
        <div className="transformation-board">
          <article className="transform-card before">
            <span>Before RepSync</span>
            <h3>DMs, files, payment notes, and check-ins drift apart.</h3>
            <div className="chaos-stack" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </article>
          <article className="transform-card after">
            <span>After RepSync</span>
            <h3>Every client and lead has one clear operating context.</h3>
            <div className="signal-map" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function MarketingHomePage() {
  usePublicMeta(
    "RepSync | Coaching business operating system",
    "Run leads, clients, check-ins, workspaces, billing, analytics, and client delivery from one clean RepSync operating system.",
  );

  return (
    <PublicSiteLayout>
      <section className="hero-section">
        <div className="public-container hero-grid">
          <div className="hero-copy">
            <p className="site-kicker">Coach marketplace and delivery system</p>
            <h1 className="site-h1">
              Run your coaching business from one clean{" "}
              <span className="headline-chip" aria-hidden="true">
                <img
                  src="/assets/feature-client-home.png?v=20260512-fresh"
                  alt=""
                />
              </span>{" "}
              operating system.
            </h1>
            <p className="site-copy">
              RepSync helps personal trainers manage leads, clients, check-ins,
              workspaces, billing, and client delivery without stitching
              together disconnected tools.
            </p>
            <div className="hero-actions">
              <SiteButtonLink to="/signup">Start free</SiteButtonLink>
              <SiteButtonLink to="/demo" variant="secondary">
                Book a demo
              </SiteButtonLink>
            </div>
            <div className="hero-proof" aria-label="RepSync operating coverage">
              <div>
                <strong>8</strong>
                <span>Core modules connected</span>
              </div>
              <div>
                <strong>1</strong>
                <span>Coach operating view</span>
              </div>
              <div>
                <strong>0</strong>
                <span>Spreadsheet handoffs required</span>
              </div>
            </div>
          </div>
          <ProductMockup />
        </div>
        <div className="public-container signal-strip" aria-label="RepSync value signals">
          {[
            "Public profile",
            "Lead capture",
            "Client delivery",
            "Check-in review",
            "Billing context",
            "Risk visibility",
          ].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="section-band tight">
        <div className="public-container problem-panel bezel-shell">
          <div className="bezel-core problem-core">
            <div>
            <p className="site-kicker">The problem</p>
            <h2 className="site-h2">Coaching work breaks when the business is split.</h2>
            </div>
            <div className="problem-list">
              <div>Leads live in DMs while client records live somewhere else.</div>
              <div>Check-ins, billing context, and progress signals lose their relationship.</div>
              <div>Teams cannot see which client needs attention until the client is already drifting.</div>
            </div>
          </div>
        </div>
      </section>

      <TransformationPanel />

      <section className="section-band">
        <div className="public-container">
          <div className="section-head split">
            <div>
              <p className="site-kicker">Product snapshot</p>
              <h2 className="site-h2">A calmer command center for coaching work.</h2>
            </div>
            <p className="site-copy">
              PT Hub gives owners the business overview. Workspaces give coaches
              and teams the focused delivery layer. Clients get a daily
              experience that explains what matters now.
            </p>
          </div>
          <div className="snapshot-panel bezel-shell">
            <div className="bezel-core">
              <img
                src="/assets/feature-coach-dashboard.png?v=20260512-fresh"
                alt="RepSync coach dashboard showing client activity, adherence, messages, review queue, and next actions."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="public-container">
          <div className="section-head split">
            <div>
              <p className="site-kicker">Core modules</p>
              <h2 className="site-h2">Everything tied to the client relationship.</h2>
            </div>
            <p className="site-copy">
              RepSync is organized around the actual flow of coaching: attract,
              qualify, onboard, deliver, review, bill, and retain.
            </p>
          </div>
          <div className="module-grid">
            {modules.map((module) => (
              <ModuleCard key={module.title} module={module} />
            ))}
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="public-container">
          <div className="section-head">
            <p className="site-kicker">How it works</p>
            <h2 className="site-h2">From public trust to delivered work.</h2>
          </div>
          <div className="steps-grid">
            {[
              ["01", "Publish the coach surface", "Show positioning, proof, packages, and a clear application path."],
              ["02", "Qualify and organize demand", "Route leads by source, intent, package, status, and follow-up."],
              ["03", "Deliver inside workspaces", "Manage clients, programs, check-ins, messages, billing, and risk in context."],
            ].map(([number, title, copy]) => (
              <article className="step-card" key={number}>
                <span className="step-number">{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="public-container comparison-grid">
          <article>
            <p className="site-kicker">PT Hub</p>
            <h2 className="site-h3">The business layer.</h2>
            <ul>
              <li>Public profile, packages, and intake.</li>
              <li>Leads, payments, analytics, and settings.</li>
              <li>Workspace ownership and team visibility.</li>
            </ul>
          </article>
          <article>
            <p className="site-kicker">Workspace</p>
            <h2 className="site-h3">The delivery layer.</h2>
            <ul>
              <li>Client records, training, nutrition, and messages.</li>
              <li>Check-ins, progress, adherence, and next actions.</li>
              <li>Shared coaching context for teams.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="section-band">
        <div className="public-container feature-stack">
          <div className="feature-row">
            <p className="site-kicker">Client experience</p>
            <div>
              <h3>A focused daily view, not another admin system.</h3>
              <p>
                Clients can see workouts, nutrition, habits, messages,
                check-ins, and progress without learning how the business
                operates behind the scenes.
              </p>
            </div>
          </div>
          <div className="feature-row">
            <p className="site-kicker">Automation and risk</p>
            <div>
              <h3>Know what needs attention before the relationship weakens.</h3>
              <p>
                RepSync is built around visibility: missed check-ins,
                overloaded rosters, inactive clients, and follow-up gaps should
                surface before they become churn.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CTASection />
    </PublicSiteLayout>
  );
}

export function ProductPage() {
  usePublicMeta(
    "Product | RepSync",
    "Explore RepSync PT Hub, workspaces, leads, clients, check-ins, billing, analytics, public profiles, automations, and integrations.",
  );

  return (
    <PublicSiteLayout>
      <section className="section-band">
        <div className="public-container">
          <div className="section-head split">
            <div>
              <p className="site-kicker">Product</p>
              <h1 className="site-h1">The public profile and the operating system behind it.</h1>
            </div>
            <p className="site-copy">
              RepSync connects the public path into coaching with the internal
              delivery system that keeps leads, clients, teams, billing, and
              progress visible.
            </p>
          </div>
          <div className="module-grid">
            {productFeatures.map((module) => (
              <ModuleCard key={module.title} module={module} />
            ))}
          </div>
        </div>
      </section>

      <section className="section-band tight">
        <div className="public-container comparison-grid">
          <article>
            <p className="site-kicker">PT Hub</p>
            <h2 className="site-h3">Own the business system.</h2>
            <p className="site-copy">
              PT Hub is where the trainer or owner manages public presence,
              packages, leads, client intake, billing readiness, analytics, and
              workspace setup.
            </p>
          </article>
          <article>
            <p className="site-kicker">Workspace</p>
            <h2 className="site-h3">Run delivery without noise.</h2>
            <p className="site-copy">
              Workspaces hold the operational work: clients, programming,
              check-ins, notes, nutrition, messages, progress, and team
              accountability.
            </p>
          </article>
        </div>
      </section>

      <CTASection
        title="See how the business layer and delivery layer fit together."
        copy="Book a walkthrough and we will map RepSync to your current client journey, lead flow, and team structure."
      />
    </PublicSiteLayout>
  );
}

export function PricingPage() {
  usePublicMeta(
    "Pricing | RepSync",
    "RepSync pricing is in early-access mode. Compare starter, growth, and team paths without unconfirmed final prices.",
  );

  return (
    <PublicSiteLayout>
      <section className="section-band">
        <div className="public-container">
          <div className="section-head split">
            <div>
              <p className="site-kicker">Pricing</p>
              <h1 className="site-h1">Early-access pricing, shaped around your operation.</h1>
            </div>
            <p className="site-copy">
              Final public prices are not confirmed in the repo, so this page
              uses contact mode. Choose the path that best matches your current
              coaching business.
            </p>
          </div>
          <div className="pricing-grid">
            {[
              {
                name: "Profile",
                note: "Public launch",
                copy: "For coaches who need a public profile, packages, application flow, and clean first impression.",
                items: ["Public profile", "Package context", "Lead application", "Basic onboarding path"],
              },
              {
                name: "Coach OS",
                note: "Most requested",
                copy: "For coaches who need profile, leads, client records, delivery, check-ins, and progress visibility.",
                items: ["Everything in Profile", "Client workspace", "Check-ins and messaging", "Analytics visibility"],
                featured: true,
              },
              {
                name: "Studio",
                note: "Team setup",
                copy: "For teams that need shared client visibility, workspace ownership, role clarity, and operational support.",
                items: ["Team workspaces", "Shared client context", "Lead handoff", "Setup support"],
              },
            ].map((plan) => (
              <article
                className={`pricing-card${plan.featured ? " featured" : ""}`}
                key={plan.name}
              >
                <span className="pricing-note">{plan.note}</span>
                <h3>{plan.name}</h3>
                <p>{plan.copy}</p>
                <div className="price-label">Contact</div>
                <ul>
                  {plan.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="section-actions">
                  <SiteButtonLink to="/demo">Book a demo</SiteButtonLink>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicSiteLayout>
  );
}

function validateDemoForm(values: DemoFormState) {
  const errors: Partial<Record<keyof DemoFormState, string>> = {};
  if (!values.name.trim()) errors.name = "Enter your name.";
  if (!/\S+@\S+\.\S+/.test(values.email.trim())) {
    errors.email = "Enter a valid email.";
  }
  if (!values.businessType.trim()) {
    errors.businessType = "Tell us what type of coaching business you run.";
  }
  if (!values.clientCount.trim()) {
    errors.clientCount = "Add an approximate client count.";
  }
  if (values.message.trim().length < 12) {
    errors.message = "Add a little context so we can prepare.";
  }
  return errors;
}

export function DemoPage() {
  usePublicMeta(
    "Book a demo | RepSync",
    "Book a RepSync demo for your coaching business. Share your business type, client count, and operational needs.",
  );

  const [values, setValues] = useState<DemoFormState>({
    name: "",
    email: "",
    businessType: "",
    clientCount: "",
    message: "",
  });
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errors = useMemo(
    () => (touched ? validateDemoForm(values) : {}),
    [touched, values],
  );

  const updateField =
    (field: keyof DemoFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setSuccess(false);
      setSubmitError(null);
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    setSuccess(false);
    setSubmitError(null);

    const nextErrors = validateDemoForm(values);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      setSuccess(true);
      setValues({
        name: "",
        email: "",
        businessType: "",
        clientCount: "",
        message: "",
      });
      setTouched(false);
    } catch {
      setSubmitError("Unable to submit the demo request. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicSiteLayout>
      <section className="section-band">
        <div className="public-container demo-panel">
          <div className="section-head">
            <p className="site-kicker">Demo and contact</p>
            <h1 className="site-h1">Map RepSync to your coaching business.</h1>
            <p className="site-copy">
              Share a few details and we will prepare a walkthrough around your
              lead flow, client count, delivery model, and workspace needs.
            </p>
            <div className="problem-list">
              <div>Best for coaches moving past spreadsheets and scattered DMs.</div>
              <div>Useful for teams evaluating shared workspace visibility.</div>
              <div>No final pricing commitment is required to book a demo.</div>
            </div>
          </div>

          <form className="demo-form" onSubmit={handleSubmit} noValidate>
            <div className="field-grid">
              <div className="field-block">
                <Label htmlFor="demo-name">Name</Label>
                <Input
                  id="demo-name"
                  value={values.name}
                  onChange={updateField("name")}
                  isInvalid={Boolean(errors.name)}
                  autoComplete="name"
                />
                {errors.name ? <p className="field-error">{errors.name}</p> : null}
              </div>
              <div className="field-block">
                <Label htmlFor="demo-email">Email</Label>
                <Input
                  id="demo-email"
                  type="email"
                  value={values.email}
                  onChange={updateField("email")}
                  isInvalid={Boolean(errors.email)}
                  autoComplete="email"
                />
                {errors.email ? <p className="field-error">{errors.email}</p> : null}
              </div>
            </div>

            <div className="field-grid">
              <div className="field-block">
                <Label htmlFor="demo-business">Business type</Label>
                <Input
                  id="demo-business"
                  value={values.businessType}
                  onChange={updateField("businessType")}
                  isInvalid={Boolean(errors.businessType)}
                  placeholder="Online coach, studio, hybrid PT"
                />
                {errors.businessType ? (
                  <p className="field-error">{errors.businessType}</p>
                ) : null}
              </div>
              <div className="field-block">
                <Label htmlFor="demo-client-count">Number of clients</Label>
                <Input
                  id="demo-client-count"
                  value={values.clientCount}
                  onChange={updateField("clientCount")}
                  isInvalid={Boolean(errors.clientCount)}
                  placeholder="Example: 25 active clients"
                />
                {errors.clientCount ? (
                  <p className="field-error">{errors.clientCount}</p>
                ) : null}
              </div>
            </div>

            <div className="field-block">
              <Label htmlFor="demo-message">Message</Label>
              <Textarea
                id="demo-message"
                value={values.message}
                onChange={updateField("message")}
                isInvalid={Boolean(errors.message)}
                placeholder="Tell us what you want to clean up first: leads, check-ins, billing, teams, or client delivery."
                rows={6}
              />
              {errors.message ? (
                <p className="field-error">{errors.message}</p>
              ) : null}
            </div>

            {submitError ? <div className="form-error">{submitError}</div> : null}
            {success ? (
              <div className="form-success" role="status">
                Request received. We will follow up with demo next steps.
              </div>
            ) : null}

            <Button className="site-button" type="submit" disabled={loading}>
              <Mail className="h-4 w-4" />
              {loading ? "Sending request..." : "Request demo"}
            </Button>
          </form>
        </div>
      </section>
    </PublicSiteLayout>
  );
}

export function LegalPageLayout({
  eyebrow,
  title,
  description,
  updated,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updated?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PublicSiteLayout>
      <section className="legal-shell">
        <div className="public-container legal-panel">
          <div className="section-head split">
            <div>
              <p className="site-kicker">{eyebrow}</p>
              <h1 className="site-h1">{title}</h1>
            </div>
            <div>
              <p className="site-copy">{description}</p>
              {updated ? (
                <p className="site-copy mt-4">Last updated: {updated}</p>
              ) : null}
            </div>
          </div>
          {aside ? <aside className="legal-aside mb-6">{aside}</aside> : null}
          <div className="legal-grid">{children}</div>
        </div>
      </section>
    </PublicSiteLayout>
  );
}

export function LegalCard({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="legal-card">
      {icon ? (
        <span className="module-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h2>{title}</h2>
      {children}
    </article>
  );
}
