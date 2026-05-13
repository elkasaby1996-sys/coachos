import { FormEvent, ReactNode, useEffect, useId, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  ClipboardCheck,
  CreditCard,
  FileText,
  Menu,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import "../../styles/marketing-home.css";

type SeoConfig = {
  title: string;
  description?: string;
};

const navLinks = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "Demo", href: "/demo" },
];

const footerProductLinks = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "Demo", href: "/demo" },
  { label: "Public profiles", href: "/product#public-profile" },
];

const footerCompanyLinks = [
  { label: "Support", href: "/support" },
  { label: "Login", href: "/login" },
  { label: "Start free", href: "/signup" },
];

const moduleCards = [
  {
    title: "Leads",
    icon: UserRound,
    description:
      "Capture inquiries, understand where prospects are coming from, and move them toward the next step.",
  },
  {
    title: "Clients",
    icon: UsersRound,
    description:
      "Manage client records, lifecycle, onboarding progress, notes, and coaching context.",
  },
  {
    title: "Workspaces",
    icon: BriefcaseBusiness,
    description:
      "Create structured coaching environments for delivery, branding, defaults, templates, and team workflows.",
  },
  {
    title: "Check-ins",
    icon: ClipboardCheck,
    description:
      "Run repeatable check-in cadences so clients stay accountable and coaches know what needs review.",
  },
  {
    title: "Billing",
    icon: CreditCard,
    description:
      "Track plans, payments, invoices, subscriptions, and revenue visibility.",
  },
  {
    title: "Analytics",
    icon: BarChart3,
    description:
      "Understand business performance, client adherence, delivery health, and operational trends.",
  },
  {
    title: "Public Profile",
    icon: FileText,
    description:
      "Turn your coaching presence into a client acquisition surface with profile content and lead capture.",
  },
  {
    title: "Automations",
    icon: BellRing,
    description:
      "Reduce manual follow-up with reminders, overdue nudges, onboarding prompts, and workspace rules.",
  },
];

const productSections = [
  {
    id: "pt-hub",
    eyebrow: "PT Hub",
    title: "Manage the business layer.",
    description:
      "Manage your business account, public profile, leads, notifications, billing, and global settings from one control layer.",
  },
  {
    id: "workspaces",
    eyebrow: "Workspaces",
    title: "Create focused delivery environments.",
    description:
      "Create coaching environments with their own client experience, branding, templates, defaults, automations, team access, and delivery settings.",
  },
  {
    id: "leads",
    eyebrow: "Lead management",
    title: "Keep prospect context organized.",
    description:
      "Capture new inquiries, keep prospect context organized, and move leads toward consultation, onboarding, or client conversion.",
  },
  {
    id: "clients",
    eyebrow: "Client management",
    title: "Keep the coaching record connected.",
    description:
      "Track client records, lifecycle, onboarding, coaching notes, check-ins, and risk signals without losing context.",
  },
  {
    id: "check-ins",
    eyebrow: "Check-ins and delivery",
    title: "Make accountability repeatable.",
    description:
      "Run repeatable check-in cadences, review client updates, spot missed submissions, and keep accountability consistent.",
  },
  {
    id: "public-profile",
    eyebrow: "Public profile",
    title: "Give prospects a clear path.",
    description:
      "Publish a trainer profile with headline, bio, specialties, media, CTA, and lead form so prospects have a clear path to inquire.",
  },
  {
    id: "billing",
    eyebrow: "Billing and revenue",
    title: "See payment context where it belongs.",
    description:
      "See subscription/payment context, invoices, revenue snapshots, and plan visibility where relevant.",
  },
  {
    id: "analytics",
    eyebrow: "Analytics and visibility",
    title: "Understand what needs attention.",
    description:
      "Understand delivery performance, client adherence, revenue, and operational health from one place.",
  },
  {
    id: "automations",
    eyebrow: "Automations",
    title: "Reduce manual follow-up.",
    description:
      "Create reminders, nudges, onboarding prompts, and workspace rules that reduce manual follow-up.",
  },
  {
    id: "integrations",
    eyebrow: "Integrations",
    title: "Prepare for connected operations.",
    description:
      "Prepare for calendar, email, meeting links, file storage, payment, and future wearable/health integrations where supported or configured.",
  },
];

