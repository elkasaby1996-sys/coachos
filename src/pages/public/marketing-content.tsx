import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Dumbbell,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  MousePointerClick,
  Network,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserRound,
  UsersRound,
  Utensils,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import "../../styles/marketing-home.css";

type SeoConfig = {
  title: string;
  description: string;
  robots?: string;
};

type DemoFormState = {
  name: string;
  email: string;
  business: string;
  clients: string;
  message: string;
};

type Chapter = {
  id: string;
  label: string;
  title: string;
  body: string;
  points: string[];
};

const assetVersion = "20260724-stitch";

const stitchImages = {
  home: `/assets/stitch-repsync-home.png?v=${assetVersion}`,
  coaches: `/assets/stitch-repsync-coaches.png?v=${assetVersion}`,
  product: `/assets/stitch-repsync-product.png?v=${assetVersion}`,
};

const navItems = [
  { label: "Product", to: "/product" },
  { label: "For coaches", to: "/for-coaches" },
  { label: "For clients", to: "/for-clients" },
  { label: "Switch", to: "/switch" },
];

const journey = [
  ["01", "Public profile", "The relationship starts before an application."],
  ["02", "Application", "Prospect answers stay attached to the coaching context."],
  ["03", "Conversation", "Lead conversations remain part of the record."],
  ["04", "Approval", "The right prospects move forward with clarity."],
  ["05", "Onboarding", "Setup, expectations, and first actions stay connected."],
  ["06", "Coaching", "Programs, nutrition, habits, and messages share context."],
  ["07", "Check-in", "Progress review becomes part of the relationship history."],
  ["08", "Client attention", "Signals show who needs help and why."],
];

const productChapters: Chapter[] = [
  {
    id: "acquire",
    label: "01 / Acquire",
    title: "Turn interest into a structured coaching relationship.",
    body: "Publish a professional coach profile, collect applications, speak with prospects, and move the right people into coaching without losing the context that brought them there.",
    points: [
      "Public coach profile",
      "Prospect application",
      "Lead pipeline",
      "Lead conversations",
      "Approval and onboarding handoff",
    ],
  },
  {
    id: "coach",
    label: "02 / Coach",
    title: "Deliver the work without losing the context around it.",
    body: "Assign training, nutrition guidance, habits, and recurring check-ins while keeping messages and client history attached to the same coaching relationship.",
    points: [
      "Training programs",
      "Nutrition guidance",
      "Habits",
      "Recurring check-ins",
      "Coaching messages",
    ],
  },
  {
    id: "retain",
    label: "03 / Retain",
    title: "Know who needs attention and why.",
    body: "See the difference between where a client is in the journey and whether that client needs attention. Review the specific signal, then decide what to do next.",
    points: [
      "Lifecycle: Active",
      "Attention: At risk",
      "Reason: Missed latest check-in",
    ],
  },
];

const switchingSteps = [
  {
    label: "01 Review",
    body: "Map your current platform, active clients, programs, check-ins, and team workflow.",
  },
  {
    label: "02 Prepare",
    body: "Identify what can move, what should be recreated, and what should remain archived.",
  },
  {
    label: "03 Launch",
    body: "Configure access, verify active assignments, and move coaching over deliberately.",
  },
];

function usePublicSeo({ title, description, robots = "index,follow" }: SeoConfig) {
  useEffect(() => {
    document.documentElement.lang = "en";
    document.title = title;

    const ensureMeta = (selector: string, create: () => HTMLMetaElement) => {
      const existing = document.head.querySelector<HTMLMetaElement>(selector);
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

    ensureMeta('meta[name="robots"]', () => {
      const tag = document.createElement("meta");
      tag.name = "robots";
      return tag;
    }).content = robots;

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
  }, [description, robots, title]);
}

function BrandMark() {
  return (
    <Link className="rs-stitch-brand" to="/" aria-label="RepSync home">
      <span className="rs-stitch-brand__mark" aria-hidden="true">
        <Activity size={19} strokeWidth={2.2} />
      </span>
      <span>RepSync</span>
    </Link>
  );
}

function SiteLink({
  to,
  children,
  variant = "primary",
}: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "text";
}) {
  return (
    <Link className={`rs-stitch-button rs-stitch-button--${variant}`} to={to}>
      <span>{children}</span>
      {variant === "primary" ? <ArrowRight size={16} aria-hidden="true" /> : null}
    </Link>
  );
}

function SyncRail({ orientation = "h" }: { orientation?: "h" | "v" }) {
  return <span className={`rs-sync-rail rs-sync-rail--${orientation}`} aria-hidden="true" />;
}

