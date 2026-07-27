import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
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
import { AppFooter } from "../../components/common/app-footer";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { supabase } from "../../lib/supabase";
import { usePublicSeo } from "./public-seo";
import { PublicHeader, PublicLayout } from "./public-site-shell";
import "../../styles/marketing-home.css";

type DemoFormState = {
  firstName: string;
  lastName: string;
  email: string;
  businessName: string;
  coachingModel: string;
  activeClientsRange: string;
  primaryReason: string;
  message: string;
  consent: boolean;
  website: string;
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

const journey = [
  ["01", "Public profile", "The relationship starts before an application."],
  [
    "02",
    "Application",
    "Prospect answers stay attached to the coaching context.",
  ],
  ["03", "Conversation", "Lead conversations remain part of the record."],
  ["04", "Approval", "The right prospects move forward with clarity."],
  [
    "05",
    "Onboarding",
    "Setup, expectations, and first actions stay connected.",
  ],
  [
    "06",
    "Coaching",
    "Programs, nutrition, habits, and messages share context.",
  ],
  [
    "07",
    "Check-in",
    "Progress review becomes part of the relationship history.",
  ],
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
      {variant === "primary" ? (
        <ArrowRight size={16} aria-hidden="true" />
      ) : null}
    </Link>
  );
}

function SyncRail({ orientation = "h" }: { orientation?: "h" | "v" }) {
  return (
    <span
      className={`rs-sync-rail rs-sync-rail--${orientation}`}
      aria-hidden="true"
    />
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
        <div
          className="rs-stitch-media-placeholder"
          role="img"
          aria-label={alt}
        >
          <div
            className="rs-stitch-media-placeholder__frame"
            aria-hidden="true"
          >
            <LayoutDashboard size={34} strokeWidth={1.7} />
            <span />
          </div>
          <div>
            <p className="rs-stitch-kicker">Planned media</p>
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
            <article
              className="rs-stitch-journey-item rs-stitch-reveal"
              key={number}
            >
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
        <article
          className="rs-stitch-chapter rs-stitch-reveal"
          key={chapter.id}
        >
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
            Changing platforms affects active clients, current programs,
            check-in routines, communication, and team access, not only exercise
            templates.
          </p>
        </div>
        <div className="rs-stitch-switching__grid">
          {switchingSteps.map((step) => (
            <article
              className="rs-stitch-switch-card rs-stitch-reveal"
              key={step.label}
            >
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
                <h3>
                  Run the work before, during, and around every client
                  relationship.
                </h3>
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
              <p className="rs-stitch-kicker">
                Clear for the coach. Calm for the client.
              </p>
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
      return (
        window.sessionStorage.getItem("repsync_home_intro_seen") !== "true"
      );
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const revealTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".rs-product-reference__main > section, .rs-product-ref-mockup, .rs-product-ref-card-grid article, .rs-product-ref-mini-grid article, .rs-product-ref-stage-row article",
      ),
    );

    if (reduceMotion) {
      revealTargets.forEach((target) => target.classList.add("is-visible"));
      return;
    }

    revealTargets.forEach((target) =>
      target.classList.add("rs-product-ref-reveal"),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    revealTargets.forEach((target) => observer.observe(target));

    const navItems = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        ".rs-product-ref-side nav a",
      ),
    );
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".rs-product-reference__main section[id]",
      ),
    );

    const scrollToHash = (
      hash: string,
      behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth",
    ) => {
      const target = document.querySelector<HTMLElement>(hash);
      if (!target) return;
      target.scrollIntoView({ block: "start", behavior });
    };

    const updateActiveNav = () => {
      const scrollMarker = window.scrollY + window.innerHeight * 0.34;
      let current = "acquire";

      sections.forEach((section) => {
        if (section.offsetTop <= scrollMarker) {
          current = section.id;
        }
      });

      navItems.forEach((item) => {
        item.classList.toggle("is-active", item.hash === `#${current}`);
      });
    };

    const navClickHandlers = navItems.map((item) => {
      const handleClick = (event: MouseEvent) => {
        const hash = item.hash;
        if (!hash) return;
        event.preventDefault();
        window.history.pushState(null, "", hash);
        scrollToHash(hash);
      };

      item.addEventListener("click", handleClick);
      return () => item.removeEventListener("click", handleClick);
    });

    updateActiveNav();
    window.addEventListener("scroll", updateActiveNav, { passive: true });

    if (window.location.hash) {
      requestAnimationFrame(() => scrollToHash(window.location.hash, "auto"));
    }

    return () => {
      observer.disconnect();
      navClickHandlers.forEach((removeClickHandler) => removeClickHandler());
      window.removeEventListener("scroll", updateActiveNav);
    };
  }, []);

  return (
    <div className="rs-stitch-site rs-product-deep rs-product-reference">
      <PublicHeader />
      <div className="rs-product-reference__shell">
        <ProductReferenceSideNav />
        <main className="rs-product-reference__main" id="main">
          <ProductReferenceHero />
          <ProductReferenceModuleMap />
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
  ["#checkin", "05 Check-ins", <ClipboardCheck />],
  ["#attention", "06 Client Attention", <AlertTriangle />],
  ["#operate", "07 Operate", <Settings />],
  ["#experience", "08 Client Experience", <UserRound />],
  ["#team", "09 Team Access", <UsersRound />],
] as const;

