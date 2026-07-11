import {
  FormEvent,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { useCoachMarketplaceProfiles } from "../../features/pt-hub/lib/pt-hub";
import type {
  PTAvailabilityMode,
  PTCoachingMode,
  PTPublicProfile,
} from "../../features/pt-hub/types";
import { routes } from "../../lib/routes";
import { supabase } from "../../lib/supabase";
import {
  type ComparisonCompetitor,
  getActiveMarketingFeatures,
  getComparisonPageData,
  getMarketingCtaDestination,
  marketingRouteMetadata,
  productPreviewGroups,
} from "../../lib/marketing-public";
import "../../styles/marketing-home.css";

type SeoConfig = {
  title: string;
  description: string;
  canonicalPath?: string;
};

type LeadFormMode = "request_access" | "switch";

type LeadFormState = {
  firstName: string;
  lastName: string;
  email: string;
  businessName: string;
  coachingModel: string;
  clientsRange: string;
  currentPlatform: string;
  primaryReason: string;
  message: string;
  switchingTimeline: string;
  teamSize: string;
  dataToMove: string;
  migrationConcerns: string;
  consent: boolean;
  website: string;
};

const marketingOrigin =
  typeof window === "undefined" ? "" : window.location.origin;

const defaultLeadForm: LeadFormState = {
  firstName: "",
  lastName: "",
  email: "",
  businessName: "",
  coachingModel: "",
  clientsRange: "",
  currentPlatform: "",
  primaryReason: "",
  message: "",
  switchingTimeline: "",
  teamSize: "",
  dataToMove: "",
  migrationConcerns: "",
  consent: false,
  website: "",
};

const coachingModeLabels: Record<PTCoachingMode, string> = {
  one_on_one: "1:1 coaching",
  programming: "Programming",
  nutrition: "Nutrition",
  accountability: "Accountability",
};

const availabilityModeLabels: Record<PTAvailabilityMode, string> = {
  online: "Online",
  in_person: "In person",
};

const lifecycleItems = [
  {
    title: "Before they join",
    body: "Public profiles, applications, lead context, and a coach marketplace that make the first step feel clear.",
  },
  {
    title: "Once they start",
    body: "Baseline context, onboarding, programs, check-ins, messages, and next actions move into one rhythm.",
  },
  {
    title: "While you coach",
    body: "Workouts, nutrition, habits, notes, progress, and conversations stay attached to the client relationship.",
  },
  {
    title: "Before they drift",
    body: "Attention cues help coaches see missed check-ins, low follow-through, and clients who need a touchpoint.",
  },
];

const productPillars = [
  {
    title: "Acquire",
    body: "Publish a coach profile, appear in the marketplace, and collect applications without rebuilding your website.",
  },
  {
    title: "Coach",
    body: "Run programs, check-ins, habits, messages, client context, and notes from a focused workspace.",
  },
  {
    title: "Retain",
    body: "Keep attention on adherence, follow-ups, and relationship signals before clients become silent.",
  },
];

const faqs = [
  {
    q: "Is RepSync only for workout programming?",
    a: "No. Programming is part of the workflow, but RepSync is positioned around the whole coaching relationship: discovery, applications, onboarding, delivery, attention, and retention.",
  },
  {
    q: "Can clients find coaches publicly?",
    a: "Yes. Coaches can publish a public profile from PT Hub, and published profiles appear in the public coach marketplace.",
  },
  {
    q: "Does RepSync replace my existing website?",
    a: "It can complement it. RepSync gives coaches a public profile and application flow while still letting them keep their own brand presence elsewhere.",
  },
  {
    q: "Can I move from TrueCoach, Fitr, spreadsheets, or DMs?",
    a: "The switch flow is designed to capture your current setup and migration needs. RepSync should be presented honestly as an early access product, not an instant one-click migration promise.",
  },
  {
    q: "Is pricing public?",
    a: "Pricing is not public yet. The site routes interested coaches to request early access so the team can qualify fit and explain the current product stage.",
  },
  {
    q: "Does RepSync make compliance claims?",
    a: "No. The public site avoids HIPAA, GDPR, SOC2, or medical claim language unless those programs are formally in place.",
  },
];

function trackMarketingEvent(
  name: string,
  properties: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("repsync:marketing-event", {
      detail: { name, properties, path: window.location.pathname },
    }),
  );
}

function MarketingCta({
  intent,
  children,
  className = "rs-button",
}: {
  intent: "primary" | "switch" | "product" | "login";
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      className={className}
      to={getMarketingCtaDestination(intent)}
      onClick={() => trackMarketingEvent("marketing_cta_clicked", { intent })}
    >
      {children}
    </Link>
  );
}

function usePageMetadata({ title, description, canonicalPath }: SeoConfig) {
  useEffect(() => {
    document.title = title;

    const ensureMeta = (selector: string, create: () => HTMLMetaElement) => {
      const existing = document.head.querySelector<HTMLMetaElement>(selector);
      if (existing) return existing;
      const tag = create();
      document.head.appendChild(tag);
      return tag;
    };

    const ensureLink = (selector: string, create: () => HTMLLinkElement) => {
      const existing = document.head.querySelector<HTMLLinkElement>(selector);
      if (existing) return existing;
      const tag = create();
      document.head.appendChild(tag);
      return tag;
    };

    ensureMeta('meta[name="description"]', () => {
      const tag = document.createElement("meta");
      tag.name = "description";
      return tag;
    }).content = description;

    ensureMeta('meta[property="og:title"]', () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:title");
      return tag;
    }).content = title;

    ensureMeta('meta[property="og:description"]', () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:description");
      return tag;
    }).content = description;

    ensureMeta('meta[name="twitter:card"]', () => {
      const tag = document.createElement("meta");
      tag.name = "twitter:card";
      return tag;
    }).content = "summary_large_image";

    ensureMeta('meta[name="twitter:title"]', () => {
      const tag = document.createElement("meta");
      tag.name = "twitter:title";
      return tag;
    }).content = title;

    ensureMeta('meta[name="twitter:description"]', () => {
      const tag = document.createElement("meta");
      tag.name = "twitter:description";
      return tag;
    }).content = description;

    ensureLink('link[rel="canonical"]', () => {
      const tag = document.createElement("link");
      tag.rel = "canonical";
      return tag;
    }).href = `${marketingOrigin}${canonicalPath ?? window.location.pathname}`;
  }, [canonicalPath, description, title]);
}