const pricingFeatures = [
  "Lead capture",
  "Client management",
  "Workspaces",
  "Check-ins",
  "Public profile",
  "Billing visibility",
  "Analytics",
  "Automations",
  "Team workflows where configured",
  "Integrations where supported or planned",
];

const pricingFaq = [
  {
    question: "Is pricing final?",
    answer:
      "Pricing is being finalized for early access. Demo requests help match the setup to your business.",
  },
  {
    question: "Can solo trainers use RepSync?",
    answer:
      "Yes. RepSync is designed for solo personal trainers and can scale toward teams.",
  },
  {
    question: "Can I manage online and hybrid clients?",
    answer:
      "Yes. RepSync supports structured client delivery for online and hybrid coaching workflows.",
  },
  {
    question: "Does RepSync replace spreadsheets?",
    answer:
      "RepSync is built to reduce scattered workflows across spreadsheets, forms, DMs, and separate billing tools.",
  },
];

const problemItems = [
  {
    title: "Leads live in DMs.",
    detail: "A promising inquiry can disappear under client messages.",
  },
  {
    title: "Check-ins live in forms.",
    detail: "Submissions arrive, but review status and follow-up context split apart.",
  },
  {
    title: "Payments live elsewhere.",
    detail: "Revenue context is separate from the clients and packages it belongs to.",
  },
  {
    title: "Client notes get scattered.",
    detail: "Progress, preferences, and risk signals become harder to trust.",
  },
];

const businessTypeOptions = [
  "",
  "Solo personal trainer",
  "Online coach",
  "Hybrid coach",
  "Studio or coaching team",
  "Other coaching business",
];

const clientCountOptions = [
  "",
  "0-10 clients",
  "11-30 clients",
  "31-75 clients",
  "76+ clients",
];

const mainProblemOptions = [
  "",
  "Lead capture and follow-up",
  "Client onboarding",
  "Check-ins and accountability",
  "Workspace and team operations",
  "Billing visibility",
  "Analytics and risk signals",
];

function usePageMetadata({ title, description }: SeoConfig) {
  useEffect(() => {
    document.title = title;

    const ensureMeta = (selector: string, create: () => HTMLMetaElement) => {
      const existing = document.head.querySelector<HTMLMetaElement>(selector);
      if (existing) return existing;
      const tag = create();
      document.head.appendChild(tag);
      return tag;
    };

    if (description) {
      ensureMeta('meta[name="description"]', () => {
        const tag = document.createElement("meta");
        tag.name = "description";
        return tag;
      }).content = description;
    }

    ensureMeta('meta[property="og:title"]', () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:title");
      return tag;
    }).content = title;

    if (description) {
      ensureMeta('meta[property="og:description"]', () => {
        const tag = document.createElement("meta");
        tag.setAttribute("property", "og:description");
        return tag;
      }).content = description;
    }
  }, [description, title]);
}

function BrandMark() {
  return (
    <Link className="brand-mark" to="/" aria-label="RepSync home">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="img">
          <path d="M5.6 9.2h2.1v5.6H5.6zM16.3 9.2h2.1v5.6h-2.1zM2.8 10.7h2.1v2.6H2.8zM19.1 10.7h2.1v2.6h-2.1zM8.5 11h7v2h-7z" />
        </svg>
      </span>
      <span>RepSync</span>
    </Link>
  );
}

function PublicHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="site-nav" aria-label="Primary navigation">
      <BrandMark />

      <nav className="nav-links" aria-label="Site sections">
        {navLinks.map((link) => (
          <NavLink key={link.href} to={link.href}>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="nav-actions">
        <Link className="text-link" to="/login">
          Login
        </Link>
        <Link className="pill-button small" to="/signup">
          Start free
        </Link>
        <button
          className="mobile-menu-trigger"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="public-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      <div
        id="public-mobile-menu"
        className={`mobile-menu ${open ? "is-open" : ""}`}
      >
        <nav aria-label="Mobile site sections">
          {navLinks.map((link) => (
            <Link key={link.href} to={link.href} onClick={close}>
              {link.label}
            </Link>
          ))}
          <Link to="/login" onClick={close}>
            Login
          </Link>
        </nav>
        <Link className="pill-button" to="/signup" onClick={close}>
          Start free
        </Link>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <BrandMark />
        <p>
          Coaching business software for leads, clients, workspaces, check-ins,
          billing, analytics, and public profile presence.
        </p>
      </div>
      <div className="footer-link-groups">
        <FooterLinks title="Product" links={footerProductLinks} />
        <FooterLinks title="Company" links={footerCompanyLinks} />
        <FooterLinks
          title="Legal"
          links={[
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
          ]}
        />
      </div>
      <p className="footer-copyright">
        © {new Date().getFullYear()} RepSync. All rights reserved.
      </p>
    </footer>
  );
}

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <nav aria-label={title}>
      <span>{title}</span>
      {links.map((link) => (
        <Link key={link.href} to={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function PublicSiteLayout({
  children,
  seo,
}: {
  children: ReactNode;
  seo: SeoConfig;
}) {
  usePageMetadata(seo);

  return (
    <div className="marketing-home-page">
      <div className="site-shell">
        <PublicHeader />
        <main>{children}</main>
        <PublicFooter />
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="section-intro">
      <p className="kicker">{eyebrow}</p>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

function ProductPreviewMockup() {
  const stats = [
    ["Leads this week", "18"],
    ["Active clients", "42"],
    ["Missed check-ins", "5"],
    ["Revenue snapshot", "Visible"],
  ];

  return (
    <div className="product-frame product-preview-mockup">
      <div className="frame-top">
        <span />
        <span />
        <span />
      </div>
      <div className="mockup-header">
        <div>
          <p className="mini-kicker">PT Hub</p>
          <strong>Today needs review</strong>
        </div>
        <span>Workspace activity</span>
      </div>
      <div className="mockup-grid" aria-label="RepSync product preview">
        {stats.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="mockup-columns">
        <article>
          <p className="mini-kicker">Client risk signals</p>
          <ul>
            <li>Low adherence trend</li>
            <li>No recent reply</li>
            <li>Manual risk flag</li>
          </ul>
        </article>
        <article>
          <p className="mini-kicker">Next actions</p>
          <ul>
            <li>Review check-ins</li>
            <li>Send overdue nudges</li>
            <li>Prepare weekly summary</li>
          </ul>
        </article>
      </div>
    </div>
  );
}

function CtaBand({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <section className="final-cta-section" aria-labelledby="site-cta-title">
      <p className="kicker">{eyebrow}</p>
      <h2 id="site-cta-title">{title}</h2>
      {description ? <p>{description}</p> : null}
      <div className="final-actions">
        <Link className="pill-button" to="/signup">
          Start free
        </Link>
        <Link className="pill-button secondary" to="/demo">
          Book a demo
        </Link>
      </div>
    </section>
  );
}

function ModuleCard({
  title,
  description,
  icon: Icon,
}: (typeof moduleCards)[number]) {
  return (
    <article>
      <span className="card-icon" aria-hidden="true">
        <Icon />
      </span>
      <p className="mini-kicker">{title}</p>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

function ProductScreenshotFeature({
  eyebrow,
  title,
  description,
  src,
  alt,
}: {
  eyebrow: string;
  title: string;
  description: string;
  src: string;
  alt: string;
}) {
  return (
    <figure className="screenshot-card product-proof-card">
      <img src={src} alt={alt} />
      <figcaption>
        <span>{title}</span>
        <small>{eyebrow}</small>
        {description}
      </figcaption>
    </figure>
  );
}

function ExpectationList() {
  return (
    <div className="expectation-list" aria-label="What happens after a demo request">
      <p className="mini-kicker">What happens next</p>
      <ol>
        <li>Share how you coach and what is scattered today.</li>
        <li>Review whether PT Hub, Workspaces, and public profiles fit.</li>
        <li>Leave with a clear early-access recommendation.</li>
      </ol>
    </div>
  );
}

export function MarketingHomePage() {
  return (
    <PublicSiteLayout
      seo={{
        title: "RepSync — Coaching business software for personal trainers",
        description:
          "Manage leads, clients, workspaces, check-ins, billing, and coaching delivery in one organized system.",
      }}
    >
      <section
        id="home"
        className="gateway-section hero-section"
        aria-labelledby="hero-title"
      >
        <div className="gateway-copy hero-copy">
          <p className="kicker">For personal trainers and online coaches</p>
          <h1 id="hero-title">
            Run your coaching business from one clean operating system.
          </h1>
          <p className="gateway-lede">
            RepSync helps you capture leads, manage clients, deliver check-ins,
            organize workspaces, track billing, and understand what needs
            attention without stitching together disconnected tools.
          </p>
          <div className="cta-actions left">
            <Link className="pill-button" to="/signup">
              Start free
            </Link>
            <Link className="pill-button secondary" to="/demo">
              Book a demo
            </Link>
          </div>
          <div className="trust-strip" aria-label="RepSync focus areas">
            <span>PT Hub</span>
            <span>Workspaces</span>
            <span>Public profiles</span>
          </div>
        </div>

        <div className="hero-showcase" aria-label="RepSync product preview">
          <ProductPreviewMockup />
        </div>
      </section>

      <section className="insight-section" aria-labelledby="problem-title">
        <div className="feature-layout problem-story">
          <div className="side-header">
            <p className="kicker">The operating gap</p>
            <h2 id="problem-title">
              Coaching gets messy when every workflow lives somewhere else.
            </h2>
            <p>
              The issue is not effort. It is context switching: prospects,
              delivery, billing, and client signals all asking for attention in
              different places.
            </p>
          </div>
          <div className="feature-copy">
            {problemItems.map((item, index) => (
              <div className="numbered-line" key={item.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="proof-strip flow-strip" aria-label="RepSync workflow">
        <div>
          <p className="kicker">Full coaching cycle</p>
          <h2>One system for the full coaching cycle.</h2>
          <p>
            RepSync connects the front-office and delivery sides of coaching:
            lead capture, client management, structured delivery, check-ins,
            billing, and operational visibility.
          </p>
        </div>
        <div className="lifecycle-flow">
          {[
            "Lead",
            "Onboarding",
            "Active client",
            "Check-ins",
            "Progress",
            "Billing",
            "Retention",
          ].map((stage) => (
            <span key={stage}>{stage}</span>
          ))}
        </div>
      </section>

      <section className="insight-section" aria-labelledby="modules-title">
        <SectionHeader
          eyebrow="Core modules"
          title="Everything your coaching operation needs in one place."
        />
        <div className="module-board">
          <article className="module-board-lead">
            <p className="mini-kicker">Operating system</p>
            <h3>From first inquiry to weekly delivery rhythm.</h3>
            <p>
              RepSync is organized around the real shape of a coaching business:
              acquisition in PT Hub, delivery in Workspaces, and attention
              signals across both.
            </p>
          </article>
          <div className="module-board-grid">
            {moduleCards.map((card) => (
              <ModuleCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      </section>

      <section className="use-case-section" aria-labelledby="how-title">
        <div>
          <p className="kicker">Workflow</p>
          <h2 id="how-title">How RepSync works</h2>
        </div>
        <div className="feature-tabs">
          {[
            [
              "Capture the lead",
              "Prospects come through your profile, website, demo flow, or manual entry.",
            ],
            [
              "Convert and onboard",
              "Move qualified leads into structured onboarding with clear next steps.",
            ],
            [
              "Deliver coaching",
              "Use workspaces, check-ins, templates, and client experience settings to run delivery.",
            ],
            [
              "Track what matters",
              "Monitor check-ins, risk signals, client progress, billing, and business performance.",
            ],
          ].map(([title, description], index) => (
            <article key={title}>
              <p className="mini-kicker">Step {index + 1}</p>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="comparison-section" aria-labelledby="architecture-title">
        <SectionHeader
          eyebrow="Product architecture"
          title="Separate your business control center from client delivery."
        />
        <div className="split-card-grid">
          <article className="price-card">
            <p className="mini-kicker">PT Hub</p>
            <h3>Business account layer</h3>
            <p>
              Your business account layer for profile, leads, notifications,
              billing, and global settings.
            </p>
            <ul>
              <li>Public profile</li>
              <li>Leads</li>
              <li>Account settings</li>
              <li>Notifications</li>
              <li>Billing</li>
              <li>Global integrations</li>
            </ul>
          </article>
          <article className="price-card">
            <p className="mini-kicker">Workspace</p>
            <h3>Client-delivery environment</h3>
            <p>
              Your client-delivery environment for coaching operations, brand
              experience, templates, and automations.
            </p>
            <ul>
              <li>Client experience</li>
              <li>Check-ins</li>
              <li>Brand settings</li>
              <li>Team permissions</li>
              <li>Defaults and templates</li>
              <li>Workspace automations</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="use-case-section" aria-labelledby="client-title">
        <div>
          <p className="kicker">Client experience</p>
          <h2 id="client-title">Give clients a clearer coaching experience.</h2>
          <p className="gateway-lede">
            RepSync is not only an admin tool. It helps trainers create a more
            consistent client journey.
          </p>
        </div>
        <div className="use-case-grid">
          {[
            "Onboarding flow",
            "Welcome message",
            "Training, nutrition, habits, check-ins",
            "Files/resources",
            "Messaging boundaries",
            "Client home priorities",
            "Branded workspace experience",
          ].map((item) => (
            <article key={item}>
              <p className="mini-kicker">Experience</p>
              <h3>{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="screenshot-section" aria-labelledby="proof-screens-title">
        <SectionHeader
          eyebrow="Product proof"
          title="Real surfaces, not imagined dashboard art."
          description="Existing RepSync screens show the public profile, coach operations, client management, and client home experience the website is describing."
        />
        <div className="screenshot-showcase compact-screens">
          <ProductScreenshotFeature
            eyebrow="Public profile"
            title="Convert prospects into leads"
            description="Trainer positioning, specialties, packages, and a lead path live on the public profile."
            src="/assets/feature-public-profile.png?v=20260512-fresh"
            alt="RepSync public trainer profile with profile content and lead capture."
          />
          <ProductScreenshotFeature
            eyebrow="Client management"
            title="Keep delivery context together"
            description="Client records, status, onboarding, and coaching context stay connected to the workspace."
            src="/assets/feature-client-management.png?v=20260512-fresh"
            alt="RepSync client management screen showing active coaching clients."
          />
        </div>
      </section>

      <section className="insight-section" aria-labelledby="visibility-title">
        <SectionHeader
          eyebrow="Automation and visibility"
          title="Know what needs attention before it becomes a problem."
        />
        <div className="insight-grid feature-card-grid">
          {[
            "Missed check-ins",
            "No recent reply",
            "Low adherence trend",
            "Inactivity signal",
            "Overdue nudges",
            "Onboarding reminders",
            "Manual risk flag",
            "Weekly summaries",
          ].map((item) => (
            <article key={item}>
              <p className="mini-kicker">Attention signal</p>
              <h3>{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="final-section" aria-labelledby="pricing-title">
        <div className="pricing-shell">
          <div className="pricing-header">
            <p className="kicker">Early access</p>
            <h2 id="pricing-title">
              Built for solo trainers and growing coaching teams.
            </h2>
            <p className="pricing-copy">
              Pricing is being finalized for early users. Join early access or
              book a demo to see whether RepSync fits your coaching setup.
            </p>
            <div className="final-actions">
              <Link className="pill-button" to="/demo">
                Book a demo
              </Link>
              <Link className="pill-button secondary" to="/signup">
                Start free
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="Clean operations"
        title="Build a cleaner coaching operation."
        description="Bring leads, clients, check-ins, workspaces, billing, and visibility into one organized system."
      />
    </PublicSiteLayout>
  );
}

export function ProductPage() {
  return (
    <PublicSiteLayout
      seo={{
        title: "Product — RepSync",
        description:
          "Explore RepSync’s tools for lead capture, client management, workspaces, check-ins, billing, analytics, and automations.",
      }}
    >
      <section className="gateway-section hero-section" aria-labelledby="product-title">
        <div className="gateway-copy hero-copy">
          <p className="kicker">Product overview</p>
          <h1 id="product-title">
            The operating layer for modern coaching businesses.
          </h1>
          <p className="gateway-lede">
            RepSync brings acquisition, client management, delivery, billing,
            and visibility into one connected workflow for personal trainers and
            online coaches.
          </p>
          <div className="cta-actions left">
            <Link className="pill-button" to="/signup">
              Start free
            </Link>
            <Link className="pill-button secondary" to="/demo">
              Book a demo
            </Link>
          </div>
        </div>
        <ProductPreviewMockup />
      </section>

      <section className="screenshot-section" aria-labelledby="product-screens-title">
        <SectionHeader
          eyebrow="What buyers can inspect"
          title="The product story is split across business control and client delivery."
          description="PT Hub is where the trainer manages the business layer. Workspaces are where the coaching experience, defaults, templates, and delivery rhythm become operational."
        />
        <div className="screenshot-showcase product-screens">
          <ProductScreenshotFeature
            eyebrow="Coach dashboard"
            title="Visibility for today's decisions"
            description="A coach can scan check-ins, client activity, messages, and operational attention signals."
            src="/assets/feature-coach-dashboard.png?v=20260512-fresh"
            alt="RepSync coach dashboard showing client activity, adherence, messages, and review queues."
          />
          <ProductScreenshotFeature
            eyebrow="Client portal"
            title="A clearer client home"
            description="Clients see the next workout, nutrition, habits, check-ins, messages, and reminders without admin clutter."
            src="/assets/feature-client-home.png?v=20260512-fresh"
            alt="RepSync client home screen showing training, nutrition, habits, reminders, and progress."
          />
        </div>
      </section>

      <section className="resources-section product-detail-section">
        <SectionHeader
          eyebrow="Product areas"
          title="A deeper look at the workflow."
          description="Each product area supports a specific part of the coaching operating model. Integrations are described as planned or supported where configured, not promised as universally live."
        />
        <div className="feature-tabs">
          {productSections.map((section) => (
            <article key={section.id} id={section.id}>
              <p className="mini-kicker">{section.eyebrow}</p>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </article>
          ))}
        </div>
      </section>

      <CtaBand
        eyebrow="Next step"
        title="See how RepSync fits your coaching workflow."
        description="Walk through PT Hub, workspaces, public profiles, client delivery, billing visibility, and analytics in one demo."
      />
    </PublicSiteLayout>
  );
}

export function PricingPage() {
  return (
    <PublicSiteLayout
      seo={{
        title: "Pricing — RepSync",
        description:
          "View RepSync pricing or request early access for your coaching business.",
      }}
    >
      <section className="gateway-section hero-section pricing-hero" aria-labelledby="pricing-page-title">
        <div className="gateway-copy hero-copy">
          <p className="kicker">Early access pricing</p>
          <h1 id="pricing-page-title">
            Simple pricing for growing coaching businesses.
          </h1>
          <p className="gateway-lede">
            RepSync is currently being prepared for early users. Book a demo or
            join early access to find the right setup for your coaching
            business.
          </p>
          <div className="cta-actions left">
            <Link className="pill-button" to="/demo">
              Book a demo
            </Link>
            <Link className="pill-button secondary" to="/signup">
              Join early access
            </Link>
          </div>
        </div>
        <article className="price-card early-access-card">
          <p className="mini-kicker">Early access</p>
          <h3>RepSync coaching OS</h3>
          <p>
            Pricing is being finalized with early users. The demo flow helps
            match RepSync to your business size, client volume, and delivery
            model.
          </p>
          <ul>
            {pricingFeatures.slice(0, 8).map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <Link className="pill-button" to="/demo">
            Book a demo
          </Link>
        </article>
      </section>

      <section className="comparison-section">
        <div className="pricing-shell pricing-includes">
          <div>
            <p className="kicker">Included</p>
            <h2>What early users are evaluating.</h2>
            <p className="pricing-copy">
              RepSync is being matched to real coaching setups before final
              public pricing is published. The demo is used to understand
              client volume, delivery model, team needs, and billing context.
            </p>
          </div>
          <div className="feature-checklist" aria-label="RepSync included areas">
            {pricingFeatures.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="trial-band pricing-expectations" aria-labelledby="pricing-next-title">
        <div>
          <p className="kicker">After you request access</p>
          <h2 id="pricing-next-title">No fake plan limits. No surprise pricing table.</h2>
          <p>
            RepSync is not publishing final limits until early users validate
            the right packaging. You will see what is available now, what is
            planned, and where your current tools fit.
          </p>
        </div>
        <ExpectationList />
      </section>

      <section className="use-case-section" aria-labelledby="who-title">
        <div>
          <p className="kicker">Fit</p>
          <h2 id="who-title">Who it is for</h2>
        </div>
        <div className="use-case-grid">
          {[
            "Solo personal trainers moving beyond spreadsheets.",
            "Online coaches managing structured client delivery.",
            "Hybrid coaches who need consistent onboarding and check-ins.",
            "Growing teams that need shared visibility and workspace rules.",
          ].map((item) => (
            <article key={item}>
              <p className="mini-kicker">Use case</p>
              <h3>{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="faq-section" aria-labelledby="pricing-faq-title">
        <SectionHeader eyebrow="FAQ" title="Pricing questions" />
        <div className="faq-grid">
          {pricingFaq.map((item) => (
            <article key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <CtaBand
        eyebrow="Early access"
        title="Find the right RepSync setup."
        description="Book a demo and we will map RepSync to your coaching business without inventing fixed plan limits before pricing is finalized."
      />
    </PublicSiteLayout>
  );
}

type DemoFormState = {
  fullName: string;
  email: string;
  businessType: string;
  clients: string;
  currentTools: string;
  mainProblem: string;
  message: string;
  company: string;
};

const initialDemoForm: DemoFormState = {
  fullName: "",
  email: "",
  businessType: "",
  clients: "",
  currentTools: "",
  mainProblem: "",
  message: "",
  company: "",
};

export function DemoPage() {
  const [form, setForm] = useState(initialDemoForm);
  const [errors, setErrors] = useState<Partial<Record<keyof DemoFormState, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const formId = useId();

  const updateField = (field: keyof DemoFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (status !== "idle") setStatus("idle");
  };

  const validate = () => {
    const nextErrors: Partial<Record<keyof DemoFormState, string>> = {};
    if (!form.fullName.trim()) nextErrors.fullName = "Full name is required.";
    if (!/\S+@\S+\.\S+/.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!form.businessType.trim()) {
      nextErrors.businessType = "Business type is required.";
    }
    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setStatus("idle");
      return;
    }

    setStatus("submitting");

    try {
      if (form.company.trim()) {
        setStatus("success");
        return;
      }

      // TODO: Wire this form to the production demo-request endpoint once one exists.
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      setStatus("success");
      setForm(initialDemoForm);
    } catch {
      setStatus("error");
    }
  };

  return (
    <PublicSiteLayout
      seo={{
        title: "Book a Demo — RepSync",
        description:
          "Request a RepSync demo and see how it can support your coaching workflow.",
      }}
    >
      <section className="gateway-section hero-section demo-hero" aria-labelledby="demo-title">
        <div className="gateway-copy hero-copy">
          <p className="kicker">Demo request</p>
          <h1 id="demo-title">See RepSync around your coaching setup.</h1>
          <p className="gateway-lede">
            Tell us how you coach today and what feels scattered. The demo flow
            is built to understand your lead capture, client delivery,
            workspaces, check-ins, billing, and visibility needs.
          </p>
          <div className="trust-strip" aria-label="Demo topics">
            <span>PT Hub</span>
            <span>Workspaces</span>
            <span>Client delivery</span>
          </div>
          <ExpectationList />
        </div>

        <form className="demo-form price-card" onSubmit={handleSubmit} noValidate>
          <Field
            id={`${formId}-full-name`}
            label="Full name"
            value={form.fullName}
            error={errors.fullName}
            autoComplete="name"
            onChange={(value) => updateField("fullName", value)}
            required
          />
          <Field
            id={`${formId}-email`}
            label="Email"
            type="email"
            value={form.email}
            error={errors.email}
            autoComplete="email"
            onChange={(value) => updateField("email", value)}
            required
          />
          <SelectField
            id={`${formId}-business-type`}
            label="Business type"
            value={form.businessType}
            error={errors.businessType}
            options={businessTypeOptions}
            onChange={(value) => updateField("businessType", value)}
            required
          />
          <SelectField
            id={`${formId}-clients`}
            label="Number of clients"
            value={form.clients}
            options={clientCountOptions}
            onChange={(value) => updateField("clients", value)}
          />
          <Field
            id={`${formId}-tools`}
            label="Current tools"
            value={form.currentTools}
            placeholder="Forms, spreadsheets, DMs, billing tools..."
            onChange={(value) => updateField("currentTools", value)}
          />
          <SelectField
            id={`${formId}-problem`}
            label="Main problem"
            value={form.mainProblem}
            options={mainProblemOptions}
            onChange={(value) => updateField("mainProblem", value)}
          />
          <Field
            id={`${formId}-message`}
            label="Message"
            value={form.message}
            onChange={(value) => updateField("message", value)}
            multiline
          />
          <p className="form-helper">
            This form is validated in the browser while the production
            demo-request endpoint is being connected.
          </p>
          <label
            className="honeypot"
            htmlFor={`${formId}-company`}
            aria-hidden="true"
          >
            Company
            <input
              id={`${formId}-company`}
              value={form.company}
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
              onChange={(event) => updateField("company", event.target.value)}
            />
          </label>

          {status === "success" ? (
            <div className="form-notice success" role="status">
              Thanks. Your details passed validation. The production
              demo-request endpoint still needs to be connected before this can
              be sent to the RepSync team.
            </div>
          ) : null}
          {status === "error" ? (
            <div className="form-notice error" role="alert">
              Something went wrong while sending your request. Please try again.
            </div>
          ) : null}
          <button
            className="pill-button"
            type="submit"
            disabled={status === "submitting"}
          >
            {status === "submitting" ? "Sending..." : "Book a demo"}
          </button>
        </form>
      </section>
    </PublicSiteLayout>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  autoComplete,
  required,
  multiline,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="demo-field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={4}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  error,
  options,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  options: string[];
  required?: boolean;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="demo-field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={id}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option, index) => (
          <option key={`${label}-${option || "empty"}`} value={option}>
            {index === 0 ? `Select ${label.toLowerCase()}` : option}
          </option>
        ))}
      </select>
      {error ? (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
