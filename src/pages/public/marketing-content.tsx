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
import "../../styles/marketing-home.css";

type SeoConfig = {
  title: string;
  description: string;
  canonicalPath?: string;
};

type LeadFormMode = "request_access" | "switch";

type LeadFormState = {
  name: string;
  email: string;
  role: string;
  coachingBusiness: string;
  clientsRange: string;
  currentTools: string;
  goal: string;
  migrationNotes: string;
  consent: boolean;
  website: string;
};

const marketingOrigin =
  typeof window === "undefined" ? "" : window.location.origin;

const defaultLeadForm: LeadFormState = {
  name: "",
  email: "",
  role: "coach",
  coachingBusiness: "",
  clientsRange: "",
  currentTools: "",
  goal: "",
  migrationNotes: "",
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
      <span>RepSync</span>
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
          <Link className="rs-button rs-button--small" to="/request-access">
            Request early access
          </Link>
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
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        coaching_business: form.coachingBusiness.trim(),
        clients_range: form.clientsRange,
        current_tools: form.currentTools.trim(),
        goal: form.goal.trim(),
        migration_notes: form.migrationNotes.trim(),
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
  if (form.name.trim().length < 2) return "Enter your name.";
  if (!/\S+@\S+\.\S+/.test(form.email.trim())) {
    return "Enter a valid email address.";
  }
  if (!form.coachingBusiness.trim()) {
    return "Tell us about your coaching business.";
  }
  if (!form.clientsRange) return "Select your current client range.";
  if (mode === "switch" && !form.currentTools.trim()) {
    return "Tell us what you are switching from.";
  }
  if (!form.consent) return "Confirm we can contact you about RepSync.";
  return null;
}