function BrandMark() {
  return (
    <Link className="rs-brand" to="/" aria-label="RepSync home">
      <span className="rs-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="img">
          <path d="M5.6 9.2h2.1v5.6H5.6zM16.3 9.2h2.1v5.6h-2.1zM2.8 10.7h2.1v2.6H2.8zM19.1 10.7h2.1v2.6h-2.1zM8.5 11h7v2h-7z" />
        </svg>
      </span>
      <span>R E P S Y N C</span>
    </Link>
  );
}

function MarketingLayout({
  children,
  seo,
}: {
  children: ReactNode;
  seo: SeoConfig;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  usePageMetadata(seo);

  useEffect(() => {
    const syncScrolled = () => setScrolled(window.scrollY > 12);
    syncScrolled();
    window.addEventListener("scroll", syncScrolled, { passive: true });
    return () => window.removeEventListener("scroll", syncScrolled);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          "#main section",
          ".rs-feature-grid article",
          ".rs-preview-card",
          ".rs-workflow-step",
          ".rs-attention-grid article",
          ".rs-workspace-roles article",
          ".rs-faq-list details",
        ].join(","),
      ),
    );

    targets.forEach((target, index) => {
      target.classList.add("rs-reveal");
      target.style.setProperty("--rs-reveal-delay", `${(index % 5) * 55}ms`);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, [children]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={`marketing-home-page ${menuOpen ? "menu-open" : ""}`}>
      <a className="rs-skip-link" href="#main">
        Skip to content
      </a>

      <header
        className={`rs-site-header ${scrolled ? "is-scrolled" : ""}`}
        aria-label="Primary navigation"
      >
        <BrandMark />

        <nav className="rs-desktop-nav" aria-label="Site sections">
          <Link to="/product">Product</Link>
          <Link to="/for-coaches">For coaches</Link>
          <Link to="/for-clients">For clients</Link>
          <Link to="/#why">Why RepSync</Link>
          <Link to="/switch">Switch</Link>
        </nav>

        <div className="rs-header-actions">
          <Link className="rs-text-link" to="/login">
            Log in
          </Link>
          <MarketingCta intent="primary" className="rs-button rs-button--small">
            Request early access
          </MarketingCta>
          <button
            className="rs-menu-button"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
          </button>
        </div>

        <nav
          className={`rs-mobile-nav ${menuOpen ? "is-open" : ""}`}
          id="mobile-menu"
          aria-label="Mobile navigation"
        >
          <Link to="/product" onClick={closeMenu}>
            Product
          </Link>
          <Link to="/for-coaches" onClick={closeMenu}>
            For coaches
          </Link>
          <Link to="/for-clients" onClick={closeMenu}>
            For clients
          </Link>
          <Link to="/coaches" onClick={closeMenu}>
            Coach marketplace
          </Link>
          <Link to="/switch" onClick={closeMenu}>
            Switch
          </Link>
          <Link to="/login" onClick={closeMenu}>
            Log in
          </Link>
          <Link to="/request-access" onClick={closeMenu}>
            Request early access
          </Link>
          <Link to="/compare/truecoach" onClick={closeMenu}>
            Moving from TrueCoach
          </Link>
          <Link to="/compare/fitr" onClick={closeMenu}>
            Moving from FITR
          </Link>
        </nav>
      </header>

      <main id="main">{children}</main>

      <footer className="rs-site-footer">
        <BrandMark />
        <nav aria-label="Footer navigation">
          <Link to="/product">Product</Link>
          <Link to="/for-coaches">For coaches</Link>
          <Link to="/for-clients">For clients</Link>
          <Link to="/coaches">Coaches</Link>
          <Link to="/compare/truecoach">TrueCoach</Link>
          <Link to="/compare/fitr">Fitr</Link>
          <Link to="/security">Security</Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/cookies">Cookies</Link>
          <Link to="/switch">Plan your switch</Link>
        </nav>
      </footer>
    </div>
  );
}

async function submitMarketingLead(mode: LeadFormMode, form: LeadFormState) {
  const { data, error } = await supabase.functions.invoke(
    "marketing-lead-submit",
    {
      body: {
        type: mode,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        email: form.email.trim(),
        business_name: form.businessName.trim(),
        coaching_business: form.businessName.trim(),
        coaching_model: form.coachingModel,
        clients_range: form.clientsRange,
        current_platform: form.currentPlatform.trim(),
        current_tools: form.currentPlatform.trim(),
        primary_reason: form.primaryReason,
        goal: form.primaryReason,
        message: form.message.trim(),
        switching_timeline: form.switchingTimeline,
        team_size: form.teamSize,
        data_to_move: form.dataToMove.trim(),
        migration_concerns: form.migrationConcerns.trim(),
        migration_notes: [
          form.dataToMove.trim(),
          form.migrationConcerns.trim(),
        ].filter(Boolean).join("\n\n"),
        consent: form.consent,
        website: form.website,
        page_path: window.location.pathname,
      },
    },
  );
  if (error) throw error;
  return data;
}

function validateLeadForm(mode: LeadFormMode, form: LeadFormState) {
  if (form.website.trim()) return "Thanks.";
  if (form.firstName.trim().length < 2) return "Enter your first name.";
  if (form.lastName.trim().length < 2) return "Enter your last name.";
  if (!/\S+@\S+\.\S+/.test(form.email.trim())) {
    return "Enter a valid email address.";
  }
  if (!form.coachingModel) return "Select your coaching model.";
  if (!form.primaryReason) return "Select your primary reason.";
  if (!form.businessName.trim() && mode === "switch") {
    return "Enter your business name.";
  }
  if (!form.clientsRange) return "Select your current client range.";
  if (mode === "switch") {
    if (!form.currentPlatform.trim()) {
      return "Tell us what you are switching from.";
    }
    if (!form.switchingTimeline) return "Select your switching timeline.";
    if (!form.teamSize) return "Select your team size.";
    if (!form.dataToMove.trim()) return "Tell us what needs to move.";
  }
  if (!form.consent) return "Confirm we can contact you about RepSync.";
  return null;
}

function LeadForm({ mode }: { mode: LeadFormMode }) {
  const [form, setForm] = useState(defaultLeadForm);
  const [status, setStatus] = useState<"idle" | "submitting" | "sent">("idle");
  const [message, setMessage] = useState("");
  const firstNameId = useId();
  const lastNameId = useId();
  const emailId = useId();
  const businessId = useId();
  const modelId = useId();
  const clientsId = useId();
  const platformId = useId();
  const reasonId = useId();
  const messageId = useId();
  const timelineId = useId();
  const teamSizeId = useId();
  const dataToMoveId = useId();
  const concernsId = useId();
  const consentId = useId();
  const websiteId = useId();

  const update = (key: keyof LeadFormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (message) setMessage("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== "idle") return;

    const validationMessage = validateLeadForm(mode, form);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setStatus("submitting");
    trackMarketingEvent("marketing_lead_submit_started", { mode });

    try {
      await submitMarketingLead(mode, form);
      setStatus("sent");
      setMessage(
        mode === "switch"
          ? "Thanks. Your switch request has been received."
          : "Thanks. Your early access request has been received.",
      );
      trackMarketingEvent("marketing_lead_submit_succeeded", { mode });
    } catch (error) {
      setStatus("idle");
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
      trackMarketingEvent("marketing_lead_submit_failed", { mode });
    }
  };

  const isSubmitting = status === "submitting";
  const isSent = status === "sent";

  return (
    <form className="rs-lead-form" onSubmit={handleSubmit} noValidate>
      <div className="rs-form-grid">
        <label>
          <span>First name</span>
          <input
            id={firstNameId}
            value={form.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            autoComplete="given-name"
            aria-invalid={message === "Enter your first name."}
            required
          />
        </label>
        <label>
          <span>Last name</span>
          <input
            id={lastNameId}
            value={form.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            autoComplete="family-name"
            aria-invalid={message === "Enter your last name."}
            required
          />
        </label>
      </div>

      <div className="rs-form-grid">
        <label>
          <span>Email</span>
          <input
            id={emailId}
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            autoComplete="email"
            aria-invalid={message === "Enter a valid email address."}
            required
          />
        </label>
        <label>
          <span>Business name</span>
          <input
            id={businessId}
            value={form.businessName}
            onChange={(event) => update("businessName", event.target.value)}
            placeholder={mode === "switch" ? "Required for switch planning" : "Optional"}
            aria-invalid={message === "Enter your business name."}
          />
        </label>
      </div>

      <div className="rs-form-grid">
        <label>
          <span>Coaching model</span>
          <select
            id={modelId}
            value={form.coachingModel}
            onChange={(event) => update("coachingModel", event.target.value)}
            aria-invalid={message === "Select your coaching model."}
            required
          >
            <option value="">Select model</option>
            <option value="online">Online coaching</option>
            <option value="hybrid">Hybrid coaching</option>
            <option value="in_person">In-person PT</option>
            <option value="small_team">Small coaching team</option>
          </select>
        </label>
        <label>
          <span>Active clients</span>
          <select
            id={clientsId}
            value={form.clientsRange}
            onChange={(event) => update("clientsRange", event.target.value)}
            aria-invalid={message === "Select your current client range."}
            required
          >
            <option value="">Select range</option>
            <option value="0-10">0-10</option>
            <option value="11-30">11-30</option>
            <option value="31-75">31-75</option>
            <option value="76+">76+</option>
          </select>
        </label>
      </div>

      <label>
        <span>Current platform</span>
        <input
          id={platformId}
          value={form.currentPlatform}
          onChange={(event) => update("currentPlatform", event.target.value)}
          placeholder="TrueCoach, Fitr, Trainerize, Notion, spreadsheets, DMs..."
          aria-invalid={message === "Tell us what you are switching from."}
          required={mode === "switch"}
        />
      </label>

      <label>
        <span>Primary reason</span>
        <select
          id={reasonId}
          value={form.primaryReason}
          onChange={(event) => update("primaryReason", event.target.value)}
          aria-invalid={message === "Select your primary reason."}
          required
        >
          <option value="">Select reason</option>
          <option value="lead_to_client">Lead-to-client continuity</option>
          <option value="client_attention">Client attention visibility</option>
          <option value="team_workspace">Small-team workspace control</option>
          <option value="delivery_clarity">Delivery and check-in clarity</option>
        </select>
      </label>

      {mode === "switch" ? (
        <>
          <div className="rs-form-grid">
            <label>
              <span>Switching timeline</span>
              <select
                id={timelineId}
                value={form.switchingTimeline}
                onChange={(event) =>
                  update("switchingTimeline", event.target.value)
                }
                aria-invalid={message === "Select your switching timeline."}
                required
              >
                <option value="">Select timeline</option>
                <option value="this_month">This month</option>
                <option value="1_3_months">1-3 months</option>
                <option value="later">Later</option>
              </select>
            </label>
            <label>
              <span>Team size</span>
              <select
                id={teamSizeId}
                value={form.teamSize}
                onChange={(event) => update("teamSize", event.target.value)}
                aria-invalid={message === "Select your team size."}
                required
              >
                <option value="">Select team size</option>
                <option value="solo">Solo coach</option>
                <option value="2_5">2-5 coaches</option>
                <option value="6_plus">6+ coaches</option>
              </select>
            </label>
          </div>
          <label>
            <span>Data to move</span>
            <textarea
              id={dataToMoveId}
              value={form.dataToMove}
              onChange={(event) => update("dataToMove", event.target.value)}
              rows={3}
              placeholder="Clients, programs, check-ins, habits, notes, archived records..."
              aria-invalid={message === "Tell us what needs to move."}
              required
            />
          </label>
          <label>
            <span>Migration concerns</span>
            <textarea
              id={concernsId}
              value={form.migrationConcerns}
              onChange={(event) =>
                update("migrationConcerns", event.target.value)
              }
              rows={3}
              placeholder="Access, timing, client comms, archived data, team permissions..."
            />
          </label>
        </>
      ) : null}

      <label>
        <span>Optional message</span>
        <textarea
          id={messageId}
          value={form.message}
          onChange={(event) => update("message", event.target.value)}
          rows={4}
          placeholder="Anything else we should know?"
        />
      </label>

      <label className="rs-honeypot" htmlFor={websiteId}>
        Website
        <input
          id={websiteId}
          value={form.website}
          onChange={(event) => update("website", event.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </label>

      <label className="rs-consent">
        <input
          id={consentId}
          type="checkbox"
          checked={form.consent}
          onChange={(event) => update("consent", event.target.checked)}
          aria-invalid={message === "Confirm we can contact you about RepSync."}
        />
        <span>
          I agree RepSync can contact me about early access. Do not include
          client health or medical information in this form.
        </span>
      </label>

      <button className="rs-button" type="submit" disabled={status !== "idle"}>
        {isSubmitting
          ? "Sending"
            : isSent
              ? "Request sent"
              : mode === "switch"
                ? "Plan your switch"
                : "Request early access"}
      </button>
      <p className="rs-form-message" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

function SectionIntro({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="rs-section__heading">
      <p className="rs-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

function getMarketingSeo(path: keyof typeof marketingRouteMetadata): SeoConfig {
  const seo = marketingRouteMetadata[path];
  if (!seo) throw new Error(`Missing marketing route metadata: ${path}`);
  return seo;
}

function getPreviewGroup(key: (typeof productPreviewGroups)[number]["key"]) {
  const group = productPreviewGroups.find((item) => item.key === key);
  if (!group) throw new Error(`Missing marketing preview group: ${key}`);
  return group;
}

function ProductPreviewFrame({
  group,
  featured = false,
}: {
  group: (typeof productPreviewGroups)[number];
  featured?: boolean;
}) {
  return (
    <article
      className={`rs-preview-card ${featured ? "rs-preview-card--featured" : ""}`}
    >
      <div className="rs-preview-card__chrome">
        <span />
        <span />
        <span />
      </div>
      <div className="rs-preview-card__screen" role="img" aria-label={group.caption}>
        <div className="rs-preview-card__header">
          <p className="rs-eyebrow">{group.title}</p>
          <strong>{group.screenTitle}</strong>
          <span>{group.screenSubtitle}</span>
        </div>
        <div className="rs-preview-metrics" aria-hidden="true">
          {group.metrics.map((metric) => (
            <div key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
        <div className="rs-preview-timeline">
          {group.timeline.map((item) => (
            <div
              className="rs-preview-timeline__item"
              data-tone={item.tone ?? "clear"}
              key={`${item.label}-${item.detail}`}
            >
              <span />
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="rs-preview-card__rows">
          {group.facts.map((fact, index) => (
            <div className="rs-preview-row" key={fact}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{fact}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="rs-preview-caption">{group.caption}</p>
    </article>
  );
}

function ProductEvidenceGrid() {
  const acquire = getPreviewGroup("acquire");
  const coach = getPreviewGroup("coach");
  const retain = getPreviewGroup("retain");

  return (
    <div className="rs-product-evidence-grid">
      <ProductPreviewFrame group={coach} featured />
      <ProductPreviewFrame group={acquire} />
      <ProductPreviewFrame group={retain} />
    </div>
  );
}

function DifferentiationSection() {
  const differentiators = [
    [
      "Lead-to-client continuity",
      "Keep the public profile, application, conversation, approval, and coaching relationship connected.",
    ],
    [
      "Specific client attention",
      "See exactly why a client needs attention: missed check-in, no reply, declining adherence, inactivity, overdue work, or a manual coach flag.",
    ],
    [
      "Business and coaching delivery together",
      "Review the lead pipeline, weekly coaching work, client status, and workspace performance without changing systems.",
    ],
    [
      "Controlled coaching workspaces",
      "Organize owners, assistant coaches, viewers, assigned clients, and shared delivery without giving every team member full access.",
    ],
  ];

  return (
    <section className="rs-section" id="why" aria-labelledby="why-title">
      <SectionIntro
        eyebrow="Why RepSync"
        title="Built for the work around the workout."
        body="RepSync does not need unsupported competitor claims. Its difference is the continuity of the work coaches already do around delivery."
      />
      <div className="rs-feature-grid rs-feature-grid--four">
        {differentiators.map(([title, body]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ClientAttentionSection() {
  return (
    <section className="rs-section rs-attention-section" aria-labelledby="attention-title">
      <div className="rs-section__heading">
        <p className="rs-eyebrow">Client attention</p>
        <h2 id="attention-title">Lifecycle and attention stay separate.</h2>
        <p>
          Lifecycle describes where the client is in the relationship. Attention
          explains whether a coach needs to act, and why.
        </p>
      </div>
      <div className="rs-attention-grid">
        {[
          ["Lifecycle", "Active", "Relationship state"],
          ["Attention", "At risk", "Missed latest check-in"],
          ["Lifecycle", "Onboarding", "Complete intake next"],
          ["Attention", "Clear", "No coach action needed"],
        ].map(([label, value, detail]) => (
          <article key={`${label}-${value}`}>
            <span>{label}</span>
            <h3>{value}</h3>
            <p>{detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkspaceSection() {
  return (
    <section className="rs-section rs-workspace-section" aria-labelledby="workspace-title">
      <div>
        <p className="rs-eyebrow">Small-team workspace</p>
        <h2 id="workspace-title">Give coaches the right view of shared work.</h2>
        <p>
          RepSync markets owner, assistant coach, and viewer distinctions only
          where the product has workspace role and route-guard support.
        </p>
      </div>
      <div className="rs-workspace-roles">
        {[
          ["Owner", "Manages workspace settings, clients, leads, and team access."],
          ["Assistant coach", "Works assigned clients without owning every business control."],
          ["Viewer", "Reviews workspace context with read-oriented access patterns."],
        ].map(([role, description]) => (
          <article key={role}>
            <h3>{role}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="rs-section" aria-labelledby="trust-title">
      <SectionIntro
        eyebrow="Trust"
        title="Trust language stays factual until formal claims exist."
        body="No fictional testimonials, no unsupported certifications, and no legal compliance claims. The site points to verified product architecture instead."
      />
      <div className="rs-feature-grid rs-feature-grid--four">
        {[
          ["Role-based workspace access", "Owner, assistant coach, and viewer distinctions shape access."],
          ["Client-scoped visibility", "Private coaching data is kept behind authenticated routes and workspace scope."],
          ["Supabase authentication", "Accounts, protected routes, and persistence use the configured Supabase stack."],
          ["Controlled public profiles", "Coach profiles are public only when published through the PT Hub flow."],
        ].map(([title, body]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SwitchingSection() {
  const steps = [
    [
      "Review",
      "Understand your current platform, client setup, programs, check-ins, and team workflow.",
    ],
    [
      "Prepare",
      "Identify what can be imported, what can be recreated, and what should remain archived.",
    ],
    [
      "Launch",
      "Verify coach access, invite clients, confirm active assignments, and move coaching into RepSync.",
    ],
  ];

  return (
    <section className="rs-section rs-switch-section" aria-labelledby="switch-title">
      <SectionIntro
        eyebrow="Switching"
        title="Switch tools without losing coaching momentum."
        body="Tell us what you use today, what needs to move, and when you want to go live. We will help you plan the safest route into RepSync."
      />
      <div className="rs-feature-grid">
        {steps.map(([title, body], index) => (
          <article key={title}>
            <span>0{index + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <div className="rs-section-actions">
        <Link className="rs-link-cta" to="/compare/truecoach">
          Moving from TrueCoach
        </Link>
        <Link className="rs-link-cta" to="/compare/fitr">
          Moving from FITR
        </Link>
        <MarketingCta intent="switch" className="rs-button">
          Plan your switch
        </MarketingCta>
      </div>
    </section>
  );
}

function AvailabilitySection() {
  const features = getActiveMarketingFeatures();

  return (
    <section className="rs-status-section" aria-labelledby="status-title">
      <div>
        <p className="rs-eyebrow">Controlled early access</p>
        <h2 id="status-title">Available for controlled early access.</h2>
        <p>
          These are the capabilities currently marketed from the central
          availability configuration. Items marked unavailable are intentionally
          hidden from this list.
        </p>
        <div className="rs-availability-list">
          {features.map((feature) => (
            <span key={feature.key} data-status={feature.status}>
              {feature.label}
              {feature.status === "beta" ? " - Beta" : ""}
              {feature.status === "coming_soon" ? " - Coming soon" : ""}
            </span>
          ))}
        </div>
      </div>
      <Link className="rs-button rs-button--quiet" to="/security">
        Read security notes
      </Link>
    </section>
  );
}

function HomeContent() {

  return (
    <>
      <section className="rs-hero" id="home" aria-labelledby="hero-title">
        <div className="rs-hero__visual" aria-hidden="true">
          <div className="rs-hero__image-panel">
            <ProductPreviewFrame group={getPreviewGroup("coach")} featured />
          </div>
        </div>

        <div className="rs-hero__content">
          <p className="rs-eyebrow">
            Coaching software for independent trainers and small teams
          </p>
          <h1 id="hero-title">
            More than workout delivery. Run the whole coaching business.
          </h1>
          <p className="rs-hero__lede">
            RepSync is the operating system for the coaching relationship:
            public profiles, lead applications, client delivery, attention cues,
            and the workspace coaches use to keep the week moving.
          </p>
          <div className="rs-hero__actions">
            <MarketingCta intent="primary">
              Request early access
            </MarketingCta>
            <MarketingCta intent="product" className="rs-button rs-button--quiet">
              See the product
            </MarketingCta>
            <MarketingCta intent="switch" className="rs-link-cta">
              Switching from another coaching tool?
            </MarketingCta>
          </div>
          <div className="rs-hero__signals" aria-label="RepSync product focus">
            <span>Public coach profiles</span>
            <span>Applications</span>
            <span>PT Hub</span>
            <span>Client portal</span>
          </div>
        </div>
      </section>

      <section className="rs-intro-strip" aria-label="RepSync lifecycle">
        <p>
          Public profile, applications, conversations, onboarding, delivery,
          check-ins, attention, analytics, and team permissions connect in one
          coaching operating layer.
        </p>
        <dl>
          {productPillars.map((item) => (
            <div key={item.title}>
              <dt>{item.title}</dt>
              <dd>{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rs-section" aria-labelledby="problem-title">
        <SectionIntro
          eyebrow="The problem"
          title="The coaching business usually lives in five places."
          body="A public Instagram page, applications in a form tool, workouts somewhere else, check-ins in messages, and client notes in a private document. RepSync brings the working relationship back into one system."
        />
        <div className="rs-feature-grid rs-feature-grid--four">
          {lifecycleItems.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="rs-section rs-product-section"
        id="product"
        aria-labelledby="product-title"
      >
        <SectionIntro
          eyebrow="Product journey"
          title="Acquire, coach, and retain from the same operating layer."
          body="The public website creates demand. PT Hub turns that demand into a managed coaching workflow. The client portal keeps delivery clear."
        />

        <ProductEvidenceGrid />
      </section>

      <DifferentiationSection />
      <ClientAttentionSection />

      <section className="rs-section rs-workflow-section" id="workflow">
        <div className="rs-workflow-copy">
          <p className="rs-eyebrow">Client experience</p>
          <h2>Clients should know what to do next.</h2>
          <p>
            RepSync is built around clarity: today, this week, check-in,
            message, progress, and the next coaching touchpoint.
          </p>
        </div>
        <div className="rs-workflow-map" aria-label="RepSync coaching workflow">
          {[
            ["01", "Apply", "A prospect opens a coach profile and applies."],
            [
              "02",
              "Start",
              "The coach reviews the lead and starts the relationship.",
            ],
            [
              "03",
              "Do the work",
              "The client sees programs, habits, nutrition, and check-ins.",
            ],
            [
              "04",
              "Stay connected",
              "The coach tracks attention, progress, and follow-up.",
            ],
          ].map(([number, title, detail], index) => (
            <div
              className={`rs-workflow-step ${index === 0 ? "is-active" : ""}`}
              key={number}
            >
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <WorkspaceSection />
      <TrustSection />
      <SwitchingSection />
      <AvailabilitySection />

      <FaqPreview />
      <FinalCta />
    </>
  );
}

function FaqPreview() {
  return (
    <section className="rs-section" aria-labelledby="faq-preview-title">
      <SectionIntro eyebrow="FAQ" title="Straight answers before the demo." />
      <div className="rs-faq-list">
        {faqs.slice(0, 3).map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
      <Link className="rs-link-cta" to="/faq">
        Read all FAQs
      </Link>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="rs-demo-section" aria-labelledby="demo-title">
      <div>
        <p className="rs-eyebrow">Early access</p>
        <h2 id="demo-title">Build the coaching business clients expect.</h2>
        <p>
          Request access and see how RepSync can present your brand, organize
          your clients, and bring the week into focus.
        </p>
      </div>
      <div className="rs-cta-actions">
        <MarketingCta intent="primary">
          Request early access
        </MarketingCta>
        <MarketingCta intent="switch" className="rs-button rs-button--quiet">
          Plan your switch
        </MarketingCta>
      </div>
    </section>
  );
}

export function MarketingHomePage() {
  return (
    <MarketingLayout
      seo={getMarketingSeo("/")}
    >
      <HomeContent />
    </MarketingLayout>
  );
}

function getInitials(profile: PTPublicProfile) {
  const source = profile.displayName || profile.fullName || "Coach";
  return source
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function profileMatchesSearch(profile: PTPublicProfile, searchValue: string) {
  const query = searchValue.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    profile.displayName,
    profile.fullName,
    profile.headline,
    profile.searchableHeadline,
    profile.shortBio,
    profile.coachingStyle,
    profile.locationLabel,
    ...profile.specialties,
    ...profile.certifications,
    ...profile.coachingModes.map((mode) => coachingModeLabels[mode]),
    ...profile.availabilityModes.map((mode) => availabilityModeLabels[mode]),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function CoachCard({ profile }: { profile: PTPublicProfile }) {
  const profilePath = routes.publicProfile(profile.slug);
  const applyPath = `${profilePath}#public-pt-apply-form`;
  const specialties = profile.specialties.slice(0, 2);
  const availability = profile.availabilityModes
    .slice(0, 1)
    .map((mode) => availabilityModeLabels[mode]);

  return (
    <article className="rs-coach-card">
      <Link className="rs-coach-card__preview" to={profilePath}>
        <div className="rs-coach-card__media">
          {profile.bannerImageUrl ? (
            <img src={profile.bannerImageUrl} alt="" loading="lazy" />
          ) : (
            <div className="rs-coach-card__fallback-banner" />
          )}
          <div className="rs-coach-card__media-fade" />
        </div>
        <div className="rs-coach-card__body">
          <div className="rs-coach-card__identity">
            <div className="rs-coach-avatar">
              {profile.profilePhotoUrl ? (
                <img
                  src={profile.profilePhotoUrl}
                  alt={`${profile.displayName} profile photo`}
                  loading="lazy"
                />
              ) : (
                <span>{getInitials(profile)}</span>
              )}
            </div>
          </div>

          <div className="rs-coach-card__copy">
            <h2>{profile.displayName || "Display name"}</h2>
            <p className="rs-coach-card__headline">
              {profile.headline || "Headline appears here"}
            </p>
            <p className="rs-coach-card__bio">
              {profile.shortBio ||
                "Add a short bio so prospects understand your coaching style, proof, and ideal client fit."}
            </p>
          </div>

          <div className="rs-coach-tags">
            {specialties.length > 0 ? (
              specialties.map((specialty) => (
                <span key={`${profile.userId}-${specialty}`}>{specialty}</span>
              ))
            ) : (
              <span>Specialties will appear here</span>
            )}
            {availability.map((item) => (
              <span key={`${profile.userId}-${item}`}>{item}</span>
            ))}
            {profile.locationLabel ? (
              <span>{profile.locationLabel}</span>
            ) : null}
          </div>
        </div>
      </Link>

      <div className="rs-coach-card__actions">
        <Link className="rs-button" to={applyPath}>
          Apply
        </Link>
        <Link className="rs-button rs-button--quiet" to={profilePath}>
          View profile
        </Link>
      </div>
    </article>
  );
}

function CoachesContent() {
  const [searchValue, setSearchValue] = useState("");
  const profilesQuery = useCoachMarketplaceProfiles();
  const profiles = useMemo(
    () => profilesQuery.data ?? [],
    [profilesQuery.data],
  );
  const filteredProfiles = useMemo(
    () =>
      profiles.filter((profile) => profileMatchesSearch(profile, searchValue)),
    [profiles, searchValue],
  );

  return (
    <>
      <section className="rs-marketplace-hero" aria-labelledby="coaches-title">
        <div className="rs-marketplace-hero__content">
          <p className="rs-eyebrow">RepSync coach marketplace</p>
          <h1 id="coaches-title">Find the coach your next phase needs.</h1>
          <p className="rs-hero__lede">
            Browse published RepSync coaches, review their profile, and apply
            directly to their training from the same public profile they manage
            in PT Hub.
          </p>
          <form
            className="rs-coach-search"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <label htmlFor="coach-search">Search coaches</label>
            <input
              id="coach-search"
              type="search"
              value={searchValue}
              placeholder="Search goal, specialty, location"
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </form>
          <div className="rs-hero__signals" aria-label="Marketplace filters">
            <span>Online coaching</span>
            <span>1:1 training</span>
            <span>Nutrition</span>
            <span>Accountability</span>
          </div>
        </div>
      </section>

      <section className="rs-section rs-coach-directory" aria-live="polite">
        <div className="rs-directory-head">
          <div>
            <p className="rs-eyebrow">Published profiles</p>
            <h2>
              {profilesQuery.isLoading
                ? "Loading coaches."
                : `${filteredProfiles.length} coach${
                    filteredProfiles.length === 1 ? "" : "es"
                  } available.`}
            </h2>
          </div>
          <p>
            Every card links to the coach profile and application form created
            from the same launch panel preview coaches publish from PT Hub.
          </p>
        </div>

        {profilesQuery.isLoading ? (
          <div className="rs-coach-grid-list">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="rs-coach-card rs-coach-card--loading" key={index}>
                <div />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : profilesQuery.error ? (
          <div className="rs-marketplace-state">
            <h2>Unable to load coaches.</h2>
            <p>
              The marketplace data could not be reached. Try refreshing in a
              moment.
            </p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="rs-marketplace-state">
            <h2>No coaches are listed yet.</h2>
            <p>
              Published PT Hub profiles will appear here automatically after a
              coach launches their public profile.
            </p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="rs-marketplace-state">
            <h2>No matching coaches.</h2>
            <p>
              Try a different specialty, location, service type, or coaching
              style.
            </p>
          </div>
        ) : (
          <div className="rs-coach-grid-list">
            {filteredProfiles.map((profile) => (
              <CoachCard key={profile.userId} profile={profile} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function CoachesPage() {
  return (
    <MarketingLayout
      seo={{
        title: "Find a Coach | RepSync",
        description:
          "Browse published RepSync coaches and apply directly to their training through their public coach profile.",
        canonicalPath: "/coaches",
      }}
    >
      <CoachesContent />
    </MarketingLayout>
  );
}

export function ProductPage() {
  return (
    <MarketingLayout
      seo={getMarketingSeo("/product")}
    >
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Product</p>
        <h1>One system for the whole coaching relationship.</h1>
        <p className="rs-hero__lede">
          RepSync connects the public acquisition layer with the private
          coaching workspace and the client portal.
        </p>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid">
          {productPillars.map((pillar) => (
            <article key={pillar.title}>
              <span>{pillar.title}</span>
              <h3>{pillar.body.split(".")[0]}.</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="rs-section rs-product-section">
        <ProductEvidenceGrid />
      </section>
      <FinalCta />
    </MarketingLayout>
  );
}

export function ForCoachesPage() {
  return (
    <MarketingLayout
      seo={getMarketingSeo("/for-coaches")}
    >
      <section className="rs-page-hero">
        <p className="rs-eyebrow">For coaches</p>
        <h1>Look premium before the call. Stay organized after the sale.</h1>
        <p className="rs-hero__lede">
          RepSync gives independent trainers and small teams a public profile,
          lead flow, client workspace, and operating layer built for repeated
          coaching work.
        </p>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid rs-feature-grid--four">
          {lifecycleItems.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
      <FinalCta />
    </MarketingLayout>
  );
}

export function ForClientsPage() {
  return (
    <MarketingLayout
      seo={getMarketingSeo("/for-clients")}
    >
      <section className="rs-page-hero">
        <p className="rs-eyebrow">For clients</p>
        <h1>Find a coach, apply clearly, and know what to do next.</h1>
        <p className="rs-hero__lede">
          The public marketplace helps clients discover coaches. The client
          portal keeps workouts, check-ins, messages, and progress easier to
          follow.
        </p>
        <div className="rs-hero__actions">
          <Link className="rs-button" to="/coaches">
            Browse coaches
          </Link>
          <Link className="rs-button rs-button--quiet" to="/product">
            See the product
          </Link>
        </div>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid">
          {["Choose", "Apply", "Follow through"].map((title, index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>
                {index === 0
                  ? "Review coach profiles, specialties, location, and coaching style."
                  : index === 1
                    ? "Send the coach useful context through their profile application."
                    : "Use a client home built around today's training, check-ins, and messages."}
              </p>
            </article>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}

export function SwitchPage() {
  return (
    <MarketingLayout
      seo={getMarketingSeo("/switch")}
    >
      <section className="rs-form-page">
        <div>
          <p className="rs-eyebrow">Switch</p>
          <h1>Moving coaching systems should start with the workflow.</h1>
          <p className="rs-hero__lede">
            Tell us what you use now, what feels messy, and what needs to move.
            We will treat migration honestly and avoid promising unsupported
            import paths.
          </p>
        </div>
        <LeadForm mode="switch" />
      </section>
    </MarketingLayout>
  );
}

export function CompareTrueCoachPage() {
  return (
    <ComparePage competitor="truecoach" />
  );
}

export function CompareFitrPage() {
  return <ComparePage competitor="fitr" />;
}

function ComparePage({
  competitor,
}: {
  competitor: ComparisonCompetitor;
}) {
  const comparison = getComparisonPageData(competitor);

  return (
    <MarketingLayout
      seo={getMarketingSeo(comparison.canonicalPath)}
    >
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Compare</p>
        <h1>RepSync vs {comparison.competitorName}</h1>
        <p className="rs-hero__lede">
          Compare operating models and workflows without attack-page claims.
          RepSync focuses on public discovery, applications, delivery, client
          attention, and retention continuity.
        </p>
        <p className="rs-last-reviewed">
          Last reviewed: {comparison.lastReviewed}
        </p>
      </section>
      <section className="rs-section">
        <div className="rs-comparison-table" role="table">
          <div className="rs-comparison-table__head" role="row">
            <span role="columnheader">Workflow</span>
            <span role="columnheader">{comparison.competitorName}</span>
            <span role="columnheader">RepSync</span>
          </div>
          {comparison.rows.map((row) => (
            <div className="rs-comparison-table__row" role="row" key={row.topic}>
              <span role="cell">{row.topic}</span>
              <span role="cell">{row.competitor}</span>
              <span role="cell">{row.repsync}</span>
            </div>
          ))}
        </div>
        <p className="rs-trademark-note">{comparison.trademarkDisclaimer}</p>
        <div className="rs-section-actions">
          <MarketingCta intent="switch" className="rs-button">
            Plan your switch
          </MarketingCta>
          <MarketingCta intent="primary" className="rs-button rs-button--quiet">
            Request early access
          </MarketingCta>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function FaqPage() {
  return (
    <MarketingLayout
      seo={getMarketingSeo("/faq")}
    >
      <section className="rs-page-hero">
        <p className="rs-eyebrow">FAQ</p>
        <h1>Useful answers. No inflated claims.</h1>
      </section>
      <section className="rs-section">
        <div className="rs-faq-list">
          {faqs.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}

export function SecurityPage() {
  return (
    <MarketingLayout
      seo={getMarketingSeo("/security")}
    >
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Security</p>
        <h1>Clear security language for an early access product.</h1>
        <p className="rs-hero__lede">
          RepSync uses account authentication, workspace scoping, and
          Supabase-backed persistence. The public site does not claim HIPAA,
          GDPR, SOC2, or medical compliance programs unless they are formally in
          place.
        </p>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid">
          {[
            [
              "Access control",
              "Private app areas require authenticated accounts and role-based route guards.",
            ],
            [
              "Data boundaries",
              "Workspace data is scoped in the application and database layer.",
            ],
            [
              "Responsible forms",
              "Marketing forms ask for business context, not client health or medical data.",
            ],
          ].map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}

export function RequestAccessPage() {
  return (
    <MarketingLayout
      seo={getMarketingSeo("/request-access")}
    >
      <section className="rs-form-page">
        <div>
          <p className="rs-eyebrow">Request early access</p>
          <h1>Tell us how your coaching business works.</h1>
          <p className="rs-hero__lede">
            RepSync is best presented honestly: a premium operating system for
            coaches who want public discovery, client delivery, and retention
            attention in one place.
          </p>
        </div>
        <LeadForm mode="request_access" />
      </section>
    </MarketingLayout>
  );
}

export function PrivacyPage() {
  return (
    <MarketingLayout seo={getMarketingSeo("/privacy")}>
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Privacy</p>
        <h1>Privacy Policy</h1>
        <p className="rs-hero__lede">
          This structure needs legal review before production. It describes the
          product areas where RepSync may process account, workspace, coaching,
          training, and check-in data.
        </p>
        <p className="rs-last-reviewed">Last updated: Legal review pending</p>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid">
          {[
            [
              "Information we collect",
              "Account profile details, authentication data, workspace settings, programs, check-ins, notes, and operational logs needed to operate and support the app.",
            ],
            [
              "How information is used",
              "Data is used to authenticate users, show the right workspace content, support coach-client collaboration, and operate product features.",
            ],
            [
              "Data storage and security",
              "Role-based policies restrict access to the people and workspaces that need the information.",
            ],
            [
              "Third-party services",
              "RepSync may rely on configured infrastructure, authentication, hosting, analytics, messaging, storage, or payment providers where needed.",
            ],
            [
              "User rights",
              "Users may request access, correction, deletion, or export where available and legally required.",
            ],
            [
              "Contact",
              "Contact support@repsync.com for privacy questions or data requests.",
            ],
          ].map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}

export function TermsPage() {
  return (
    <MarketingLayout seo={getMarketingSeo("/terms")}>
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Terms</p>
        <h1>Terms of Service</h1>
        <p className="rs-hero__lede">
          This structure needs legal review before production. It outlines
          expected areas for service use, accounts, payments, acceptable use,
          and limitations.
        </p>
        <p className="rs-last-reviewed">Last updated: Legal review pending</p>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid">
          {[
            [
              "Use of the service",
              "Use RepSync lawfully, keep account access protected, and do not interfere with service operation.",
            ],
            [
              "Accounts",
              "Users are responsible for keeping account access secure and ensuring workspace members have appropriate permissions.",
            ],
            [
              "Payments",
              "Payment and subscription terms should reflect the final billing setup once pricing and provider configuration are confirmed.",
            ],
            [
              "Acceptable use",
              "Do not misuse platform resources, attempt unauthorized access, or upload content that violates law or rights of others.",
            ],
            [
              "Disclaimers",
              "RepSync is provided as-is. Review outputs before relying on them for training, wellness, or health-related decisions.",
            ],
            [
              "Contact",
              "Contact support@repsync.com for terms or account questions.",
            ],
          ].map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}

export function CookiesPage() {
  return (
    <MarketingLayout
      seo={getMarketingSeo("/cookies")}
    >
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Cookies</p>
        <h1>Cookie notice</h1>
        <p className="rs-hero__lede">
          RepSync may use essential cookies for authentication and basic product
          operation. If analytics or marketing pixels are enabled, they should
          be disclosed here before launch.
        </p>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid">
          <article>
            <h3>Essential cookies</h3>
            <p>Used for login, session handling, and basic app operation.</p>
          </article>
          <article>
            <h3>Analytics</h3>
            <p>
              Marketing analytics should only be enabled with the correct notice
              and consent model for the market.
            </p>
          </article>
          <article>
            <h3>Contact</h3>
            <p>Use the support route for cookie or privacy questions.</p>
          </article>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function MarketingNotFoundPage() {
  return (
    <MarketingLayout
      seo={{
        title: "Page not found | RepSync",
        description: "The RepSync page you requested could not be found.",
      }}
    >
      <section className="rs-page-hero">
        <p className="rs-eyebrow">404</p>
        <h1>This page is not in the coaching plan.</h1>
        <p className="rs-hero__lede">
          The page may have moved, or the link may be outdated.
        </p>
        <div className="rs-hero__actions">
          <Link className="rs-button" to="/">
            Go home
          </Link>
          <Link className="rs-button rs-button--quiet" to="/coaches">
            Browse coaches
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function PricingPage() {
  return <RequestAccessPage />;
}

export function DemoPage() {
  return <RequestAccessPage />;
}