function ProductReferenceSideNav() {
  return (
    <aside
      className="rs-product-ref-side"
      aria-label="Product deep-dive chapters"
    >
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
  const journey = [
    "Profile",
    "Apply",
    "Onboard",
    "Coach",
    "Check in",
    "Attention",
  ];

  return (
    <section className="rs-product-ref-hero">
      <SyncRail />
      <p className="rs-product-ref-label">The product</p>
      <h1>The Whole Coaching Relationship, Connected.</h1>
      <p>
        RepSync connects the journey from public profile and application through
        onboarding, coaching delivery, check-ins, communication, client
        attention, and team access.
      </p>
      <p className="rs-product-ref-hero__note">
        One operating model from first inquiry to ongoing coaching.
      </p>
      <div
        className="rs-product-ref-journey"
        aria-label="RepSync relationship journey"
      >
        {journey.map((item, index) => (
          <span key={item} style={{ "--step-index": index } as CSSProperties}>
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function ProductReferenceModuleMap() {
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const modules = [
    {
      href: "#acquire",
      number: "01",
      title: "Acquire",
      body: "Profile, applications, lead context, and approval decisions.",
      icon: <MousePointerClick />,
    },
    {
      href: "#onboard",
      number: "02",
      title: "Onboard",
      body: "Workspace assignment, secure invite, initial plan, and cadence.",
      icon: <UserRound />,
    },
    {
      href: "#deliver",
      number: "03",
      title: "Deliver",
      body: "Training, nutrition guidance, habits, and assigned work.",
      icon: <Dumbbell />,
    },
    {
      href: "#communicate",
      number: "04",
      title: "Communicate",
      body: "Coach-client messages tied to the active relationship.",
      icon: <MessageSquare />,
    },
    {
      href: "#checkin",
      number: "05",
      title: "Check-ins",
      body: "Recurring responses, review state, feedback, and follow-up.",
      icon: <ClipboardCheck />,
    },
    {
      href: "#attention",
      number: "06",
      title: "Attention",
      body: "Lifecycle, risk signals, reasons, and next coaching decisions.",
      icon: <AlertTriangle />,
    },
    {
      href: "#operate",
      number: "07",
      title: "Operate",
      body: "The operational starting point for work that needs a decision.",
      icon: <Settings />,
    },
    {
      href: "#experience",
      number: "08",
      title: "Client Experience",
      body: "A focused client home for today's plan, context, and progress.",
      icon: <UserRound />,
    },
    {
      href: "#team",
      number: "09",
      title: "Team Access",
      body: "Role-based workspace membership and protected owner controls.",
      icon: <UsersRound />,
    },
  ] as const;
  const activeModule = modules[activeModuleIndex] ?? modules[0];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      isPaused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const rotation = window.setInterval(() => {
      setActiveModuleIndex(
        (currentIndex) => (currentIndex + 1) % modules.length,
      );
    }, 3800);

    return () => window.clearInterval(rotation);
  }, [isPaused, modules.length]);

  const showPreviousModule = () => {
    setActiveModuleIndex((currentIndex) =>
      currentIndex === 0 ? modules.length - 1 : currentIndex - 1,
    );
  };

  const showNextModule = () => {
    setActiveModuleIndex((currentIndex) => (currentIndex + 1) % modules.length);
  };

  return (
    <section
      className="rs-product-ref-modules"
      aria-labelledby="product-module-map"
    >
      <div className="rs-product-ref-modules__intro">
        <p className="rs-product-ref-label">Operating system map</p>
        <h2 id="product-module-map">
          Nine modules. One coaching relationship.
        </h2>
        <p>
          Each module owns a specific decision point in the coaching operation,
          then passes context forward without fragmenting the relationship.
        </p>
      </div>
      <div
        className="rs-product-ref-module-carousel"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="rs-product-ref-module-carousel__viewport">
          <div
            className="rs-product-ref-module-carousel__track"
            style={{ transform: `translateX(-${activeModuleIndex * 100}%)` }}
          >
            {modules.map((module) => (
              <a
                className="rs-product-ref-module-slide"
                href={module.href}
                key={module.href}
              >
                <span>{module.number}</span>
                {module.icon}
                <h3>{module.title}</h3>
                <p>{module.body}</p>
              </a>
            ))}
          </div>
        </div>
        <div className="rs-product-ref-module-carousel__controls">
          <button
            aria-label="Show previous module"
            type="button"
            onClick={showPreviousModule}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <p aria-live="polite">
            {activeModule.number} / {activeModule.title}
          </p>
          <button
            aria-label="Show next module"
            type="button"
            onClick={showNextModule}
          >
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div
          className="rs-product-ref-module-carousel__dots"
          role="tablist"
          aria-label="Product modules"
        >
          {modules.map((module, index) => (
            <button
              aria-current={activeModuleIndex === index ? "true" : undefined}
              aria-label={`Show ${module.title}`}
              key={module.href}
              onClick={() => setActiveModuleIndex(index)}
              type="button"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductProductMockup({
  title,
  body,
  variant = "pipeline",
}: {
  title: string;
  body: string;
  variant?: "pipeline" | "phone" | "chat";
}) {
  return (
    <div
      className={`rs-product-ref-mockup rs-product-ref-mockup--${variant}`}
      role="img"
      aria-label={body}
    >
      <div className="rs-product-ref-mockup__bar" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {variant === "pipeline" ? (
        <div className="rs-product-ref-pipeline-ui" aria-hidden="true">
          <div>
            <span>Public profile</span>
            <strong>Coach application</strong>
            <p>Goal, history, constraints, fit.</p>
          </div>
          <div>
            <span>Lead record</span>
            <strong>Maya R.</strong>
            <p>Ready for review</p>
          </div>
          <div>
            <span>Decision</span>
            <strong>Approve</strong>
            <p>Move into onboarding</p>
          </div>
        </div>
      ) : null}
      {variant === "chat" ? (
        <div className="rs-product-ref-chat-ui" aria-hidden="true">
          <div>
            <strong>Jordan Lee</strong>
            <span>Active client</span>
          </div>
          <p>Workout complete. Energy was better today.</p>
          <p>Coach: Keep the same load and send your check-in tonight.</p>
          <aside>
            <span>Context attached</span>
            <strong>Week 4 / Lower day</strong>
          </aside>
        </div>
      ) : null}
      {variant === "phone" ? (
        <div className="rs-product-ref-phone-ui" aria-hidden="true">
          <span>Today</span>
          <strong>Next action</strong>
          <p>Lower strength session</p>
          <ul>
            <li>Nutrition guidance</li>
            <li>Habit: 8k steps</li>
            <li>Check-in opens 6 PM</li>
          </ul>
        </div>
      ) : null}
      <div className="rs-product-ref-mockup__caption">
        <p className="rs-product-ref-label">Product view</p>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

function ProductReferenceAcquire() {
  return (
    <section
      className="rs-product-ref-section rs-product-ref-section--split"
      id="acquire"
    >
      <div>
        <p className="rs-product-ref-label">01 Acquire</p>
        <h2>Turn Interest into a Coaching Relationship.</h2>
        <p>
          Publish a professional coach profile, collect applications, keep the
          conversation attached to the lead, and decide who moves forward.
        </p>
        <ul className="rs-product-ref-checks">
          {[
            "Public coach profile and application",
            "Lead context and conversations",
            "Approval into the coaching workflow",
          ].map((item) => (
            <li key={item}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <ProductProductMockup
        title="Public profile and lead pipeline"
        body="Show the published profile, application context, lead record, and next decision in one focused product view."
        variant="pipeline"
      />
    </section>
  );
}

function ProductReferenceOnboard() {
  const steps = [
    ["Assign", "Place the client in the appropriate coaching workspace."],
    ["Invite", "Give the client a secure route into RepSync."],
    ["Configure", "Set the initial coaching plan and recurring workflow."],
  ] as const;

  return (
    <section
      className="rs-product-ref-section rs-product-ref-section--center"
      id="onboard"
    >
      <span className="rs-product-ref-vertical-rail" aria-hidden="true" />
      <p className="rs-product-ref-label">02 Onboard</p>
      <h2>Start Each Client with the Right Context.</h2>
      <p>
        Move an approved lead into the right workspace, invite the client, and
        configure the starting plan, habits, and check-in cadence.
      </p>
      <div className="rs-product-ref-mini-grid">
        {steps.map(([title, body]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductReferenceDeliver() {
  const cards = [
    [
      <Dumbbell />,
      "Program delivery",
      "Assign a program, keep the client's current schedule clear, and retain the version delivered to that client.",
    ],
    [
      <Utensils />,
      "Nutrition guidance",
      "Set coach-provided guidance and targets alongside the rest of the coaching plan.",
    ],
    [
      <Network />,
      "Habit tracking",
      "Track the repeatable actions that support progress outside individual training sessions.",
    ],
  ] as const;

  return (
    <section
      className="rs-product-ref-section rs-product-ref-deliver"
      id="deliver"
    >
      <span className="rs-product-ref-vertical-rail" aria-hidden="true" />
      <div className="rs-product-ref-section__center-copy">
        <p className="rs-product-ref-label">03 Deliver</p>
        <h2>Deliver the Plan in One Coaching Workspace.</h2>
        <p>
          Keep training, nutrition guidance, and habits connected to the client
          relationship instead of distributing them across separate tools.
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
    <section
      className="rs-product-ref-section rs-product-ref-section--split"
      id="communicate"
    >
      <div>
        <p className="rs-product-ref-label">04 Communicate</p>
        <h2>Keep Every Conversation in Context.</h2>
        <p>
          Message clients from the same workspace that holds their plan,
          check-ins, and coaching history.
        </p>
        <p className="rs-product-ref-section-note">
          The conversation stays attached to the coaching relationship it
          supports.
        </p>
      </div>
      <ProductProductMockup
        title="Coach-client messaging"
        body="Show the current thread, unread state, and client relationship context without exposing private data."
        variant="chat"
      />
    </section>
  );
}

function ProductReferenceCheckin() {
  const stages = ["Opens", "Submitted", "Reviewed", "Follow-up"];

  return (
    <section
      className="rs-product-ref-section rs-product-ref-checkin"
      id="checkin"
    >
      <p className="rs-product-ref-label">05 Check-ins</p>
      <h2>Structured Check-ins. Clear Follow-up.</h2>
      <p>
        Run check-ins on a recurring cadence, review the response, add feedback,
        and see what still requires follow-up.
      </p>
      <div className="rs-product-ref-stage-row">
        {stages.map((stage, index) => (
          <article key={stage}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{stage}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductReferenceAttention() {
  return (
    <section className="rs-product-ref-attention" id="attention">
      <div>
        <p className="rs-product-ref-label">06 Client Attention</p>
        <h2>See Who Needs Attention and Why.</h2>
        <p>
          RepSync separates lifecycle from attention, so an active client can
          still require review when a specific signal changes.
        </p>
        <div className="rs-product-ref-alerts">
          <article>
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <h3>Lifecycle</h3>
              <p>Active</p>
            </div>
          </article>
          <article>
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <h3>Attention</h3>
              <p>At risk</p>
            </div>
          </article>
          <article>
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <h3>Reason</h3>
              <p>Missed latest check-in</p>
            </div>
          </article>
          <article>
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <h3>Signal</h3>
              <p>No recent reply</p>
            </div>
          </article>
          <article>
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <h3>Next step</h3>
              <p>Review the conversation</p>
            </div>
          </article>
        </div>
      </div>
      <div className="rs-product-ref-pulse">
        <span>Specific signals.</span>
        <strong>Human decisions.</strong>
        <p>RepSync surfaces the reason. The coach decides what happens next.</p>
      </div>
    </section>
  );
}

function ProductReferenceOperate() {
  return (
    <section
      className="rs-product-ref-section rs-product-ref-section--center"
      id="operate"
    >
      <p className="rs-product-ref-label">07 Operate</p>
      <h2>See the Work That Needs a Decision.</h2>
      <p>
        Review leads, active clients, overdue check-ins, client attention,
        lifecycle, and workspace activity from PT Hub.
      </p>
      <p className="rs-product-ref-section-note">
        The purpose is not another dashboard. It is a clearer starting point for
        the next action.
      </p>
    </section>
  );
}

function ProductReferenceClientExperience() {
  return (
    <section
      className="rs-product-ref-section rs-product-ref-experience"
      id="experience"
    >
      <ProductProductMockup
        title="Client home"
        body="Use a mobile client screenshot showing today's priorities and recent coaching context."
        variant="phone"
      />
      <div>
        <p className="rs-product-ref-label">08 Client Experience</p>
        <h2>A Client Home Built Around What Comes Next.</h2>
        <p>
          Clients see today's workout, nutrition guidance, habits, next
          check-in, messages, and progress without the operational layer behind
          it.
        </p>
        <article className="rs-product-ref-note">
          <h3>Focused by design</h3>
          <p>
            The coach keeps the operational context. The client gets a clear
            next action.
          </p>
        </article>
      </div>
    </section>
  );
}

function ProductReferenceTeamAccess() {
  const roles = ["Owner", "Coach", "Assistant", "Viewer"];
  const controls = [
    "Workspace membership",
    "Assigned-client visibility",
    "Shared coaching communication",
    "Protected owner actions",
  ];

  return (
    <section className="rs-product-ref-section rs-product-ref-team" id="team">
      <p className="rs-product-ref-label">09 Team Access</p>
      <h2>Bring in Support Without Giving Away Control.</h2>
      <p>
        Add workspace members with role-based access, keep client visibility
        tied to responsibility, and protect owner-level actions.
      </p>
      <div className="rs-product-ref-role-row">
        {roles.map((role) => (
          <span key={role}>{role}</span>
        ))}
      </div>
      <ul className="rs-product-ref-checks">
        {controls.map((item) => (
          <li key={item}>
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductReferenceCta() {
  return (
    <section className="rs-product-ref-cta">
      <SyncRail />
      <p className="rs-product-ref-label">Book a walkthrough</p>
      <h2>See How RepSync Fits Your Coaching Operation.</h2>
      <div>
        <Link to="/book-demo">Book a demo</Link>
        <Link to="/for-coaches">Explore for coaches</Link>
      </div>
    </section>
  );
}

function ProductReferenceFooter() {
  return (
    <AppFooter
      className="rs-marketing-app-footer rs-product-ref-footer"
      contentClassName="rs-marketing-app-footer__content"
      linkSet="marketing"
    />
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
    <aside
      className="rs-product-sidebar"
      aria-label="Product deep-dive navigation"
    >
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
    [
      "01 / Acquire",
      "Client Intake",
      "Custom lead magnets and funnel builders designed for fitness and high-ticket coaching.",
    ],
    [
      "02 / Onboard",
      "Automated Welcome",
      "Forms, contracts, and baseline assessments trigger from a clean onboarding path.",
    ],
    [
      "03 / Deliver",
      "The Training Engine",
      "Workout building with structured progressions, libraries, and delivery context.",
    ],
    [
      "04 / Communicate",
      "Smart Inbox",
      "Unified coaching communication with client context attached to the thread.",
    ],
    [
      "05 / Check-in",
      "Bio-Feedback Loops",
      "Adaptive check-ins that organize subjective and performance markers.",
    ],
    [
      "06 / Identify",
      "Attention Signals",
      "Alerts for missed habits, plateaus, or decreasing engagement before the relationship drifts.",
    ],
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
      note: "The semantic engine noticed a missed check-in for Acme Corp. Auto-follow-up prepared for coach review.",
      tone: "danger",
    },
    {
      icon: <TrendingUp />,
      title: "Engagement Dip - Athlete Roster",
      time: "Triggered this morning",
      note: "Three active clients have lower completion momentum than their previous two-week baseline.",
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
            <article
              className="rs-product-signal"
              data-tone={signal.tone}
              key={signal.title}
            >
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
          [
            "Owner",
            "Full visibility, financial controls, and master settings.",
          ],
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
            <div>
              <span />
            </div>
            <nav>
              <a href="#command">
                <Gauge size={15} />
                Overview
              </a>
              <a href="#visibility">
                <TrendingUp size={15} />
                Growth
              </a>
              <a href="#teams">
                <UsersRound size={15} />
                Athletes
              </a>
              <a href="#command">
                <CreditCard size={15} />
                Revenue
              </a>
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
    <nav
      className="rs-product-mobile-nav"
      aria-label="Mobile product navigation"
    >
      {[
        ["#main", "Home", <LayoutDashboard />],
        ["#architecture", "Plan", <ClipboardCheck />],
        ["#delivery", "Log", <Dumbbell />],
        ["#visibility", "Stats", <BarChart3 />],
      ].map(([href, label, icon], index) => (
        <a
          className={index === 0 ? "is-active" : ""}
          href={href as string}
          key={label as string}
        >
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

  const audienceTypes = [
    "Independent online coach",
    "Hybrid coach",
    "In-person coach",
    "Coach with an assistant",
    "Small coaching team",
  ];

  const leadJourney = [
    "Public profile",
    "Application",
    "Conversation",
    "Approval",
    "Workspace",
    "Onboarding",
    "Active coaching",
  ];

  const deliveryBlocks = [
    {
      title: "Assign the plan without losing the client-specific version.",
      body: "Build reusable coaching material, assign the appropriate plan, and keep the client's delivered work clear as coaching continues.",
      icon: <Dumbbell />,
    },
    {
      title: "Keep the actions outside training visible.",
      body: "Nutrition guidance and habits remain part of the same coaching relationship rather than living in separate documents or message threads.",
      icon: <Utensils />,
    },
    {
      title: "Make reflection and follow-up part of delivery.",
      body: "Run recurring check-ins, review the response, and continue the conversation with the client context still visible.",
      icon: <ClipboardCheck />,
    },
  ];

  const attentionSignals = [
    "Missed latest check-in",
    "No recent reply",
    "Adherence trending down",
    "Client inactivity",
    "Overdue action",
    "Manual coach flag",
  ];

  const visibilityItems = [
    "New leads",
    "Lead progress",
    "Response activity",
    "Active clients",
    "Overdue check-ins",
    "Clients requiring attention",
    "Lifecycle distribution",
    "Workspace activity",
  ];

  const strongFit = [
    "Leads currently sit outside the coaching platform.",
    "Public profile and application activity are disconnected from delivery.",
    "Check-ins are central to the coaching service.",
    "Client context is spread across several tools.",
    "Specific client-attention reasons are useful.",
    "An assistant or small team needs controlled access.",
    "The client experience should better reflect the coaching brand.",
    "Business visibility and delivery currently live in separate systems.",
  ];

  const weakerFit = [
    "Automated billing is required immediately.",
    "A native iOS or Android application is mandatory.",
    "Fully automated migration of all historical data is required.",
    "Enterprise-scale permission complexity is required.",
    "A large public coach marketplace is required today.",
    "Program commerce is the primary business model.",
  ];

  return (
    <PublicLayout>
      <section className="rs-stitch-page-hero">
        <div className="rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">
            For independent coaches and small coaching teams
          </p>
          <h1>Run the business around your coaching.</h1>
          <p>
            RepSync connects the journey from public profile and application to
            active delivery, recurring check-ins, communication, and client
            attention without splitting the relationship across separate
            systems.
          </p>
          <div className="rs-stitch-hero__actions">
            <SiteLink to="/book-demo">Book a demo</SiteLink>
            <SiteLink to="/product" variant="secondary">
              Explore the product
            </SiteLink>
          </div>
        </div>
        <ProductPreview
          image={stitchImages.coaches}
          alt="Placeholder for RepSync coach operations media showing PT Hub and workspace views."
          caption="Coach business workflow and attention model"
          mediaTitle="Coach operations walkthrough"
          mediaSpec="Use a 12-15 second silent product video or animated UI capture showing a public profile, application, lead approval, workspace setup, check-ins, messages, and client attention signals."
        />
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="Audience"
            title="Built for the way coaching actually runs."
            body="Whether delivery happens online, in person, or across both, the operational work between sessions still needs a clear home."
          />
          <div className="rs-coaches-audience rs-stitch-reveal">
            {audienceTypes.map((type) => (
              <span key={type}>{type}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="rs-stitch-section rs-stitch-section--sage">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="Fragmented operation"
            title="The operation breaks where the tools change."
            body="A prospect starts in a message, fills out a separate form, becomes a row in a spreadsheet, and eventually appears in a delivery platform. Each handoff creates another place to check and another chance to lose context."
          />
          <div className="rs-coaches-flow rs-stitch-reveal">
            <article>
              <p className="rs-stitch-kicker">Before</p>
              <div className="rs-coaches-flow__path">
                {[
                  "DMs",
                  "Forms",
                  "Spreadsheets",
                  "Workout platform",
                  "Messaging app",
                  "Manual reminders",
                ].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </article>
            <article>
              <p className="rs-stitch-kicker">With RepSync</p>
              <div className="rs-coaches-flow__path">
                {[
                  "Profile",
                  "Application",
                  "Lead",
                  "Client",
                  "Coaching",
                  "Attention",
                ].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </article>
          </div>
          <p className="rs-coaches-section-note rs-stitch-reveal">
            RepSync does not generate leads for you. It gives the relationship a
            structured place to begin and continue.
          </p>
        </div>
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <div className="rs-coaches-split">
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">01 / Before coaching starts</p>
              <h2>Keep the context when a prospect becomes a client.</h2>
              <p>
                Publish a professional profile, collect an application, qualify
                the lead, approve the relationship, and move the client into the
                right workspace without starting from zero.
              </p>
              <p className="rs-coaches-section-note">
                The handoff from lead to client should not erase the
                conversation that came before it.
              </p>
              <SiteLink to="/product" variant="secondary">
                Explore acquisition and onboarding
              </SiteLink>
            </div>
            <div className="rs-coaches-journey rs-stitch-reveal">
              {leadJourney.map((item, index) => (
                <article key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item}</strong>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rs-stitch-band">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="02 / The weekly work"
            title="One workspace for the work around each client."
            body="Programs, nutrition guidance, habits, check-ins, messages, and client context stay attached to the same coaching relationship."
          />
          <div className="rs-stitch-card-grid">
            {deliveryBlocks.map((block) => (
              <article
                className="rs-stitch-card rs-stitch-reveal"
                key={block.title}
              >
                <span className="rs-stitch-card__icon" aria-hidden="true">
                  {block.icon}
                </span>
                <h3>{block.title}</h3>
                <p>{block.body}</p>
              </article>
            ))}
            <article className="rs-stitch-card rs-stitch-reveal">
              <span className="rs-stitch-card__icon" aria-hidden="true">
                <MessageSquare />
              </span>
              <h3>Continue the thread after every action.</h3>
              <p>
                Messages stay beside delivery, check-ins, and client history, so
                follow-up is not detached from the work being coached.
              </p>
            </article>
          </div>
          <div className="rs-coaches-section-action rs-stitch-reveal">
            <SiteLink to="/product" variant="secondary">
              Explore coaching delivery
            </SiteLink>
          </div>
        </div>
      </section>

      <section className="rs-stitch-band rs-stitch-band--dark">
        <div className="rs-stitch-container">
          <div className="rs-coaches-split rs-coaches-split--dark">
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">03 / When support is needed</p>
              <h2>Know where the client is and whether they need you.</h2>
              <p>
                Lifecycle answers where the client is in the coaching
                relationship. Attention answers whether a current signal needs
                review.
              </p>
              <div className="rs-coaches-lifecycle">
                {[
                  "Invited",
                  "Onboarding",
                  "Active",
                  "Paused",
                  "Completed",
                  "Churned",
                ].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <SiteLink to="/product" variant="secondary">
                Explore client attention
              </SiteLink>
            </div>
            <div className="rs-coaches-attention rs-stitch-reveal">
              <p className="rs-stitch-kicker">Attention signal</p>
              <h3>Lifecycle: Active</h3>
              <strong>Attention: At risk</strong>
              <span>Reason: Missed latest check-in</span>
              <ul>
                {attentionSignals.map((signal) => (
                  <li key={signal}>
                    <AlertTriangle size={16} aria-hidden="true" />
                    {signal}
                  </li>
                ))}
              </ul>
              <p>
                RepSync surfaces the reason. The coaching decision remains with
                the coach.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <div className="rs-coaches-split">
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">Client experience</p>
              <h2>
                Your operation can be detailed. Their experience should not be.
              </h2>
              <p>
                Clients see their assigned work, nutrition guidance, habits,
                next check-in, messages, and progress without seeing the
                operational layer behind the coaching.
              </p>
              <p className="rs-coaches-section-note">
                The coach keeps the context. The client gets a clear next
                action.
              </p>
              <SiteLink to="/for-clients" variant="secondary">
                See the client experience
              </SiteLink>
            </div>
            <ProductPreview
              image={stitchImages.home}
              alt="Placeholder for the RepSync client experience showing today's workout, habits, messages, and next check-in."
              caption="Client-facing coaching view"
              mediaTitle="Client daily view"
              mediaSpec="Replace with a clean client-facing screenshot or short UI motion showing assigned workout, nutrition guidance, active habits, next check-in, recent messages, and progress."
            />
          </div>
        </div>
      </section>

      <section className="rs-stitch-section rs-stitch-section--sage">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="04 / Operating structure"
            title="Separate the business view from each coaching environment."
            body="RepSync uses two clear scopes: PT Hub for the coach and business account, and workspaces for the environments in which client delivery happens."
          />
          <div className="rs-coaches-scope-grid">
            <article className="rs-stitch-reveal">
              <p className="rs-stitch-kicker">PT Hub</p>
              <h3>Business and owner view</h3>
              <p>
                Review the operation across leads, clients, signals, public
                presence, global preferences, and coaching spaces.
              </p>
            </article>
            <article className="rs-stitch-reveal">
              <p className="rs-stitch-kicker">Workspace</p>
              <h3>Client-delivery environment</h3>
              <p>
                Configure how a specific coaching environment runs, including
                client experience, team access, defaults, templates, and
                workspace-specific behavior.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="Team access"
            title="Bring in support without giving everyone owner access."
            body="A workspace can support collaboration while keeping access tied to role, assignment, and coaching responsibility."
          />
          <div className="rs-coaches-team-grid">
            {["Owner", "Assistant coach", "Viewer"].map((role) => (
              <article className="rs-stitch-card rs-stitch-reveal" key={role}>
                <span className="rs-stitch-card__icon" aria-hidden="true">
                  {role === "Owner" ? (
                    <LockKeyhole />
                  ) : role === "Assistant coach" ? (
                    <UsersRound />
                  ) : (
                    <UserRound />
                  )}
                </span>
                <h3>{role}</h3>
                <ul>
                  {[
                    "Workspace membership",
                    "Assigned-client visibility",
                    "Shared client communication",
                    "Controlled permissions",
                  ].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rs-stitch-band">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="05 / Across the operation"
            title="See the work that needs a decision."
            body="PT Hub should help answer what entered the pipeline, what moved forward, which clients are active, which check-ins are overdue, and where attention is required."
          />
          <div className="rs-coaches-check-grid rs-stitch-reveal">
            {visibilityItems.map((item) => (
              <span key={item}>
                <CheckCircle2 size={16} aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>
          <p className="rs-coaches-section-note rs-stitch-reveal">
            The purpose is not another dashboard. It is a clearer starting point
            for the next coaching decision.
          </p>
        </div>
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="Product fit"
            title="Know whether RepSync fits before the demo."
            body="RepSync is designed for a specific operating model. Being clear about that makes the evaluation more useful."
          />
          <div className="rs-coaches-fit-grid">
            <article className="rs-coaches-fit-card rs-stitch-reveal">
              <p className="rs-stitch-kicker">
                RepSync is a strong fit when...
              </p>
              <ul>
                {strongFit.map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className="rs-coaches-fit-card rs-stitch-reveal">
              <p className="rs-stitch-kicker">
                RepSync may not be the right fit yet when...
              </p>
              <ul>
                {weakerFit.map((item) => (
                  <li key={item}>
                    <AlertTriangle size={16} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="rs-stitch-section rs-stitch-section--sage">
        <div className="rs-stitch-container">
          <div className="rs-coaches-split">
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">Switching</p>
              <h2>Already coaching on another platform?</h2>
              <p>
                A useful transition plan accounts for active clients, current
                programs, check-in routines, messages, team access, and what
                should remain archived, not only the exercise library.
              </p>
              <div className="rs-stitch-hero__actions">
                <SiteLink to="/switch">Plan your switch</SiteLink>
                <SiteLink to="/compare/truecoach" variant="secondary">
                  Moving from TrueCoach
                </SiteLink>
                <SiteLink to="/compare/fitr" variant="secondary">
                  Moving from FITR
                </SiteLink>
              </div>
            </div>
            <p className="rs-coaches-switch-note rs-stitch-reveal">
              Migration support depends on the source platform, the data type,
              and the current RepSync import path.
            </p>
          </div>
        </div>
      </section>

      <FinalCta
        title="See how RepSync fits the way you coach."
        body="Book a focused 25-minute walkthrough based on your current platform, client volume, team structure, and weekly coaching workflow."
      />
    </PublicLayout>
  );
}

export function ForClientsPage() {
  usePublicSeo({
    title: "For clients | RepSync",
    description:
      "RepSync gives coaching clients a focused daily view for workouts, nutrition, habits, messages, check-ins, and progress.",
  });

  const todayItems = [
    [
      "Today's workout",
      "See the session your coach has assigned.",
      <Dumbbell />,
    ],
    [
      "Nutrition guidance",
      "Review the current guidance or targets.",
      <Utensils />,
    ],
    ["Active habits", "See the actions you are working on.", <CheckCircle2 />],
    ["Next check-in", "Know when it opens or is due.", <ClipboardCheck />],
    ["Coach message", "Read the latest coaching context.", <MessageSquare />],
  ] as const;

  const checkInFlow = [
    "Check-in opens",
    "You complete it",
    "Your coach reviews it",
    "Feedback and next steps follow",
  ];

  const progressItems = [
    "Completed sessions",
    "Habit consistency",
    "Check-in history",
    "Coaching feedback",
    "Supported wearable information, when enabled",
  ];

  const privacyItems = [
    "You sign in to see your own coaching experience.",
    "Your assigned plan, check-ins, and messages are not part of the coach's public profile.",
    "Access by the coaching team is controlled through the coaching relationship.",
    "Other clients are not part of your client view.",
  ];

  const joinPaths = [
    {
      title: "I have an invitation",
      body: "Open the secure invitation link sent by your coach. Depending on your account, RepSync will guide you through account setup, client onboarding, or directly to your client home.",
      action: "Continue with my invitation",
      to: "/signup/client",
      note: "Invitation expired? Ask your coach to send a new one.",
      icon: <MousePointerClick />,
    },
    {
      title: "I already have an account",
      body: "Sign in to open your client home and continue with your current coaching relationship.",
      action: "Log in",
      to: "/login",
      icon: <UserRound />,
    },
    {
      title: "I am looking for a coach",
      body: "Coach discovery is being prepared. Join the interest list to be notified when it opens.",
      action: "Get discovery updates",
      to: "/coaches",
      icon: <UsersRound />,
    },
  ];

  const faqs = [
    [
      "How do I join RepSync?",
      "Most clients enter through an invitation from their coach. Open the secure invitation link, confirm or create your account, and complete any required setup.",
    ],
    [
      "What happens if my invitation has expired?",
      "Ask your coach to issue a new invitation. RepSync should not ask you to reuse an expired or invalid link.",
    ],
    [
      "Can I use RepSync without a coach?",
      "RepSync is currently designed around an active coaching relationship. Most client access begins with a coach invitation.",
    ],
    [
      "Can another client see my information?",
      "Your client area is intended for your own coaching relationship. Other clients are not shown your assigned plan, check-ins, or messages.",
    ],
    [
      "Do I need to install an app?",
      "RepSync is accessed through the web and is designed to work across desktop and mobile browsers.",
    ],
  ] as const;

  return (
    <PublicLayout>
      <section className="rs-stitch-page-hero">
        <div className="rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">For coaching clients</p>
          <h1>Your coaching, without the clutter.</h1>
          <p>
            See your training, nutrition guidance, habits, check-ins, messages,
            and progress in one clear place so you always know what to do next.
          </p>
          <div className="rs-stitch-hero__actions">
            <SiteLink to="/signup/client">I have an invitation</SiteLink>
            <SiteLink to="/login" variant="secondary">
              Log in
            </SiteLink>
          </div>
          <p className="rs-clients-hero-note">
            Looking for a coach? <Link to="/coaches">See availability.</Link>
          </p>
        </div>
        <ProductPreview
          image={stitchImages.home}
          alt="Placeholder for RepSync client home showing assigned work, check-ins, messages, and next actions."
          caption="Focused client coaching view"
          mediaTitle="Client home view"
          mediaSpec="Replace with a client-facing screenshot or short UI motion showing today's workout, nutrition guidance, active habits, next check-in, coach message, and progress."
        />
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="01 / Today"
            title="Open RepSync and know what matters today."
            body="Start with the next useful action, not a screen full of business administration."
          />
          <div className="rs-clients-today-grid">
            {todayItems.map(([title, body, icon]) => (
              <article className="rs-stitch-card rs-stitch-reveal" key={title}>
                <span className="rs-stitch-card__icon" aria-hidden="true">
                  {icon}
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rs-stitch-band">
        <div className="rs-stitch-container">
          <div className="rs-clients-split">
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">02 / Your plan</p>
              <h2>
                Your plan, guidance, and next actions in one coaching space.
              </h2>
              <p>
                What your coach assigns stays clear. What you complete is easy
                to see.
              </p>
            </div>
            <div className="rs-clients-plan-stack">
              <article className="rs-stitch-reveal">
                <span className="rs-stitch-card__icon" aria-hidden="true">
                  <Dumbbell />
                </span>
                <h3>Follow the training your coach has set for you.</h3>
                <p>
                  See scheduled sessions, exercise details, completion state,
                  and what comes next without searching through separate
                  documents or message threads.
                </p>
              </article>
              <article className="rs-stitch-reveal">
                <span className="rs-stitch-card__icon" aria-hidden="true">
                  <Utensils />
                </span>
                <h3>
                  Keep the actions outside training connected to the plan.
                </h3>
                <p>
                  View nutrition guidance and the habits your coach wants you to
                  focus on alongside the rest of your coaching.
                </p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="rs-stitch-band rs-stitch-band--dark">
        <div className="rs-stitch-container">
          <div className="rs-clients-split rs-clients-split--dark">
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">03 / Stay connected</p>
              <h2>Keep the coaching conversation moving between sessions.</h2>
              <p>
                Check-ins give you a structured place to reflect. Messages give
                you a direct place to ask questions and continue the
                conversation.
              </p>
            </div>
            <div className="rs-clients-checkin-flow rs-stitch-reveal">
              {checkInFlow.map((item, index) => (
                <article key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item}</strong>
                </article>
              ))}
            </div>
          </div>
          <div className="rs-clients-connection-grid">
            <article className="rs-stitch-reveal">
              <h3>Review with the coaching relationship attached.</h3>
              <p>
                See when a check-in is available, submit your responses, and
                return to the coaching plan with the review attached to the
                relationship.
              </p>
            </article>
            <article className="rs-stitch-reveal">
              <h3>Ask questions without separating the context.</h3>
              <p>
                Ask questions and share context without separating the
                conversation from the rest of your coaching.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <div className="rs-clients-split">
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">04 / Progress</p>
              <h2>Progress makes more sense with context.</h2>
              <p>
                Review completed work, habits, check-ins, and the information
                your coach uses to understand how the plan is going.
              </p>
            </div>
            <div className="rs-clients-progress-list rs-stitch-reveal">
              {progressItems.map((item) => (
                <span key={item}>
                  <TrendingUp size={16} aria-hidden="true" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rs-stitch-section rs-stitch-section--sage">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="05 / Your information"
            title="Your coaching information stays with your coaching relationship."
            body="The public information about a coach is separate from the private information used to deliver your coaching."
          />
          <div className="rs-clients-privacy-grid rs-stitch-reveal">
            {privacyItems.map((item) => (
              <span key={item}>
                <ShieldCheck size={17} aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>
          <div className="rs-clients-section-actions rs-stitch-reveal">
            <SiteLink to="/security" variant="secondary">
              Read about security
            </SiteLink>
            <SiteLink to="/privacy" variant="secondary">
              Read the privacy policy
            </SiteLink>
          </div>
        </div>
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="How to join"
            title="How do you want to enter RepSync?"
            body="Use the path that matches your relationship with RepSync today."
          />
          <div className="rs-clients-join-grid">
            {joinPaths.map((path) => (
              <article
                className="rs-stitch-card rs-stitch-reveal"
                key={path.title}
              >
                <span className="rs-stitch-card__icon" aria-hidden="true">
                  {path.icon}
                </span>
                <h3>{path.title}</h3>
                <p>{path.body}</p>
                <SiteLink
                  to={path.to}
                  variant={
                    path.title === "I have an invitation"
                      ? "primary"
                      : "secondary"
                  }
                >
                  {path.action}
                </SiteLink>
                {path.note ? (
                  <p className="rs-clients-card-note">{path.note}</p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rs-stitch-band">
        <div className="rs-stitch-container">
          <SectionIntro eyebrow="FAQ" title="Before you enter RepSync" />
          <div className="rs-stitch-faq">
            {faqs.map(([question, answer]) => (
              <details className="rs-stitch-reveal" key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <div className="rs-clients-section-actions rs-stitch-reveal">
            <SiteLink to="/faq" variant="secondary">
              View all client questions
            </SiteLink>
          </div>
        </div>
      </section>

      <section className="rs-clients-final rs-stitch-reveal">
        <SyncRail />
        <p className="rs-stitch-kicker">Final actions</p>
        <h2>Ready to return to your coaching?</h2>
        <div className="rs-stitch-cta__actions">
          <SiteLink to="/login">Log in</SiteLink>
          <SiteLink to="/signup/client" variant="secondary">
            I have an invitation
          </SiteLink>
        </div>
        <p>
          Are you a coach evaluating RepSync?{" "}
          <Link to="/for-coaches">Explore RepSync for coaches.</Link>
        </p>
      </section>
    </PublicLayout>
  );
}

export function SwitchPage() {
  usePublicSeo({
    title: "Switch to RepSync | Migration protocol",
    description:
      "Plan a move to RepSync by mapping your current platform, active client workflow, supported migration paths, and launch handoff.",
  });

  const reviewSteps = [
    {
      number: "01",
      title: "Review",
      body: "Map the current platform, active clients, team access, programs, nutrition, habits, check-ins, messages, and historical records.",
    },
    {
      number: "02",
      title: "Prepare",
      body: "Classify each item as supported, assisted, evaluated case by case, or retained in the original system.",
    },
    {
      number: "03",
      title: "Launch",
      body: "Configure RepSync, verify active assignments, invite clients deliberately, and confirm the first week of coaching delivery.",
    },
  ];

  const moveCategories = [
    [
      "People and access",
      "Active clients, coaches, assistants, viewers, workspace relationships, and invitation status.",
    ],
    [
      "Active coaching",
      "Current programs, nutrition guidance, habits, check-in cadence, upcoming sessions, and the next required client action.",
    ],
    [
      "Current communication",
      "Active client conversations, unread items, current follow-up, and the communication channel that will remain authoritative during the transition.",
    ],
    [
      "Operating structure",
      "Workspaces, team roles, assigned clients, public-profile setup, application flow, and delivery defaults.",
    ],
    [
      "Historical records",
      "Previous check-ins, messages, notes, documents, wearable history, and billing records that may need to remain accessible after the switch.",
    ],
  ];

  const supportStates = [
    ["Supported", "A verified transfer method currently exists."],
    [
      "Assisted",
      "RepSync can help prepare, structure, or recreate the information through an agreed manual process.",
    ],
    [
      "Evaluate",
      "The source format and migration scope must be reviewed before a path can be confirmed.",
    ],
    [
      "Not currently supported",
      "RepSync does not currently provide a transfer path for this category.",
    ],
  ];

  const handoffItems = [
    [
      "Active client roster",
      "Confirm which clients are moving, who remains archived, and who should not receive a new invitation.",
    ],
    [
      "Current assignments",
      "Verify the active program, nutrition guidance, habits, and next scheduled work before inviting the client.",
    ],
    [
      "Check-in schedule",
      "Avoid moving a client in the middle of an open check-in unless the current response and review process are accounted for.",
    ],
    [
      "Client communication",
      "Tell clients where new messages should be sent and avoid maintaining parallel active conversations longer than necessary.",
    ],
    [
      "Team access",
      "Confirm owner, assistant, viewer, and assigned-client access before the first client enters the new workspace.",
    ],
  ];

  const platformCards = [
    {
      title: "Moving from TrueCoach",
      body: "Compare the operating model before deciding what to recreate or archive. Review how your current client delivery, communication, check-ins, team workflow, and supporting business tools would translate into RepSync.",
      cta: "RepSync vs TrueCoach",
      to: "/compare/truecoach",
    },
    {
      title: "Moving from FITR",
      body: "Map the programming and business workflow, not only the client list. Review your current programs, active clients, check-ins, communication, and operating process before deciding what should move into RepSync.",
      cta: "RepSync vs FITR",
      to: "/compare/fitr",
    },
  ];

  const questions = [
    [
      "Can RepSync import everything from my current platform?",
      "No universal import should be assumed. Support depends on the source platform, data format, volume, and whether the information is required for active coaching or historical reference.",
    ],
    [
      "Will my clients need new accounts?",
      "New RepSync users will generally need to accept an invitation and complete the required account setup. Existing RepSync users should sign in through the appropriate invitation or workspace flow rather than creating a duplicate account.",
    ],
    [
      "Can I keep using my current platform during the transition?",
      "A controlled overlap may be appropriate, but each workflow should have one clearly defined source of truth. Avoid editing the same active assignment, check-in, or conversation in both systems.",
    ],
    [
      "How long does a switch take?",
      "The timeline depends on the number of active clients, team structure, current programs, historical-data requirements, and the amount of information that must be recreated or reviewed.",
    ],
    [
      "What should remain archived?",
      "Historical messages, billing records, unsupported attachments, and other records that are not needed for current delivery may be better retained as exports or in read-only access to the original system.",
    ],
    [
      "Can I start with a smaller group of clients?",
      "A phased transition can reduce risk. The initial plan should identify a manageable client group, verify access and assignments, and use the result to refine the remaining rollout.",
    ],
  ];

  return (
    <PublicLayout>
      <section className="rs-switch-hero">
        <div className="rs-switch-hero__copy rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">Migration protocol</p>
          <h1>Move only after the workflow is clear.</h1>
          <p>
            RepSync does not promise an instant one-click migration. The safest
            switch starts by mapping what you use today, what must keep running,
            and what can move without disrupting active coaching.
          </p>
          <div className="rs-stitch-hero__actions">
            <SiteLink to="/book-demo">Book a switching demo</SiteLink>
            <SiteLink to="#transition-process" variant="secondary">
              See the transition process
            </SiteLink>
          </div>
          <p className="rs-switch-hero__note">
            Moving from TrueCoach or FITR? Review the platform-specific
            comparison before planning the transition.
          </p>
        </div>
        <aside
          className="rs-switch-hero__panel rs-stitch-reveal is-visible"
          aria-label="Switching sequence"
        >
          {reviewSteps.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </article>
          ))}
          <p>
            The objective is continuity, not forcing every historical record
            into a new platform.
          </p>
        </aside>
      </section>

      <section className="rs-switch-section rs-switch-section--move">
        <div className="rs-switch-section__intro rs-stitch-reveal">
          <p className="rs-stitch-kicker">What may need to move</p>
          <h2>Map the active relationship before the historical archive.</h2>
          <p>
            The information required to continue coaching is not always the same
            as the information worth preserving for reference. Review the two
            separately.
          </p>
        </div>
        <div className="rs-switch-category-grid">
          {moveCategories.map(([title, body]) => (
            <article className="rs-stitch-reveal" key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <p className="rs-switch-section__note rs-stitch-reveal">
          Not every historical record needs to become active RepSync data. Some
          information may be more appropriate as an export or read-only archive.
        </p>
      </section>

      <section
        className="rs-switch-section rs-switch-section--support"
        id="transition-process"
      >
        <div className="rs-switch-section__intro rs-stitch-reveal">
          <p className="rs-stitch-kicker">Migration support</p>
          <h2>Every category needs an honest support state.</h2>
          <p>
            Migration support depends on the source platform, data format,
            volume, and whether the information is needed for active coaching or
            historical reference.
          </p>
        </div>
        <div className="rs-switch-support-grid">
          {supportStates.map(([title, body]) => (
            <article className="rs-stitch-reveal" key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-switch-section rs-switch-section--handoff">
        <div className="rs-switch-handoff__copy rs-stitch-reveal">
          <p className="rs-stitch-kicker">During the handoff</p>
          <h2>
            Keep one source of truth until each part of the move is complete.
          </h2>
          <p>
            A transition becomes risky when the same information is edited in
            two systems without a clear owner. Decide which platform is
            authoritative for each workflow until the handoff is confirmed.
          </p>
          <strong>
            A smaller verified first group is usually safer than inviting the
            entire client roster at once.
          </strong>
        </div>
        <div className="rs-switch-handoff-list">
          {handoffItems.map(([title, body], index) => (
            <article className="rs-stitch-reveal" key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-switch-section rs-switch-section--platforms">
        <div className="rs-switch-section__intro rs-stitch-reveal">
          <p className="rs-stitch-kicker">Current platform</p>
          <h2>Start with the workflow you are leaving.</h2>
          <p>
            The transition plan should reflect how the current platform handles
            delivery, client communication, check-ins, team access, and
            historical information.
          </p>
        </div>
        <div className="rs-switch-platform-grid">
          {platformCards.map((platform) => (
            <article className="rs-stitch-reveal" key={platform.title}>
              <h3>{platform.title}</h3>
              <p>{platform.body}</p>
              <SiteLink to={platform.to} variant="secondary">
                {platform.cta}
              </SiteLink>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-switch-section rs-switch-section--faq">
        <div className="rs-switch-section__intro rs-stitch-reveal">
          <p className="rs-stitch-kicker">
            Questions to resolve before the move
          </p>
          <h2>Clarify the limits before the rollout begins.</h2>
        </div>
        <div className="rs-switch-faq-list">
          {questions.map(([question, answer]) => (
            <article className="rs-stitch-reveal" key={question}>
              <h3>{question}</h3>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-switch-final rs-stitch-reveal">
        <SyncRail />
        <p className="rs-stitch-kicker">Switching demo</p>
        <h2>Plan the switch with the workflow in front of you.</h2>
        <p>
          Book a focused 25-minute walkthrough based on your current platform,
          active-client volume, team structure, and the information that must
          remain available during the move.
        </p>
        <div className="rs-stitch-cta__actions">
          <SiteLink to="/book-demo">Book a switching demo</SiteLink>
          <SiteLink to="/for-coaches" variant="secondary">
            Explore RepSync for coaches
          </SiteLink>
        </div>
        <p className="rs-switch-final__note">
          Focused on continuity, current limitations, and the safest next step.
        </p>
      </section>
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
              {
                name: "Profile",
                body: "For coaches building a professional public presence.",
                features: [
                  "Published coach profile",
                  "Coaching options",
                  "Client applications",
                ],
              },
              {
                name: "Coach OS",
                body: "For independent coaches managing active relationships.",
                features: [
                  "Lead and client context",
                  "Delivery and check-ins",
                  "Client attention signals",
                ],
              },
              {
                name: "Studio",
                body: "For small teams that need controlled collaboration.",
                features: [
                  "Role-based team access",
                  "Shared coaching workflows",
                  "Guided setup support",
                ],
              },
            ].map(({ name, body, features }) => (
              <article className="rs-stitch-price rs-stitch-reveal" key={name}>
                <p className="rs-stitch-kicker">{name}</p>
                <h3>Early access</h3>
                <p>{body}</p>
                <ul className="rs-stitch-price__features">
                  {features.map((feature) => (
                    <li key={feature}>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <SiteLink to="/book-demo" variant="secondary">
                  Discuss early access
                </SiteLink>
              </article>
            ))}
          </div>
          <p className="rs-stitch-pricing__note rs-stitch-reveal">
            Pricing is shaped by active-client volume, team access, and setup or
            migration support. A demo confirms the appropriate pilot scope
            before any commitment.
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}

function validateDemoForm(values: DemoFormState) {
  const errors: Partial<Record<keyof DemoFormState, string>> = {};
  if (values.firstName.trim().length < 2)
    errors.firstName = "Enter your first name.";
  if (values.lastName.trim().length < 2)
    errors.lastName = "Enter your last name.";
  if (!/\S+@\S+\.\S+/.test(values.email.trim()))
    errors.email = "Enter a valid email.";
  if (!values.coachingModel)
    errors.coachingModel = "Choose your coaching model.";
  if (!values.activeClientsRange)
    errors.activeClientsRange = "Choose your active-client range.";
  if (!values.primaryReason)
    errors.primaryReason = "Choose the workflow you want to improve.";
  if (!values.consent)
    errors.consent = "Confirm that RepSync may respond to this request.";
  return errors;
}

export function DemoPage() {
  usePublicSeo({
    title: "Book a demo | RepSync",
    description:
      "Book a RepSync demo and map the product to your lead flow, client count, delivery model, and team structure.",
  });

  const [values, setValues] = useState<DemoFormState>({
    firstName: "",
    lastName: "",
    email: "",
    businessName: "",
    coachingModel: "",
    activeClientsRange: "",
    primaryReason: "",
    message: "",
    consent: false,
    website: "",
  });
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errors = useMemo(
    () => (touched ? validateDemoForm(values) : {}),
    [touched, values],
  );

  const updateField =
    (field: keyof DemoFormState) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setSent(false);
      setSubmitError(null);
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setTouched(true);
    const nextErrors = validateDemoForm(values);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    const query = new URLSearchParams(window.location.search);
    const { error } = await supabase.functions.invoke("marketing-lead-submit", {
      body: {
        type: "request_access",
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        email: values.email.trim().toLowerCase(),
        business_name: values.businessName.trim() || null,
        coaching_model: values.coachingModel,
        active_clients_range: values.activeClientsRange,
        primary_reason: values.primaryReason,
        message: values.message.trim() || null,
        consent: values.consent,
        website: values.website,
        page_path: window.location.pathname,
        referrer: document.referrer || null,
        utm_source: query.get("utm_source"),
        utm_medium: query.get("utm_medium"),
        utm_campaign: query.get("utm_campaign"),
        utm_content: query.get("utm_content"),
        utm_term: query.get("utm_term"),
      },
    });
    setSubmitting(false);
    if (error) {
      setSubmitError(
        "The request could not be sent. Please try again or contact support.",
      );
      return;
    }
    setSent(true);
    setValues({
      firstName: "",
      lastName: "",
      email: "",
      businessName: "",
      coachingModel: "",
      activeClientsRange: "",
      primaryReason: "",
      message: "",
      consent: false,
      website: "",
    });
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
        <form
          className="rs-stitch-form rs-stitch-reveal is-visible"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="rs-stitch-form__grid">
            <FieldBlock
              id="demo-first-name"
              label="First name"
              error={errors.firstName}
            >
              <Input
                id="demo-first-name"
                value={values.firstName}
                onChange={updateField("firstName")}
                autoComplete="given-name"
              />
            </FieldBlock>
            <FieldBlock
              id="demo-last-name"
              label="Last name"
              error={errors.lastName}
            >
              <Input
                id="demo-last-name"
                value={values.lastName}
                onChange={updateField("lastName")}
                autoComplete="family-name"
              />
            </FieldBlock>
          </div>
          <div className="rs-stitch-form__grid">
            <FieldBlock id="demo-email" label="Work email" error={errors.email}>
              <Input
                id="demo-email"
                type="email"
                value={values.email}
                onChange={updateField("email")}
                autoComplete="email"
              />
            </FieldBlock>
            <FieldBlock id="demo-business" label="Business name">
              <Input
                id="demo-business"
                value={values.businessName}
                onChange={updateField("businessName")}
                autoComplete="organization"
              />
            </FieldBlock>
          </div>
          <div className="rs-stitch-form__grid">
            <FieldBlock
              id="demo-model"
              label="Coaching model"
              error={errors.coachingModel}
            >
              <Select
                id="demo-model"
                value={values.coachingModel}
                onChange={updateField("coachingModel")}
              >
                <option value="">Choose a model</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
                <option value="in_person">In person</option>
                <option value="mixed">Mixed team</option>
              </Select>
            </FieldBlock>
            <FieldBlock
              id="demo-clients"
              label="Active clients"
              error={errors.activeClientsRange}
            >
              <Select
                id="demo-clients"
                value={values.activeClientsRange}
                onChange={updateField("activeClientsRange")}
              >
                <option value="">Choose a range</option>
                <option value="0_5">0-5</option>
                <option value="6_20">6-20</option>
                <option value="21_50">21-50</option>
                <option value="51_plus">51+</option>
              </Select>
            </FieldBlock>
          </div>
          <FieldBlock
            id="demo-reason"
            label="What should RepSync improve first?"
            error={errors.primaryReason}
          >
            <Select
              id="demo-reason"
              value={values.primaryReason}
              onChange={updateField("primaryReason")}
            >
              <option value="">Choose a workflow</option>
              <option value="lead_to_client">Lead-to-client flow</option>
              <option value="client_attention">Client attention</option>
              <option value="team_workspace">Team workspace</option>
              <option value="delivery_clarity">Coaching delivery</option>
              <option value="migration_planning">Migration planning</option>
            </Select>
          </FieldBlock>
          <FieldBlock id="demo-message" label="Message" error={errors.message}>
            <Textarea
              id="demo-message"
              value={values.message}
              onChange={updateField("message")}
              placeholder="Tell us what you want to clean up first."
              rows={6}
            />
          </FieldBlock>
          <div className="rs-stitch-consent">
            <input
              id="demo-consent"
              type="checkbox"
              checked={values.consent}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  consent: event.target.checked,
                }))
              }
            />
            <Label htmlFor="demo-consent">
              RepSync may use these details to respond to this request. See the{" "}
              <Link to="/privacy">privacy policy</Link>.
            </Label>
          </div>
          {errors.consent ? (
            <p className="rs-stitch-form__error">{errors.consent}</p>
          ) : null}
          <div className="rs-stitch-honeypot" aria-hidden="true">
            <Label htmlFor="demo-website">Website</Label>
            <Input
              id="demo-website"
              tabIndex={-1}
              autoComplete="off"
              value={values.website}
              onChange={updateField("website")}
            />
          </div>
          {sent ? (
            <p className="rs-stitch-success" role="status">
              Your request has been sent. RepSync will follow up using the email
              you provided.
            </p>
          ) : null}
          {submitError ? (
            <p className="rs-stitch-form__error" role="alert">
              {submitError}
            </p>
          ) : null}
          <Button
            className="rs-stitch-submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Request demo"}
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
    description:
      "Browse public RepSync coach profiles as they become available.",
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
          [
            "Is RepSync only for workout programming?",
            "No. Programming is part of the workflow, but RepSync is positioned around the whole coaching relationship.",
          ],
          [
            "Can RepSync replace spreadsheets and DMs?",
            "It can reduce the need for scattered tools by keeping leads, clients, check-ins, and delivery context together.",
          ],
          [
            "How does early access work?",
            "Book a focused demo so the team can review your coaching model, active-client volume, and workflow. The next step is agreed after that review.",
          ],
          [
            "How is pricing determined?",
            "Pricing is currently matched to client volume, team access, and setup or migration support. The pricing page explains the available early-access scopes.",
          ],
          [
            "Do clients need to install an app?",
            "No. RepSync is web-based and is designed to work across current desktop and mobile browsers.",
          ],
          [
            "How do clients join?",
            "Clients normally enter through a secure invitation from their coach, then complete any required account and onboarding steps.",
          ],
          [
            "Can I move from another coaching platform?",
            "RepSync supports a deliberate transition plan. Import support depends on the source platform, data format, active workflows, and information that needs to remain available.",
          ],
          [
            "Can a small coaching team use RepSync?",
            "Yes. Workspace roles are designed to separate owner, coach, assistant, and viewer responsibilities while keeping client access tied to the coaching relationship.",
          ],
          [
            "Who owns the coaching data?",
            "Data access follows the account and workspace relationship. Export, retention, and deletion requirements should be confirmed during setup and are described further in the privacy policy.",
          ],
          [
            "Where can I get help?",
            "Use the support page for product and account questions. Urgent medical or emergency guidance is outside RepSync's scope.",
          ],
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
          [
            <LockKeyhole />,
            "Authenticated private areas",
            "Private coaching routes require an authenticated account and are separated from public coach profiles.",
          ],
          [
            <UsersRound />,
            "Role-based workspace access",
            "Owner, coach, assistant, and viewer responsibilities define what each workspace member can access.",
          ],
          [
            <ShieldCheck />,
            "Public and private separation",
            "Published profile information is kept separate from private plans, check-ins, messages, and client records.",
          ],
          [
            <Network />,
            "Controlled data paths",
            "Browser and backend requests use configured application and database controls rather than exposing direct public write access.",
          ],
          [
            <ClipboardCheck />,
            "Operational safeguards",
            "Validation, access checks, and protected owner actions are applied at key account and workspace boundaries.",
          ],
          [
            <MessageSquare />,
            "Security support",
            "Security or privacy concerns can be reported through the support channel for review and follow-up.",
          ],
        ]}
      />
      <p className="rs-stitch-security-note">
        RepSync does not currently claim HIPAA, SOC 2, or ISO certification.
        Security documentation will be updated when a formal review supports
        additional claims.
      </p>
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
          [
            <UsersRound />,
            "Account and profile information",
            "RepSync may process identity, email, profile, workspace, and coach-controlled public profile details.",
          ],
          [
            <ClipboardCheck />,
            "Coaching information",
            "Private coaching areas may include programs, nutrition, habits, check-ins, messages, notes, progress, and wearable context.",
          ],
          [
            <MessageSquare />,
            "Marketing forms",
            "Demo and switch forms collect contact details and operational context so the team can respond.",
          ],
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
          [
            <CheckCircle2 />,
            "Account responsibility",
            "Users are responsible for accurate account information and secure credentials.",
          ],
          [
            <ShieldCheck />,
            "Acceptable use",
            "Do not misuse RepSync, attempt unauthorized access, or interfere with service operation.",
          ],
          [
            <Dumbbell />,
            "Coach responsibility",
            "Coaches remain responsible for coaching content, client communication, and professional obligations.",
          ],
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
          [
            <LockKeyhole />,
            "Essential",
            "Required for authentication, route state, security-sensitive operation, and saved preferences.",
          ],
          [
            <BarChart3 />,
            "Analytics",
            "Optional public-site usage events should exclude personal, health, and private client data.",
          ],
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