function LeadForm({ mode }: { mode: LeadFormMode }) {
  const [form, setForm] = useState(defaultLeadForm);
  const [status, setStatus] = useState<"idle" | "submitting" | "sent">("idle");
  const [message, setMessage] = useState("");
  const nameId = useId();
  const emailId = useId();
  const businessId = useId();
  const clientsId = useId();
  const toolsId = useId();
  const goalId = useId();
  const notesId = useId();
  const consentId = useId();
  const websiteId = useId();

  const update = (key: keyof LeadFormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (message) setMessage("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

  return (
    <form className="rs-lead-form" onSubmit={handleSubmit} noValidate>
      <div className="rs-form-grid">
        <label>
          <span>Name</span>
          <input
            id={nameId}
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            autoComplete="name"
            required
          />
        </label>
        <label>
          <span>Email</span>
          <input
            id={emailId}
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            autoComplete="email"
            required
          />
        </label>
      </div>

      <label>
        <span>Business or coaching offer</span>
        <input
          id={businessId}
          value={form.coachingBusiness}
          onChange={(event) => update("coachingBusiness", event.target.value)}
          placeholder="Online strength coaching, hybrid PT studio, small team..."
          required
        />
      </label>

      <div className="rs-form-grid">
        <label>
          <span>Your role</span>
          <select
            value={form.role}
            onChange={(event) => update("role", event.target.value)}
          >
            <option value="coach">Coach</option>
            <option value="studio_owner">Studio owner</option>
            <option value="operator">Operator</option>
            <option value="client">Client</option>
          </select>
        </label>
        <label>
          <span>Current active clients</span>
          <select
            id={clientsId}
            value={form.clientsRange}
            onChange={(event) => update("clientsRange", event.target.value)}
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
        <span>
          {mode === "switch" ? "What are you switching from?" : "Current tools"}
        </span>
        <input
          id={toolsId}
          value={form.currentTools}
          onChange={(event) => update("currentTools", event.target.value)}
          placeholder="TrueCoach, Fitr, Trainerize, Notion, spreadsheets, DMs..."
        />
      </label>

      <label>
        <span>Main thing you want RepSync to solve</span>
        <textarea
          id={goalId}
          value={form.goal}
          onChange={(event) => update("goal", event.target.value)}
          rows={4}
        />
      </label>

      {mode === "switch" ? (
        <label>
          <span>Migration notes</span>
          <textarea
            id={notesId}
            value={form.migrationNotes}
            onChange={(event) => update("migrationNotes", event.target.value)}
            rows={4}
            placeholder="Tell us what data, clients, or workflows matter most."
          />
        </label>
      ) : null}

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
        />
        <span>
          I agree RepSync can contact me about early access. Do not include
          client health or medical information in this form.
        </span>
      </label>

      <button className="rs-button" type="submit" disabled={status !== "idle"}>
        {status === "submitting"
          ? "Sending"
          : status === "sent"
            ? "Request sent"
            : mode === "switch"
              ? "Request switch help"
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

function HomeContent() {
  const marketplaceQuery = useCoachMarketplaceProfiles();
  const featuredCoach = marketplaceQuery.data?.[0] ?? null;

  return (
    <>
      <section className="rs-hero" id="home" aria-labelledby="hero-title">
        <div className="rs-hero__visual" aria-hidden="true">
          <div className="rs-hero__image-panel">
            <img
              src="/assets/feature-coach-dashboard.png"
              alt=""
              loading="eager"
            />
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
            <Link className="rs-button" to="/request-access">
              Request early access
            </Link>
            <Link className="rs-button rs-button--quiet" to="/product">
              See product
            </Link>
            <Link className="rs-link-cta" to="/switch">
              Switching from another coaching tool?
            </Link>
          </div>
          <div className="rs-hero__signals" aria-label="RepSync product focus">
            <span>Public coach profiles</span>
            <span>Applications</span>
            <span>PT Hub</span>
            <span>Client portal</span>
          </div>
          <div className="rs-hero__marketplace-card">
            <div className="rs-mini-directory">
              <div>
                <p className="rs-eyebrow">Live marketplace layer</p>
                <h2>Published coach profiles become searchable listings.</h2>
                <p>
                  Clients browse the first layer, then open the full coach
                  profile template to apply.
                </p>
              </div>
              {featuredCoach ? (
                <CoachCard profile={featuredCoach} />
              ) : (
                <div className="rs-mini-directory-empty">
                  <h3>Coach listings appear here after publishing.</h3>
                  <p>
                    The marketplace uses the same content coaches launch from PT
                    Hub.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rs-intro-strip" aria-label="RepSync lifecycle">
        <p>
          RepSync covers the relationship around the workout, not just the
          workout itself.
        </p>
        <dl>
          {lifecycleItems.slice(0, 3).map((item) => (
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

        <div className="rs-product-showcase">
          <article className="rs-showcase-main">
            <img
              src="/assets/feature-client-management.png"
              alt="RepSync client management dashboard with client status and coaching context."
              loading="lazy"
            />
            <div>
              <p className="rs-eyebrow">Coach workspace</p>
              <h3>Know who needs attention before the week slips.</h3>
              <p>
                See client status, check-in context, messages, notes, and next
                actions in one place.
              </p>
            </div>
          </article>

          <div className="rs-showcase-stack">
            <article>
              <img
                src="/assets/feature-public-profile.png"
                alt="RepSync public coach profile with lead capture."
                loading="lazy"
              />
              <h3>Public profiles that feel considered.</h3>
              <p>
                Give prospects a clear reason to trust you and a clear path to
                apply.
              </p>
            </article>
            <article>
              <img
                src="/assets/feature-client-home.png"
                alt="RepSync client home showing workouts, nutrition, habits, and check-ins."
                loading="lazy"
              />
              <h3>A client home that reduces confusion.</h3>
              <p>
                Clients see what to do next without digging through messages.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="rs-section" id="why" aria-labelledby="why-title">
        <SectionIntro
          eyebrow="Why RepSync"
          title="Premium enough for your brand. Practical enough for Monday."
          body="The site avoids false proof, fake testimonials, and inflated claims. The pitch is simple: a calmer operating system for the whole coaching relationship."
        />
        <div className="rs-feature-grid">
          {productPillars.map((pillar) => (
            <article key={pillar.title}>
              <span>{pillar.title}</span>
              <h3>
                {pillar.title === "Acquire"
                  ? "Create a better first step."
                  : pillar.title === "Coach"
                    ? "Run the client week."
                    : "Keep attention on drift."}
              </h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

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

      <section className="rs-status-section" aria-labelledby="status-title">
        <div>
          <p className="rs-eyebrow">Honest product status</p>
          <h2 id="status-title">Built for early access, shown clearly.</h2>
          <p>
            RepSync already includes the public marketplace, coach profiles,
            applications, PT Hub, and client workspace foundations. The site
            avoids making compliance, migration, or outcome claims that are not
            formally supported.
          </p>
        </div>
        <Link className="rs-button rs-button--quiet" to="/security">
          Read security notes
        </Link>
      </section>

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
        <Link className="rs-button" to="/request-access">
          Request early access
        </Link>
        <Link className="rs-button rs-button--quiet" to="/coaches">
          Browse coaches
        </Link>
      </div>
    </section>
  );
}

export function MarketingHomePage() {
  return (
    <MarketingLayout
      seo={{
        title: "RepSync | More than workout delivery",
        description:
          "RepSync is a premium coaching operating system for public profiles, applications, client delivery, attention cues, and coach marketplace discovery.",
        canonicalPath: "/",
      }}
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
      seo={{
        title: "Product | RepSync",
        description:
          "See how RepSync connects coach profiles, marketplace applications, PT Hub delivery, client workspaces, and retention attention cues.",
        canonicalPath: "/product",
      }}
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
        <div className="rs-product-showcase">
          <article className="rs-showcase-main">
            <img src="/assets/feature-coach-dashboard.png" alt="" />
            <div>
              <p className="rs-eyebrow">PT Hub</p>
              <h3>The control room for coaching operations.</h3>
              <p>
                Leads, clients, workspace health, packages, profile publishing,
                and follow-up context are grouped for operators.
              </p>
            </div>
          </article>
          <div className="rs-showcase-stack">
            <article>
              <img src="/assets/feature-public-profile.png" alt="" />
              <h3>Profile and marketplace</h3>
              <p>Publish a profile and make it discoverable.</p>
            </article>
            <article>
              <img src="/assets/feature-client-home.png" alt="" />
              <h3>Client portal</h3>
              <p>
                Give clients a cleaner view of the work and the next action.
              </p>
            </article>
          </div>
        </div>
      </section>
      <FinalCta />
    </MarketingLayout>
  );
}

export function ForCoachesPage() {
  return (
    <MarketingLayout
      seo={{
        title: "For Coaches | RepSync",
        description:
          "RepSync helps coaches publish profiles, manage applications, deliver coaching, and keep client attention organized.",
        canonicalPath: "/for-coaches",
      }}
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
      seo={{
        title: "For Clients | RepSync",
        description:
          "RepSync helps coaching clients find coaches, apply from public profiles, and understand the next action once coaching starts.",
        canonicalPath: "/for-clients",
      }}
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
            See product
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
      seo={{
        title: "Switch to RepSync",
        description:
          "Tell RepSync what you are switching from and what workflows matter most so the early access team can help you evaluate fit.",
        canonicalPath: "/switch",
      }}
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
    <ComparePage competitor="TrueCoach" canonicalPath="/compare/truecoach" />
  );
}

export function CompareFitrPage() {
  return <ComparePage competitor="Fitr" canonicalPath="/compare/fitr" />;
}

function ComparePage({
  competitor,
  canonicalPath,
}: {
  competitor: "TrueCoach" | "Fitr";
  canonicalPath: string;
}) {
  return (
    <MarketingLayout
      seo={{
        title: `RepSync vs ${competitor}`,
        description: `Compare RepSync's whole-coaching operating system positioning with ${competitor}.`,
        canonicalPath,
      }}
    >
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Compare</p>
        <h1>RepSync vs {competitor}</h1>
        <p className="rs-hero__lede">
          {competitor} is known in coaching software. RepSync is positioned
          around the broader business relationship: public discovery,
          applications, delivery, client attention, and retention.
        </p>
      </section>
      <section className="rs-section">
        <div className="rs-comparison-grid">
          <article>
            <h3>{competitor}</h3>
            <p>
              Often considered for coaching delivery workflows, programming, and
              client management.
            </p>
          </article>
          <article>
            <h3>RepSync</h3>
            <p>
              Designed to connect acquisition, coach profiles, applications,
              delivery, and attention cues from the start.
            </p>
          </article>
          <article>
            <h3>Best fit</h3>
            <p>
              Coaches who want a premium public front door and a calmer
              operating system, not only workout delivery.
            </p>
          </article>
        </div>
      </section>
      <FinalCta />
    </MarketingLayout>
  );
}

export function FaqPage() {
  return (
    <MarketingLayout
      seo={{
        title: "FAQ | RepSync",
        description:
          "Answers about RepSync early access, coach marketplace profiles, switching tools, pricing, and product status.",
        canonicalPath: "/faq",
      }}
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
      seo={{
        title: "Security | RepSync",
        description:
          "RepSync security notes for early access: account-based access, Supabase-backed data, and no unsupported compliance claims.",
        canonicalPath: "/security",
      }}
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
      seo={{
        title: "Request Early Access | RepSync",
        description:
          "Request early access to RepSync for your coaching business or small coaching team.",
        canonicalPath: "/request-access",
      }}
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

export function CookiesPage() {
  return (
    <MarketingLayout
      seo={{
        title: "Cookies | RepSync",
        description:
          "RepSync cookie notice for the public marketing website and application.",
        canonicalPath: "/cookies",
      }}
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