function PublicLayout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(".rs-stitch-reveal"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [location.pathname]);

  return (
    <div className="rs-stitch-site">
      <a className="rs-stitch-skip" href="#main">
        Skip to content
      </a>
      <header className="rs-stitch-header">
        <BrandMark />
        <button
          className="rs-stitch-menu"
          type="button"
          aria-controls="rs-stitch-nav"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span className="sr-only">Toggle navigation</span>
        </button>
        <nav
          className={`rs-stitch-nav ${menuOpen ? "is-open" : ""}`}
          id="rs-stitch-nav"
          aria-label="Public navigation"
        >
          {navItems.map((item) => (
            <Link
              key={item.to}
              className={location.pathname === item.to ? "is-active" : ""}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={`rs-stitch-actions ${menuOpen ? "is-open" : ""}`}>
          <SiteLink to="/login" variant="text">
            Log in
          </SiteLink>
          <SiteLink to="/book-demo">Book a demo</SiteLink>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="rs-stitch-footer">
        <div>
          <BrandMark />
          <p>Precision through tactility for connected coaching operations.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link to="/product">Product</Link>
          <Link to="/for-coaches">For coaches</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/support">Support</Link>
        </nav>
      </footer>
    </div>
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
    <div className="rs-stitch-section-intro rs-stitch-reveal">
      <SyncRail />
      <p className="rs-stitch-kicker">{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

function ProductPreview({
  image,
  alt,
  caption,
  mediaTitle,
  mediaSpec,
}: {
  image: string;
  alt: string;
  caption: string;
  mediaTitle?: string;
  mediaSpec?: string;
}) {
  return (
    <figure
      className={`rs-stitch-preview rs-stitch-reveal ${
        mediaSpec ? "rs-stitch-preview--placeholder" : ""
      }`}
    >
      <div className="rs-stitch-preview__chrome" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {mediaSpec ? (
        <div className="rs-stitch-media-placeholder" role="img" aria-label={alt}>
          <div className="rs-stitch-media-placeholder__frame" aria-hidden="true">
            <LayoutDashboard size={34} strokeWidth={1.7} />
            <span />
          </div>
          <div>
            <p className="rs-stitch-kicker">Media placeholder</p>
            <h3>{mediaTitle}</h3>
            <p>{mediaSpec}</p>
          </div>
        </div>
      ) : (
        <img src={image} alt={alt} />
      )}
      <figcaption>
        <SyncRail orientation="v" />
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

function JourneyGrid() {
  return (
    <section className="rs-stitch-band rs-stitch-band--dark">
      <div className="rs-stitch-container">
        <SectionIntro
          eyebrow="Client journey"
          title="The coaching relationship does not begin with a workout."
          body="The original context should remain attached as a prospect becomes a client. RepSync keeps each stage connected to the relationship that follows."
        />
        <div className="rs-stitch-journey-grid">
          {journey.map(([number, title, body]) => (
            <article className="rs-stitch-journey-item rs-stitch-reveal" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChapterGrid() {
  const chapterLinks = {
    acquire: "Explore the acquisition workflow",
    coach: "Explore coaching delivery",
    retain: "Explore client attention",
  } as const;

  return (
    <div className="rs-stitch-chapter-grid">
      {productChapters.map((chapter) => (
        <article className="rs-stitch-chapter rs-stitch-reveal" key={chapter.id}>
          <p className="rs-stitch-kicker">{chapter.label}</p>
          <h3>{chapter.title}</h3>
          <p>{chapter.body}</p>
          <ul>
            {chapter.points.map((point) => (
              <li key={point}>
                <CheckCircle2 size={17} aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          {chapter.id === "coach" ? (
            <p className="rs-stitch-chapter__note">
              The client sees the plan. The coach retains the context.
            </p>
          ) : null}
          <SiteLink to="/product" variant="secondary">
            {chapterLinks[chapter.id as keyof typeof chapterLinks]}
          </SiteLink>
          <SyncRail />
        </article>
      ))}
    </div>
  );
}

function OperationsCards() {
  const cards = [
    {
      title: "Lead-to-client continuity",
      body: "Inquiry context, approval state, onboarding, and workspace setup move as one relationship.",
      icon: <MousePointerClick />,
    },
    {
      title: "Coaching delivery",
      body: "Programs, nutrition, habits, check-ins, progress, notes, and messages stay visible together.",
      icon: <Dumbbell />,
    },
    {
      title: "Attention signals",
      body: "Missed check-ins, stale leads, and client inactivity become operational cues instead of surprises.",
      icon: <ClipboardCheck />,
    },
    {
      title: "Small-team workspaces",
      body: "Owners, coaches, assistants, and viewers can work from the right level of visibility.",
      icon: <Network />,
    },
  ];

  return (
    <div className="rs-stitch-card-grid">
      {cards.map((card) => (
        <article className="rs-stitch-card rs-stitch-reveal" key={card.title}>
          <span className="rs-stitch-card__icon" aria-hidden="true">
            {card.icon}
          </span>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
        </article>
      ))}
    </div>
  );
}

function HomeSwitching() {
  return (
    <section className="rs-stitch-section rs-stitch-switching">
      <div className="rs-stitch-container">
        <div className="rs-stitch-switching__intro rs-stitch-reveal">
          <SyncRail />
          <p className="rs-stitch-kicker">Switching</p>
          <h2>Move more than your workout library.</h2>
          <p>
            Changing platforms affects active clients, current programs, check-in
            routines, communication, and team access, not only exercise templates.
          </p>
        </div>
        <div className="rs-stitch-switching__grid">
          {switchingSteps.map((step) => (
            <article className="rs-stitch-switch-card rs-stitch-reveal" key={step.label}>
              <p className="rs-stitch-kicker">{step.label}</p>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
        <div className="rs-stitch-switching__actions rs-stitch-reveal">
          <SiteLink to="/switch" variant="secondary">
            Moving from TrueCoach
          </SiteLink>
          <SiteLink to="/switch" variant="secondary">
            Moving from FITR
          </SiteLink>
          <SiteLink to="/switch">Plan your switch</SiteLink>
        </div>
      </div>
    </section>
  );
}

function FinalCta({
  title = "See how RepSync would fit your coaching operation.",
  body = "Book a focused 25-minute walkthrough based on your current tools, client volume, and coaching workflow.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="rs-stitch-cta rs-stitch-reveal">
      <SyncRail />
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="rs-stitch-cta__actions">
        <SiteLink to="/book-demo">Book a demo</SiteLink>
        <SiteLink to="/for-coaches" variant="secondary">
          Explore RepSync for coaches
        </SiteLink>
      </div>
      <p className="rs-stitch-cta__footnote">
        Focused on your workflow, not a generic feature tour.
      </p>
    </section>
  );
}

export function MarketingHomePage() {
  usePublicSeo({
    title: "RepSync | Connected coaching operations",
    description:
      "RepSync connects lead management, onboarding, coaching delivery, communication, and client attention in one operating system.",
  });

  return (
    <>
      <HomeIntroGate />
      <PublicLayout>
        <section className="rs-stitch-hero">
          <div className="rs-stitch-hero__copy rs-stitch-reveal is-visible">
            <p className="rs-stitch-kicker">
              Coaching infrastructure for independent trainers and small teams
            </p>
            <h1>From first inquiry to every check-in.</h1>
            <p>
              RepSync connects the work before a client joins with the coaching
              that follows: leads, onboarding, programs, nutrition, habits,
              check-ins, messaging, and client attention.
            </p>
            <div className="rs-stitch-hero__actions">
              <SiteLink to="/book-demo">Book a demo</SiteLink>
              <SiteLink to="/product" variant="secondary">
                Explore the product
              </SiteLink>
            </div>
            <p className="rs-stitch-hero__client-link">
              Using RepSync as a client?{" "}
              <Link to="/for-clients">View the client experience.</Link>
            </p>
          </div>
          <ProductPreview
            image={stitchImages.home}
            alt="Placeholder for the RepSync homepage hero media showing connected coaching operations."
            caption="One client relationship, connected from application to active coaching."
            mediaTitle="Hero product motion"
            mediaSpec="Use a 12-15 second silent product video or animated UI capture showing a prospect application becoming an active coaching client with leads, onboarding, programs, nutrition, habits, check-ins, messaging, and attention signals visible."
          />
        </section>

        <section className="rs-stitch-section">
          <div className="rs-stitch-container">
            <SectionIntro
              eyebrow="Audience pathways"
              title="Two sides of the coaching relationship."
              body="RepSync gives coaches the operational view and clients the focused experience they need, without forcing both sides through the same interface."
            />
            <div className="rs-stitch-pathways">
              <article className="rs-stitch-pathway rs-stitch-reveal">
                <p className="rs-stitch-kicker">For Coaches</p>
                <h3>Run the work before, during, and around every client relationship.</h3>
                <p>
                  Capture interest, move the right people into coaching, deliver
                  the work, run check-ins, and see who needs attention.
                </p>
                <SiteLink to="/for-coaches" variant="secondary">
                  Explore RepSync for coaches
                </SiteLink>
              </article>
              <SyncRail orientation="v" />
              <article className="rs-stitch-pathway rs-stitch-pathway--client rs-stitch-reveal">
                <p className="rs-stitch-kicker">For Clients</p>
                <h3>Open RepSync and know what matters today.</h3>
                <p>
                  See your training, nutrition guidance, habits, check-ins,
                  messages, and progress in one clear coaching experience.
                </p>
                <SiteLink to="/for-clients" variant="secondary">
                  Explore the client experience
                </SiteLink>
              </article>
            </div>
          </div>
        </section>

        <JourneyGrid />

        <section className="rs-stitch-section">
          <div className="rs-stitch-container">
            <SectionIntro
              eyebrow="Acquire / Coach / Retain"
              title="Acquire, coach, and retain from the same operating rhythm."
              body="Turn interest into a structured relationship, deliver the work in context, and see who needs attention before silence becomes churn."
            />
            <ChapterGrid />
          </div>
        </section>

        <section className="rs-stitch-section rs-stitch-section--sage">
          <div className="rs-stitch-container rs-stitch-client-grid">
            <ProductPreview
              image={stitchImages.product}
              alt="Placeholder for RepSync client experience media showing the focused client app surface."
              caption="The operational system stays with the coach. The client gets a focused coaching experience."
              mediaTitle="Client experience screen"
              mediaSpec="Use a clean mobile-first screenshot or short looping capture of the client home view: today's workout, nutrition guidance, active habits, next check-in, recent messages, and progress."
            />
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">Clear for the coach. Calm for the client.</p>
              <h2>Clear for the coach. Calm for the client.</h2>
              <p>
                Clients open RepSync and see what matters now: today's workout,
                nutrition guidance, active habits, their next check-in, recent
                messages, and progress.
              </p>
              <p>
                The operational system stays with the coach. The client gets a
                focused coaching experience.
              </p>
              <SiteLink to="/for-clients" variant="secondary">
                See the client experience
              </SiteLink>
            </div>
          </div>
        </section>

        <HomeSwitching />

        <FinalCta />
      </PublicLayout>
    </>
  );
}

function HomeIntroGate() {
  const [shouldShow, setShouldShow] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return false;
    }
    try {
      return window.sessionStorage.getItem("repsync_home_intro_seen") !== "true";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!shouldShow || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem("repsync_home_intro_seen", "true");
    } catch {
      // Session storage can be unavailable in privacy-restricted contexts.
    }
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <ProductIntro
      className="rs-product-intro--home"
      onAnimationEnd={() => setShouldShow(false)}
    />
  );
}

export function ProductPage() {
  usePublicSeo({
    title: "RepSync | Product Deep-Dive",
    description:
      "An architectural walkthrough of the RepSync ecosystem, from client acquisition to automated revenue tracking for high-performance coaches.",
  });

  return (
    <div className="rs-product-deep rs-product-reference">
      <ProductIntro />
      <ProductReferenceTopNav />
      <div className="rs-product-reference__shell">
        <ProductReferenceSideNav />
        <main className="rs-product-reference__main" id="main">
          <ProductReferenceHero />
          <ProductReferenceAcquire />
          <ProductReferenceOnboard />
          <ProductReferenceDeliver />
          <ProductReferenceCommunicate />
          <ProductReferenceCheckin />
          <ProductReferenceAttention />
          <ProductReferenceOperate />
          <ProductReferenceClientExperience />
          <ProductReferenceTeamAccess />
          <ProductReferenceCta />
          <ProductReferenceFooter />
        </main>
      </div>
    </div>
  );
}

function ProductIntro({
  className = "",
  onAnimationEnd,
}: {
  className?: string;
  onAnimationEnd?: () => void;
}) {
  const letters = "REPSYNC".split("");

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    document.body.classList.add("rs-intro-active");
    return () => document.body.classList.remove("rs-intro-active");
  }, []);

  return (
    <div
      id="intro-overlay"
      className={`rs-product-intro ${className}`.trim()}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.animationName === "product-intro-exit") {
          onAnimationEnd?.();
        }
      }}
    >
      <div className="rs-product-intro__content">
        <h1 aria-label="RepSync">
          {letters.map((letter, index) => (
            <span
              className="rs-product-intro__letter"
              key={`${letter}-${index}`}
              style={{ "--letter-index": index } as CSSProperties}
            >
              {letter}
            </span>
          ))}
        </h1>
        <span />
      </div>
    </div>
  );
}

const productReferenceNav = [
  ["#acquire", "01 Acquire", <MousePointerClick />],
  ["#onboard", "02 Onboard", <UserRound />],
  ["#deliver", "03 Deliver", <Dumbbell />],
  ["#communicate", "04 Communicate", <MessageSquare />],
  ["#checkin", "05 Check in", <ClipboardCheck />],
  ["#attention", "06 Identify Attention", <AlertTriangle />],
  ["#operate", "07 Operate", <Settings />],
  ["#experience", "08 Client Experience", <UserRound />],
  ["#team", "09 Team Access", <UsersRound />],
] as const;

function ProductReferenceTopNav() {
  return (
    <header className="rs-product-ref-top">
      <div className="rs-product-ref-top__brand">
        <Link to="/">RepSync</Link>
        <nav aria-label="Product navigation">
          <Link to="/product">Platform</Link>
          <Link className="is-active" to="/product">
            Experience
          </Link>
          <Link to="/pricing">Pricing</Link>
        </nav>
      </div>
      <div className="rs-product-ref-top__actions">
        <Link to="/for-coaches">For Coaches</Link>
        <Link to="/book-demo">Book a demo</Link>
      </div>
    </header>
  );
}

function ProductReferenceSideNav() {
  return (
    <aside className="rs-product-ref-side" aria-label="Product deep-dive chapters">
      <div className="rs-product-ref-side__title">
        <p>The OS</p>
        <h2>Product Deep Dive</h2>
      </div>
      <nav>
        {productReferenceNav.map(([href, label, icon], index) => (
          <a className={index === 0 ? "is-active" : ""} href={href} key={href}>
            {icon}
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <div className="rs-product-ref-side__demo">
        <p>Want to see the system live in action with your own data?</p>
        <Link to="/book-demo">Watch Demo</Link>
      </div>
    </aside>
  );
}

function ProductReferenceHero() {
  return (
    <section className="rs-product-ref-hero">
      <SyncRail />
      <h1>
        Architecting the <em>Perfect</em> Coaching Workflow.
      </h1>
      <p>
        RepSync is the operational backbone for elite personal trainers. From
        the first inquiry to scaling a high-performance team, every touchpoint
        is designed for precision, tactility, and human-first engagement.
      </p>
    </section>
  );
}

function ProductMediaPlaceholder({
  title,
  body,
  variant = "panel",
}: {
  title: string;
  body: string;
  variant?: "panel" | "phone" | "chat";
}) {
  return (
    <div className={`rs-product-ref-media rs-product-ref-media--${variant}`} role="img" aria-label={body}>
      <span className="rs-product-ref-media__icon" aria-hidden="true">
        {variant === "chat" ? <MessageSquare size={34} /> : <LayoutDashboard size={34} />}
      </span>
      <div>
        <p className="rs-product-ref-label">Media placeholder</p>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

function ProductReferenceAcquire() {
  return (
    <section className="rs-product-ref-section rs-product-ref-section--split" id="acquire">
      <div>
        <p className="rs-product-ref-label">01 Acquire</p>
        <h2>Convert Visitors into Committed Clients.</h2>
        <p>
          Your brand deserves more than a generic link-in-bio. Deploy
          professional public profiles with integrated application pipelines
          that qualify leads before they ever reach your inbox.
        </p>
        <ul className="rs-product-ref-checks">
          {[
            "Customizable intake questionnaires",
            "Automated qualification scoring",
            "Branded application landing pages",
          ].map((item) => (
            <li key={item}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <ProductMediaPlaceholder
        title="Application pipeline UI"
        body="Replace with a high-fidelity product screenshot showing a coach public profile, application intake, and qualified lead pipeline."
      />
    </section>
  );
}

function ProductReferenceOnboard() {
  return (
    <section className="rs-product-ref-section rs-product-ref-section--center" id="onboard">
      <span className="rs-product-ref-vertical-rail" aria-hidden="true" />
      <p className="rs-product-ref-label">02 Onboard</p>
      <h2>Frictionless Welcome.</h2>
      <p>
        Automate contracts, payments, and diagnostic tests so your clients start
        winning on day one.
      </p>
    </section>
  );
}

function ProductReferenceDeliver() {
  const cards = [
    [<Dumbbell />, "Smart Programming", "Library of 1,500+ HD movements with the ability to upload your own proprietary technique videos."],
    [<Utensils />, "Dynamic Nutrition", "Calorie and macro targets that can be auto-adjusted based on workout volume or progress milestones."],
    [<Network />, "Habit Stacking", "Configure daily reminders for non-negotiables like hydration, steps, and sleep quality."],
  ] as const;

  return (
    <section className="rs-product-ref-section rs-product-ref-deliver" id="deliver">
      <span className="rs-product-ref-vertical-rail" aria-hidden="true" />
      <div className="rs-product-ref-section__center-copy">
        <p className="rs-product-ref-label">03 Deliver</p>
        <h2>Program Design at Scale.</h2>
        <p>
          Build complex training hierarchies, nutrition targets, and habit
          triggers in seconds, not hours.
        </p>
      </div>
      <div className="rs-product-ref-card-grid">
        {cards.map(([icon, title, body]) => (
          <article key={title}>
            <span aria-hidden="true">{icon}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductReferenceCommunicate() {
  return (
    <section className="rs-product-ref-section rs-product-ref-section--split" id="communicate">
      <div>
        <p className="rs-product-ref-label">04 Communicate</p>
        <h2>Contextual Chat.</h2>
        <p>
          Message clients with workout and nutrition data directly in the
          thread. No more context switching.
        </p>
      </div>
      <ProductMediaPlaceholder
        title="Contextual chat UI"
        body="Replace with a product screenshot showing messages beside workout, nutrition, and check-in context."
        variant="chat"
      />
    </section>
  );
}

function ProductReferenceCheckin() {
  return (
    <section className="rs-product-ref-section rs-product-ref-checkin" id="checkin">
      <p className="rs-product-ref-label">05 Check in</p>
      <h2>Deep Diagnostics.</h2>
      <p>
        Weekly check-ins that aggregate biofeedback, performance, and subjective
        well-being into a single readable scorecard.
      </p>
    </section>
  );
}

function ProductReferenceAttention() {
  return (
    <section className="rs-product-ref-attention" id="attention">
      <div>
        <p className="rs-product-ref-label">06 Identify Attention</p>
        <h2>Predict Churn Before it Happens.</h2>
        <p>
          Do not wait for a client to stop paying. RepSync's proprietary
          Attention Signals highlight missed check-ins and inactivity before
          they become cancellations.
        </p>
        <div className="rs-product-ref-alerts">
          <article>
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <h3>Missed Check-in (2d ago)</h3>
              <p>Sarah M. requires immediate outreach to maintain momentum.</p>
            </div>
          </article>
          <article>
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <h3>At Risk (Low Engagement)</h3>
              <p>David K.'s app sessions have dropped 60% over the last week.</p>
            </div>
          </article>
        </div>
      </div>
      <div className="rs-product-ref-pulse">
        <span>Pulse Engine</span>
        <strong>Tactile Intelligence.</strong>
      </div>
    </section>
  );
}

function ProductReferenceOperate() {
  return (
    <section className="rs-product-ref-section rs-product-ref-section--center" id="operate">
      <p className="rs-product-ref-label">07 Operate</p>
      <h2>Command Center.</h2>
      <p>
        Revenue tracking, lead pipelines, and administrative workflows in one
        unified view.
      </p>
    </section>
  );
}

function ProductReferenceClientExperience() {
  return (
    <section className="rs-product-ref-section rs-product-ref-experience" id="experience">
      <ProductMediaPlaceholder
        title="Client today view"
        body="Replace with a real mobile app screenshot showing workout logged, daily plan, nutrition, check-in, and message context."
        variant="phone"
      />
      <div>
        <p className="rs-product-ref-label">08 Client Experience</p>
        <h2>A Dashboard They Will Actually Use.</h2>
        <p>
          Engagement is the byproduct of clarity. The Today View strips away the
          noise, focusing your clients on the three things that matter:
          movement, fuel, and communication.
        </p>
        <article className="rs-product-ref-note">
          <h3>Tactile Interactions</h3>
          <p>
            Every completion, every check-in, and every message feels
            intentional through haptic-inspired UI and smooth transitions.
          </p>
        </article>
      </div>
    </section>
  );
}

function ProductReferenceTeamAccess() {
  return (
    <section className="rs-product-ref-section rs-product-ref-team" id="team">
      <p className="rs-product-ref-label">09 Team Access</p>
      <h2>Scale Together.</h2>
      <p>
        Add assistant coaches, nutritionists, and VAs with granular permission
        levels. Scale your impact without losing the human touch.
      </p>
    </section>
  );
}

function ProductReferenceCta() {
  return (
    <section className="rs-product-ref-cta">
      <SyncRail />
      <h2>Ready to sync your workflow?</h2>
      <div>
        <Link to="/book-demo">Book a demo</Link>
        <Link to="/for-coaches">Talk to a Coach</Link>
      </div>
    </section>
  );
}

function ProductReferenceFooter() {
  return (
    <footer className="rs-product-ref-footer">
      <Link to="/">RepSync</Link>
      <nav aria-label="Product footer">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
        <Link to="/security">Security</Link>
        <Link to="/support">Contact</Link>
      </nav>
      <p>(c) 2026 RepSync. Precision through Tactility.</p>
    </footer>
  );
}

function ProductSideNav() {
  const items = [
    ["#command", "Dashboard", <LayoutDashboard />],
    ["#architecture", "Workouts", <Dumbbell />],
    ["#signals", "Analytics", <BarChart3 />],
    ["#teams", "Athletes", <UsersRound />],
    ["#delivery", "Nutrition", <Utensils />],
  ] as const;

  return (
    <aside className="rs-product-sidebar" aria-label="Product deep-dive navigation">
      <div>
        <Link className="rs-product-sidebar__brand" to="/">
          RepSync
        </Link>
        <p>High-performance OS</p>
      </div>
      <nav>
        {items.map(([href, label, icon], index) => (
          <a className={index === 2 ? "is-active" : ""} href={href} key={label}>
            {icon}
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <div className="rs-product-sidebar__footer">
        <Link to="/support">
          <ShieldCheck size={18} />
          <span>Support</span>
        </Link>
        <Link to="/login">
          <UserRound size={18} />
          <span>Account</span>
        </Link>
        <Link className="rs-product-sidebar__cta" to="/book-demo">
          New session
        </Link>
      </div>
    </aside>
  );
}

function ProductMobileTopBar() {
  return (
    <header className="rs-product-mobile-top">
      <Link to="/">RepSync</Link>
      <div>
        <Settings size={19} />
        <span aria-hidden="true" />
      </div>
    </header>
  );
}

function ProductDeepHero() {
  return (
    <section className="rs-product-hero">
      <div className="rs-product-rail" aria-hidden="true">
        <span />
        <span />
      </div>
      <p className="rs-product-eyebrow">The OS for Elite Performance</p>
      <h1>Product Deep-Dive</h1>
      <p>
        An architectural walkthrough of the RepSync ecosystem. From client
        acquisition to automated revenue tracking, explore the core modules
        designed for high-performance coaches.
      </p>
    </section>
  );
}

function ProductCommandCenter() {
  return (
    <section className="rs-product-command" id="command">
      <article className="rs-product-command__primary">
        <div>
          <p className="rs-product-eyebrow">Command Center</p>
          <h2>Revenue Intelligence</h2>
          <div className="rs-product-kpi-row">
            <div>
              <span>MRR Growth</span>
              <strong>+24.8%</strong>
            </div>
            <div>
              <span>Retention</span>
              <strong>94.2%</strong>
            </div>
          </div>
        </div>
        <div className="rs-product-bars" aria-hidden="true">
          {[40, 60, 45, 80, 70, 95].map((height) => (
            <span key={height} style={{ height: `${height}%` }} />
          ))}
        </div>
      </article>
      <article className="rs-product-command__billing">
        <CreditCard size={40} />
        <div>
          <h3>Automated Billing</h3>
          <p>
            Reduce churn with smart failed-payment retries and tiered membership
            flows.
          </p>
        </div>
      </article>
    </section>
  );
}

function ProductArchitecture() {
  const modules = [
    ["01 / Acquire", "Client Intake", "Custom lead magnets and funnel builders designed for fitness and high-ticket coaching."],
    ["02 / Onboard", "Automated Welcome", "Forms, contracts, and baseline assessments trigger from a clean onboarding path."],
    ["03 / Deliver", "The Training Engine", "Workout building with structured progressions, libraries, and delivery context."],
    ["04 / Communicate", "Smart Inbox", "Unified coaching communication with client context attached to the thread."],
    ["05 / Check-in", "Bio-Feedback Loops", "Adaptive check-ins that organize subjective and performance markers."],
    ["06 / Identify", "Attention Signals", "Alerts for missed habits, plateaus, or decreasing engagement before the relationship drifts."],
  ];

  return (
    <section className="rs-product-section" id="architecture">
      <div className="rs-product-section__title">
        <h2>Core Architecture</h2>
        <span />
      </div>
      <div className="rs-product-module-grid">
        {modules.map(([eyebrow, title, body]) => (
          <article className="rs-product-module" key={eyebrow}>
            <div className="rs-product-rail" aria-hidden="true">
              <span />
              <span />
            </div>
            <p className="rs-product-eyebrow">{eyebrow}</p>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductSignals() {
  const signals = [
    {
      icon: <AlertTriangle />,
      title: "Missed Check-in - Client: Acme Corp",
      time: "Triggered 2 hours ago",
      note:
        "The semantic engine noticed a missed check-in for Acme Corp. Auto-follow-up prepared for coach review.",
      tone: "danger",
    },
    {
      icon: <TrendingUp />,
      title: "Engagement Dip - Athlete Roster",
      time: "Triggered this morning",
      note:
        "Three active clients have lower completion momentum than their previous two-week baseline.",
      tone: "clay",
    },
  ];

  return (
    <section className="rs-product-signals" id="signals">
      <div className="rs-product-window">
        <header>
          <h2>Attention Signals</h2>
          <div>
            <span />
            <p>Live feed</p>
          </div>
        </header>
        <div>
          {signals.map((signal) => (
            <article className="rs-product-signal" data-tone={signal.tone} key={signal.title}>
              <div className="rs-product-signal__top">
                <div className="rs-product-signal__identity">
                  <span>{signal.icon}</span>
                  <div>
                    <h3>{signal.title}</h3>
                    <p>{signal.time}</p>
                  </div>
                </div>
                <button type="button">Resolved</button>
              </div>
              <div className="rs-product-note">
                <p>Coaching Notes</p>
                <blockquote>{signal.note}</blockquote>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductDelivery() {
  return (
    <section className="rs-product-delivery" id="delivery">
      <div className="rs-product-delivery__visual">
        <div className="rs-product-delivery__rail" aria-hidden="true" />
        <div className="rs-product-nutrition-ui">
          <header>
            <h3>Nutrition Plan</h3>
            <p>Block 04 / Performance</p>
          </header>
          <div className="rs-product-macro-grid">
            {[
              ["Protein", "182g"],
              ["Carbs", "310g"],
              ["Fat", "74g"],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="rs-product-plan-list">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
      <div className="rs-product-delivery__copy">
        <p className="rs-product-eyebrow">Delivery Engine</p>
        <h2>
          Programs & Nutrition, <em>Composed.</em>
        </h2>
        <p>
          Build periodization cycles and nuanced nutrition plans with the same
          fluidity as writing an email. The composition engine handles the math
          so coaches can focus on the biology.
        </p>
        <div>
          <article>
            <Utensils size={22} />
            <div>
              <h3>Macro-Precision</h3>
              <p>Dynamic adjustments based on training volume syncs.</p>
            </div>
          </article>
          <article>
            <Dumbbell size={22} />
            <div>
              <h3>Protocol Templates</h3>
              <p>Save signature methods and deploy them in seconds.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function ProductTeams() {
  return (
    <section className="rs-product-teams" id="teams">
      <div>
        <h2>Designed for Teams</h2>
        <p>
          Scaling should not mean losing control. Precision permissions for
          every role.
        </p>
      </div>
      <div className="rs-product-team-grid">
        {[
          ["Owner", "Full visibility, financial controls, and master settings."],
          ["Assistant", "Manage inquiries, update logs, and handle schedules."],
          ["Viewer", "Read-only access for guest consultants or specialists."],
        ].map(([role, body]) => (
          <article key={role}>
            <h3>{role}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductBusinessVisibility() {
  return (
    <section className="rs-product-business" id="visibility">
      <div className="rs-product-business__header">
        <div>
          <p className="rs-product-eyebrow">Intelligence</p>
          <h2>Business Visibility</h2>
          <p>
            Real-time health metrics for the coaching business. Know churn, LTV,
            conversion, and workload without spreadsheets.
          </p>
        </div>
        <div className="rs-product-mini-kpis">
          <article>
            <strong>94%</strong>
            <span>Retention</span>
          </article>
          <article>
            <strong>$4.2k</strong>
            <span>Avg MRR / coach</span>
          </article>
        </div>
      </div>
      <div className="rs-product-dashboard">
        <header>
          <span />
          <span />
          <span />
        </header>
        <div>
          <aside>
            <p>Quarterly Goal</p>
            <div><span /></div>
            <nav>
              <a href="#command"><Gauge size={15} />Overview</a>
              <a href="#visibility"><TrendingUp size={15} />Growth</a>
              <a href="#teams"><UsersRound size={15} />Athletes</a>
              <a href="#command"><CreditCard size={15} />Revenue</a>
            </nav>
          </aside>
          <section>
            <div className="rs-product-chart" aria-hidden="true">
              {[36, 48, 42, 64, 58, 74, 88, 80].map((height) => (
                <span key={height} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="rs-product-dashboard__tiles">
              <span />
              <span />
              <span />
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function ProductDeepCta() {
  return (
    <section className="rs-product-final">
      <h2>
        Elevate your <em>Operation.</em>
      </h2>
      <p>
        The premium platform for coaches who demand the same precision from
        their business as they do from their athletes.
      </p>
      <div>
        <Link to="/book-demo">Request access</Link>
        <Link to="/support">Talk to sales</Link>
      </div>
      <span>Currently onboarding selective teams only</span>
    </section>
  );
}

function ProductMobileNav() {
  return (
    <nav className="rs-product-mobile-nav" aria-label="Mobile product navigation">
      {[
        ["#main", "Home", <LayoutDashboard />],
        ["#architecture", "Plan", <ClipboardCheck />],
        ["#delivery", "Log", <Dumbbell />],
        ["#visibility", "Stats", <BarChart3 />],
      ].map(([href, label, icon], index) => (
        <a className={index === 0 ? "is-active" : ""} href={href as string} key={label as string}>
          {icon}
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}

export function ForCoachesPage() {
  usePublicSeo({
    title: "For coaches | RepSync",
    description:
      "Run the business around your coaching with RepSync lead continuity, delivery workflows, attention signals, and team workspaces.",
  });

  return (
    <PublicLayout>
      <section className="rs-stitch-page-hero">
        <div className="rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">For coaches</p>
          <h1>Run the business around your coaching.</h1>
          <p>
            Manage the journey from first inquiry to active coaching without
            splitting leads, delivery, check-ins, communication, and client
            attention.
          </p>
          <div className="rs-stitch-hero__actions">
            <SiteLink to="/book-demo">Book a demo</SiteLink>
            <SiteLink to="/switch" variant="secondary">
              Plan your switch
            </SiteLink>
          </div>
        </div>
        <ProductPreview
          image={stitchImages.coaches}
          alt="RepSync for coaches Stitch concept with coach-focused operations layout."
          caption="UI-04: coach business workflow and attention model"
        />
      </section>
      <section className="rs-stitch-section rs-stitch-section--sage">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="Where operations break"
            title="The friction is usually between intake and impact."
          />
          <OperationsCards />
        </div>
      </section>
      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="Business visibility"
            title="The metrics that move the coaching relationship."
            body="RepSync emphasizes lead conversion, roster health, delivery workload, check-in urgency, and team visibility."
          />
          <div className="rs-stitch-metrics">
            {[
              ["24.8%", "Lead conversion context"],
              ["42", "Active leads in motion"],
              ["03", "Urgent check-ins flagged"],
            ].map(([value, label]) => (
              <article className="rs-stitch-metric rs-stitch-reveal" key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
        </div>
      </section>
      <FinalCta title="Find out if RepSync fits your coaching operation." />
    </PublicLayout>
  );
}

export function ForClientsPage() {
  usePublicSeo({
    title: "For clients | RepSync",
    description:
      "RepSync gives coaching clients a focused daily view for workouts, nutrition, habits, messages, check-ins, and progress.",
  });

  return (
    <PublicLayout>
      <section className="rs-stitch-page-hero rs-stitch-page-hero--text">
        <div className="rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">For clients</p>
          <h1>A calmer daily coaching view.</h1>
          <p>
            Clients should see what matters today: movement, fuel, habits,
            messages, and check-ins, without needing to understand the business
            system behind their coach.
          </p>
          <div className="rs-stitch-hero__actions">
            <SiteLink to="/coaches">Browse coaches</SiteLink>
            <SiteLink to="/signup/client" variant="secondary">
              Client signup
            </SiteLink>
          </div>
        </div>
      </section>
      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <OperationsCards />
        </div>
      </section>
    </PublicLayout>
  );
}

export function SwitchPage() {
  usePublicSeo({
    title: "Switch to RepSync",
    description:
      "Plan a move to RepSync by reviewing your current tools, active clients, templates, and launch workflow.",
  });

  return (
    <PublicLayout>
      <section className="rs-stitch-page-hero rs-stitch-page-hero--text">
        <div className="rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">Migration protocol</p>
          <h1>Move only after the workflow is clear.</h1>
          <p>
            RepSync does not promise an instant one-click migration. The safest
            switch starts by mapping what you use today and what needs to remain
            available during launch.
          </p>
        </div>
      </section>
      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <div className="rs-stitch-steps">
            {[
              ["01", "Review", "Map current platforms, spreadsheets, forms, and active-client work."],
              ["02", "Prepare", "Decide what can be imported, recreated, archived, or launched manually."],
              ["03", "Launch", "Invite clients deliberately so service continuity stays clear."],
            ].map(([number, title, body]) => (
              <article className="rs-stitch-step rs-stitch-reveal" key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <FinalCta title="Plan the switch with the workflow in front of you." />
    </PublicLayout>
  );
}

export function PricingPage() {
  usePublicSeo({
    title: "Pricing | RepSync",
    description:
      "RepSync pricing is handled through early-access conversations while the product is still being shaped.",
  });

  return (
    <PublicLayout>
      <section className="rs-stitch-page-hero rs-stitch-page-hero--text">
        <div className="rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">Pricing</p>
          <h1>Early-access pricing, matched to the operation.</h1>
          <p>
            Public pricing is not finalized. Book a demo so RepSync can map your
            coaching model, client count, team structure, and launch needs.
          </p>
          <div className="rs-stitch-hero__actions">
            <SiteLink to="/book-demo">Book a demo</SiteLink>
          </div>
        </div>
      </section>
      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <div className="rs-stitch-pricing">
            {[
              ["Profile", "Public profile, packages, applications, and first impression."],
              ["Coach OS", "Lead context, client delivery, check-ins, and operating visibility."],
              ["Studio", "Small-team workspaces, roles, handoff, and setup support."],
            ].map(([name, body]) => (
              <article className="rs-stitch-price rs-stitch-reveal" key={name}>
                <p className="rs-stitch-kicker">{name}</p>
                <h3>Contact</h3>
                <p>{body}</p>
                <SiteLink to="/book-demo" variant="secondary">
                  Discuss fit
                </SiteLink>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function validateDemoForm(values: DemoFormState) {
  const errors: Partial<Record<keyof DemoFormState, string>> = {};
  if (!values.name.trim()) errors.name = "Enter your name.";
  if (!/\S+@\S+\.\S+/.test(values.email.trim())) errors.email = "Enter a valid email.";
  if (!values.business.trim()) errors.business = "Add your coaching business type.";
  if (!values.clients.trim()) errors.clients = "Add an approximate client count.";
  if (values.message.trim().length < 12) errors.message = "Add a little context.";
  return errors;
}

export function DemoPage() {
  usePublicSeo({
    title: "Book a demo | RepSync",
    description:
      "Book a RepSync demo and map the product to your lead flow, client count, delivery model, and team structure.",
  });

  const [values, setValues] = useState<DemoFormState>({
    name: "",
    email: "",
    business: "",
    clients: "",
    message: "",
  });
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const errors = useMemo(() => (touched ? validateDemoForm(values) : {}), [touched, values]);

  const updateField =
    (field: keyof DemoFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setSent(false);
    };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    const nextErrors = validateDemoForm(values);
    if (Object.keys(nextErrors).length > 0) return;
    setSent(true);
    setValues({ name: "", email: "", business: "", clients: "", message: "" });
    setTouched(false);
  };

  return (
    <PublicLayout>
      <section className="rs-stitch-form-page">
        <div className="rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">Demo and contact</p>
          <h1>Map RepSync to your coaching business.</h1>
          <p>
            Share a few details and RepSync can prepare a walkthrough around
            your lead flow, client count, delivery model, and workspace needs.
          </p>
        </div>
        <form className="rs-stitch-form rs-stitch-reveal is-visible" onSubmit={handleSubmit} noValidate>
          <div className="rs-stitch-form__grid">
            <FieldBlock id="demo-name" label="Name" error={errors.name}>
              <Input id="demo-name" value={values.name} onChange={updateField("name")} autoComplete="name" />
            </FieldBlock>
            <FieldBlock id="demo-email" label="Email" error={errors.email}>
              <Input id="demo-email" type="email" value={values.email} onChange={updateField("email")} autoComplete="email" />
            </FieldBlock>
          </div>
          <div className="rs-stitch-form__grid">
            <FieldBlock id="demo-business" label="Business type" error={errors.business}>
              <Input id="demo-business" value={values.business} onChange={updateField("business")} placeholder="Online coach, studio, hybrid PT" />
            </FieldBlock>
            <FieldBlock id="demo-clients" label="Active clients" error={errors.clients}>
              <Input id="demo-clients" value={values.clients} onChange={updateField("clients")} placeholder="Example: 25 active clients" />
            </FieldBlock>
          </div>
          <FieldBlock id="demo-message" label="Message" error={errors.message}>
            <Textarea
              id="demo-message"
              value={values.message}
              onChange={updateField("message")}
              placeholder="Tell us what you want to clean up first."
              rows={6}
            />
          </FieldBlock>
          {sent ? (
            <p className="rs-stitch-success" role="status">
              Demo request captured locally. Wire this form to your preferred inbox or CRM before launch.
            </p>
          ) : null}
          <Button className="rs-stitch-submit" type="submit">
            Request demo
            <ArrowRight size={16} />
          </Button>
        </form>
      </section>
    </PublicLayout>
  );
}

function FieldBlock({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="rs-stitch-field">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p>{error}</p> : null}
    </div>
  );
}

export function BookDemoPage() {
  return <DemoPage />;
}

export function RequestAccessPage() {
  return <DemoPage />;
}

export function CoachesPage() {
  usePublicSeo({
    title: "Browse coaches | RepSync",
    description: "Browse public RepSync coach profiles as they become available.",
  });

  return (
    <PublicLayout>
      <section className="rs-stitch-page-hero rs-stitch-page-hero--text">
        <div className="rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">Coach marketplace</p>
          <h1>Public coach discovery is being prepared.</h1>
          <p>
            Published coach profiles can appear here when marketplace visibility
            is enabled. Until then, explore how RepSync supports coaches.
          </p>
          <div className="rs-stitch-hero__actions">
            <SiteLink to="/for-coaches">For coaches</SiteLink>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function SimpleInfoPage({
  eyebrow,
  title,
  description,
  children,
  robots,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  robots?: string;
}) {
  usePublicSeo({ title: `${title} | RepSync`, description, robots });
  return (
    <PublicLayout>
      <section className="rs-stitch-page-hero rs-stitch-page-hero--text">
        <div className="rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>
      <section className="rs-stitch-section">
        <div className="rs-stitch-container">{children}</div>
      </section>
    </PublicLayout>
  );
}

function InfoGrid({ items }: { items: Array<[ReactNode, string, string]> }) {
  return (
    <div className="rs-stitch-card-grid">
      {items.map(([icon, title, body]) => (
        <article className="rs-stitch-card rs-stitch-reveal" key={title}>
          <span className="rs-stitch-card__icon" aria-hidden="true">
            {icon}
          </span>
          <h3>{title}</h3>
          <p>{body}</p>
        </article>
      ))}
    </div>
  );
}

export function FaqPage() {
  return (
    <SimpleInfoPage
      eyebrow="FAQ"
      title="Useful answers. No inflated claims."
      description="RepSync is an early-access coaching operating system focused on lead continuity, delivery clarity, and attention visibility."
    >
      <div className="rs-stitch-faq">
        {[
          ["Is RepSync only for workout programming?", "No. Programming is part of the workflow, but RepSync is positioned around the whole coaching relationship."],
          ["Can RepSync replace spreadsheets and DMs?", "It can reduce the need for scattered tools by keeping leads, clients, check-ins, and delivery context together."],
          ["Is pricing public?", "Not yet. Pricing is handled through early-access conversations."],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </SimpleInfoPage>
  );
}

export function SecurityPage() {
  return (
    <SimpleInfoPage
      eyebrow="Security"
      title="Access should follow the coaching relationship."
      description="RepSync separates public profile surfaces from private coaching data and keeps security claims conservative until formal reviews are complete."
    >
      <InfoGrid
        items={[
          [<LockKeyhole />, "Authenticated private areas", "Private app routes require account access through the configured auth flow."],
          [<UsersRound />, "Workspace role boundaries", "Team access is organized around owner, coach, assistant, and viewer responsibilities."],
          [<ShieldCheck />, "No unsupported certification claims", "The public site avoids HIPAA, SOC 2, ISO, and uptime guarantees unless formally verified."],
        ]}
      />
    </SimpleInfoPage>
  );
}

export function PrivacyPage() {
  return (
    <SimpleInfoPage
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This conservative privacy notice draft covers account, profile, client coaching, application, and marketing-form information. It needs legal review before production launch."
    >
      <InfoGrid
        items={[
          [<UsersRound />, "Account and profile information", "RepSync may process identity, email, profile, workspace, and coach-controlled public profile details."],
          [<ClipboardCheck />, "Coaching information", "Private coaching areas may include programs, nutrition, habits, check-ins, messages, notes, progress, and wearable context."],
          [<MessageSquare />, "Marketing forms", "Demo and switch forms collect contact details and operational context so the team can respond."],
        ]}
      />
    </SimpleInfoPage>
  );
}

export function TermsPage() {
  return (
    <SimpleInfoPage
      eyebrow="Terms"
      title="Terms of Service"
      description="These draft terms describe expected use of RepSync public and app surfaces. They require legal review before production launch."
    >
      <InfoGrid
        items={[
          [<CheckCircle2 />, "Account responsibility", "Users are responsible for accurate account information and secure credentials."],
          [<ShieldCheck />, "Acceptable use", "Do not misuse RepSync, attempt unauthorized access, or interfere with service operation."],
          [<Dumbbell />, "Coach responsibility", "Coaches remain responsible for coaching content, client communication, and professional obligations."],
        ]}
      />
    </SimpleInfoPage>
  );
}

export function CookiesPage() {
  return (
    <SimpleInfoPage
      eyebrow="Cookies"
      title="Cookie notice"
      description="RepSync uses essential browser storage for app operation. Optional analytics should remain consent-based before production launch."
    >
      <InfoGrid
        items={[
          [<LockKeyhole />, "Essential", "Required for authentication, route state, security-sensitive operation, and saved preferences."],
          [<BarChart3 />, "Analytics", "Optional public-site usage events should exclude personal, health, and private client data."],
        ]}
      />
    </SimpleInfoPage>
  );
}

export function SupportPage() {
  return (
    <SimpleInfoPage
      eyebrow="Support"
      title="Support"
      description="For product, billing, privacy, or security questions, use your configured RepSync support inbox before production launch."
    >
      <FinalCta title="Need a product walkthrough?" />
    </SimpleInfoPage>
  );
}

export function CompareTrueCoachPage() {
  return <ComparisonPage competitor="TrueCoach" />;
}

export function CompareFitrPage() {
  return <ComparisonPage competitor="FITR" />;
}

function ComparisonPage({ competitor }: { competitor: string }) {
  return (
    <SimpleInfoPage
      eyebrow="Comparison"
      title={`RepSync compared with ${competitor}`}
      description={`Use this page as a conservative switching summary. RepSync emphasizes lead continuity, delivery context, attention visibility, and small-team operations.`}
    >
      <OperationsCards />
    </SimpleInfoPage>
  );
}

export function MarketingNotFoundPage() {
  return (
    <SimpleInfoPage
      eyebrow="404"
      title="Page not found"
      description="The RepSync page you requested could not be found."
      robots="noindex,nofollow"
    >
      <div className="rs-stitch-hero__actions">
        <SiteLink to="/">Go home</SiteLink>
        <SiteLink to="/product" variant="secondary">
          Explore product
        </SiteLink>
      </div>
    </SimpleInfoPage>
  );
}
