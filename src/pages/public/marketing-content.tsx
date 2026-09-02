import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import { AppFooter } from "../../components/common/app-footer";
import {
  legalReviewRequired,
  publicFaqGroups,
} from "../../lib/marketing-public";
import { buildTrialPath, type TrialPlanId } from "../../lib/trial-plan";
import { BloomField } from "./bloom-field";
import { usePublicSeo } from "./public-seo";
import {
  CookiePreferenceControls,
  PublicHeader,
  PublicLayout,
  PublicMobileTrialBar,
} from "./public-site-shell";
import "../../styles/marketing-home.css";

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
  [
    "01",
    "Public profile",
    "Prospects can review your coaching and available packages.",
  ],
  ["02", "Application", "Answers are stored with the prospect's record."],
  [
    "03",
    "Conversation",
    "Messages and notes give coaches the history they need.",
  ],
  ["04", "Approval", "Approved prospects move directly into onboarding."],
  [
    "05",
    "Onboarding",
    "Clients complete setup and receive their first actions.",
  ],
  [
    "06",
    "Coaching",
    "Programs, nutrition, habits, and messages are managed together.",
  ],
  [
    "07",
    "Check-in",
    "Each review adds results and coach feedback to the record.",
  ],
  [
    "08",
    "Client attention",
    "Recent activity and overdue tasks help coaches prioritize follow-up.",
  ],
];

const productChapters: Chapter[] = [
  {
    id: "acquire",
    label: "01 / Acquire",
    title: "Turn a new inquiry into an active client.",
    body: "Publish your profile, accept applications, talk with prospects, and move approved clients into onboarding with their answers and notes attached.",
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
    title: "Build plans and review the work as it happens.",
    body: "Assign training and nutrition guidance, track habits, schedule check-ins, and keep client messages beside their progress history.",
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
    title: "Prioritize clients who need follow-up.",
    body: "RepSync separates lifecycle status from attention signals, then shows the missed check-in, inactivity, or overdue task behind each alert.",
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
    body: "List the clients, programs, check-ins, and team access you use today.",
  },
  {
    label: "02 Prepare",
    body: "Decide which records to import, recreate, or archive.",
  },
  {
    label: "03 Launch",
    body: "Set up access, confirm active assignments, and invite clients when the new workspace is ready.",
  },
];

const pricingPlans = [
  {
    id: "launch" as TrialPlanId,
    name: "Launch",
    audience: "For new and part-time coaches building their first client base.",
    monthlyPrice: "$19",
    annualPrice: "$190",
    limits: [
      "10 active clients",
      "1 coach seat",
      "1 workspace",
      "3 published packages",
    ],
    summary: "Core coaching features for up to 10 active clients.",
  },
  {
    id: "growth" as TrialPlanId,
    name: "Growth",
    audience:
      "For full-time independent coaches and coaches beginning to work with an assistant.",
    monthlyPrice: "$49",
    annualPrice: "$490",
    limits: [
      "35 active clients",
      "2 coach seats",
      "3 workspaces",
      "Unlimited published packages",
    ],
    summary: "Capacity for a full-time coach and one additional coach seat.",
    featured: true,
  },
  {
    id: "scale" as TrialPlanId,
    name: "Scale",
    audience:
      "For established coaches, small coaching companies, and multi-coach delivery teams.",
    monthlyPrice: "$99",
    annualPrice: "$990",
    limits: [
      "100 active clients",
      "5 coach seats",
      "10 workspaces",
      "Unlimited published packages",
    ],
    summary: "Team access and capacity for up to 100 active clients.",
  },
  {
    id: "studio" as TrialPlanId,
    name: "Studio",
    audience:
      "For larger teams, studios, gyms, and multi-brand coaching businesses.",
    monthlyPrice: "From $199",
    annualPrice: "From $1,990",
    limits: [
      "200 active clients",
      "10 coach seats",
      "Unlimited workspaces",
      "Unlimited published packages",
    ],
    summary: "Capacity for larger teams working across multiple workspaces.",
  },
];

const pricingCoreFeatures = [
  "Public coach profile",
  "Marketplace presence",
  "Public packages",
  "Lead applications",
  "Lead conversations",
  "Client onboarding",
  "Workouts and programs",
  "Nutrition guidance",
  "Habits",
  "Check-ins and reviews",
  "Messaging",
  "Progress tracking and photos",
  "Client lifecycle",
  "Client attention indicators",
  "Standard analytics",
];

const pricingDefinitions = [
  {
    title: "Active client",
    body: "Clients with onboarding, active, or paused status count toward the limit. Leads, invitations, completed clients, churned clients, and archived records do not.",
  },
  {
    title: "Coach seat",
    body: "The owner and every team member with access to owned workspaces. Clients do not count as coach seats.",
  },
  {
    title: "Workspace",
    body: "A separate client-delivery environment with its own team, clients, defaults, and coaching configuration.",
  },
  {
    title: "Published package",
    body: "A public coaching option shown on the coach's RepSync profile.",
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
  media,
}: {
  image: string;
  alt: string;
  caption: string;
  media?: ReactNode;
}) {
  return (
    <figure
      className={`rs-stitch-preview rs-stitch-reveal ${
        media ? "rs-stitch-preview--motion" : ""
      }`}
    >
      <div className="rs-stitch-preview__chrome" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {media ?? <img src={image} alt={alt} />}
      <figcaption>
        <SyncRail orientation="v" />
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

function ProductMotion({
  alt,
  poster,
  src,
}: {
  alt: string;
  poster: string;
  src: string;
}) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const updateMotionPreference = () =>
      setPrefersReducedMotion(motionPreference.matches);

    updateMotionPreference();
    motionPreference.addEventListener("change", updateMotionPreference);
    return () =>
      motionPreference.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || prefersReducedMotion) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { rootMargin: "160px 0px", threshold: 0.15 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return (
    <div className="rs-stitch-preview__motion">
      {prefersReducedMotion ? (
        <img src={poster} alt={alt} />
      ) : (
        <video
          ref={videoRef}
          loop
          muted
          playsInline
          poster={poster}
          preload="none"
          aria-label={alt}
        >
          <source src={src} type="video/webm" />
          <img src={poster} alt={alt} />
        </video>
      )}
    </div>
  );
}

function HeroProductMotion() {
  return (
    <ProductMotion
      alt="RepSync showing an approved application converted into an active client account."
      poster="/media/repsync-workflow-poster.png?v=20260729-light-tour"
      src="/media/repsync-workflow-motion.webm?v=20260729-light-tour"
    />
  );
}

function ClientExperienceMotion() {
  return (
    <ProductMotion
      alt="RepSync client app showing today's plan, workouts, an active exercise logger and rest timer, nutrition, habits, check-ins, messages, and progress."
      poster="/media/repsync-client-experience-poster.png?v=20260729-client-workout-tour"
      src="/media/repsync-client-experience.webm?v=20260729-client-workout-tour"
    />
  );
}

function JourneyGrid() {
  return (
    <section className="rs-stitch-band rs-stitch-band--dark">
      <div className="rs-stitch-container">
        <SectionIntro
          eyebrow="Client journey"
          title="Keep the full client record from application onward."
          body="Answers, conversations, onboarding details, plans, and check-ins stay on the same client record when coaching begins."
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
      title: "Applications and onboarding",
      body: "Keep application answers, approval status, onboarding, and workspace setup on the client record.",
      icon: <MousePointerClick />,
    },
    {
      title: "Coaching delivery",
      body: "Manage programs, nutrition, habits, check-ins, progress, notes, and messages for each client.",
      icon: <Dumbbell />,
    },
    {
      title: "Attention signals",
      body: "Review specific reasons such as missed check-ins, stale leads, and client inactivity.",
      icon: <ClipboardCheck />,
    },
    {
      title: "Workspace access",
      body: "Set access for owners, coaches, assistants, and viewers by role and client assignment.",
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
          <h2>Bring active coaching work with you.</h2>
          <p>
            A platform change can include client records, current programs,
            check-in schedules, messages, team access, and exercise templates.
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
          <SiteLink to="/compare/truecoach" variant="secondary">
            Moving from TrueCoach
          </SiteLink>
          <SiteLink to="/compare/fitr" variant="secondary">
            Moving from FITR
          </SiteLink>
          <SiteLink to="/switch">Plan your switch</SiteLink>
        </div>
      </div>
    </section>
  );
}

function FinalCta({
  title = "Try RepSync free for seven days.",
  body = "The trial includes the Growth plan. After seven days, choose a plan based on active clients, coach seats, and workspaces.",
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
        <SiteLink to="/start-trial">Start 7-day trial</SiteLink>
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
      "RepSync gives independent coaches one place to manage applications, onboarding, programs, nutrition, check-ins, messages, and client follow-up.",
  });

  return (
    <>
      <HomeIntroGate />
      <PublicLayout>
        <section className="rs-stitch-hero">
          <div className="rs-stitch-hero__copy rs-stitch-reveal is-visible">
            <p className="rs-stitch-kicker">
              Built for independent trainers and small teams
            </p>
            <h1>Manage clients and deliver coaching.</h1>
            <p>
              RepSync keeps applications, onboarding, programs, nutrition,
              habits, messages, and check-ins in one place. Coaches can see the
              full client history and act on the next task.
            </p>
            <div className="rs-stitch-hero__actions">
              <SiteLink to="/start-trial">Start 7-day trial</SiteLink>
              <SiteLink to="/product" variant="secondary">
                Explore the product
              </SiteLink>
            </div>
          </div>
          <ProductPreview
            image="/media/repsync-workflow-poster.png?v=20260729-light-tour"
            alt="RepSync showing an approved application converted into an active client account."
            caption="An approved application opens the client account with its history intact."
            media={<HeroProductMotion />}
          />
        </section>

        <section className="rs-stitch-section">
          <div className="rs-stitch-container">
            <SectionIntro
              eyebrow="Built for coaches and clients"
              title="A workspace for coaches and an app for clients."
              body="The workspace brings delivery, communication, and follow-up together. The client app keeps daily training and progress straightforward."
            />
            <div className="rs-stitch-pathways">
              <article className="rs-stitch-pathway rs-stitch-reveal">
                <p className="rs-stitch-kicker">For Coaches</p>
                <h3>
                  Manage the business and the coaching from one workspace.
                </h3>
                <p>
                  Review new applications, onboard clients, assign plans, run
                  check-ins, and follow up when someone needs help.
                </p>
                <SiteLink to="/for-coaches" variant="secondary">
                  Explore RepSync for coaches
                </SiteLink>
              </article>
              <SyncRail orientation="v" />
              <article className="rs-stitch-pathway rs-stitch-pathway--client rs-stitch-reveal">
                <p className="rs-stitch-kicker">For Clients</p>
                <h3>See today's plan and record your progress.</h3>
                <p>
                  Open RepSync to find your workout, nutrition guidance, habits,
                  messages, and next check-in.
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
              eyebrow="Day-to-day workflow"
              title="Handle sales, delivery, and follow-up in RepSync."
              body="Applications, onboarding notes, and coaching activity stay together, giving coaches the information they need for the next decision."
            />
            <ChapterGrid />
          </div>
        </section>

        <section className="rs-stitch-section rs-stitch-section--sage">
          <div className="rs-stitch-container rs-stitch-client-grid">
            <ProductPreview
              image="/media/repsync-client-experience-poster.png?v=20260729-client-workout-tour"
              alt="RepSync client app showing today's plan, workouts, an active exercise logger and rest timer, nutrition, habits, check-ins, messages, and progress."
              caption="The client app keeps daily tasks, messages, and progress easy to reach."
              media={<ClientExperienceMotion />}
            />
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">Client app</p>
              <h2>Give clients a clear view of today's coaching.</h2>
              <p>
                The home screen shows today's workout, nutrition guidance,
                active habits, the next check-in, recent messages, and progress.
              </p>
              <p>
                Coaches keep the wider account history in their workspace while
                clients see the information they use each day.
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
    title: "RepSync product | Client management and coaching delivery",
    description:
      "Review how RepSync handles applications, onboarding, coaching delivery, messages, check-ins, client follow-up, and team access.",
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
      <BloomField
        className="rs-site-bloom rs-product-reference__bloom"
        motionAmount={0.18}
        speed={0.2}
      />
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
      <BloomField className="rs-product-intro__mesh" />
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
        <p>RepSync</p>
        <h2>Product guide</h2>
      </div>
      <nav>
        {productReferenceNav.map(([href, label, icon], index) => (
          <a className={index === 0 ? "is-active" : ""} href={href} key={href}>
            {icon}
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <div className="rs-product-ref-side__trial">
        <p>Use the Growth plan free for seven days.</p>
        <Link to="/start-trial">Start 7-day trial</Link>
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
    "Follow up",
  ];

  return (
    <section className="rs-product-ref-hero">
      <SyncRail />
      <p className="rs-product-ref-label">The product</p>
      <h1>Manage applications, coaching, and follow-up in RepSync.</h1>
      <p>
        Publish your profile, review applicants, onboard clients, assign plans,
        run check-ins, send messages, and manage team access from the same
        account.
      </p>
      <p className="rs-product-ref-hero__note">
        Client details remain available as the work moves from one stage to the
        next.
      </p>
      <div
        className="rs-product-ref-journey"
        aria-label="RepSync client workflow"
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
      body: "Public profile, applications, lead messages, and approval decisions.",
      icon: <MousePointerClick />,
    },
    {
      href: "#onboard",
      number: "02",
      title: "Onboard",
      body: "Workspace assignment, client invitation, initial plan, and check-in schedule.",
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
      body: "Coach-client messages stored with the client account.",
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
      body: "Lifecycle status, risk signals, reasons, and follow-up priorities.",
      icon: <AlertTriangle />,
    },
    {
      href: "#operate",
      number: "07",
      title: "Operate",
      body: "A starting view for leads, check-ins, client alerts, and workspace activity.",
      icon: <Settings />,
    },
    {
      href: "#experience",
      number: "08",
      title: "Client Experience",
      body: "A client home for today's plan, messages, and progress.",
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
        <p className="rs-product-ref-label">Product map</p>
        <h2 id="product-module-map">
          Review each part of the client workflow.
        </h2>
        <p>
          Each module handles a defined task and keeps its information available
          to the next step.
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
            <span>Client details</span>
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
        <h2>Manage applications and approvals.</h2>
        <p>
          Publish your coach profile, collect applications, review prospect
          messages, and approve the people you want to coach.
        </p>
        <ul className="rs-product-ref-checks">
          {[
            "Public coach profile and application",
            "Application answers and lead messages",
            "Approval and onboarding handoff",
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
        body="The lead view shows the published profile, application answers, conversation, and approval status."
        variant="pipeline"
      />
    </section>
  );
}

function ProductReferenceOnboard() {
  const steps = [
    ["Assign", "Place the client in the appropriate workspace."],
    ["Invite", "Send the client an invitation to create their account."],
    ["Configure", "Add the first plan, habits, and check-in schedule."],
  ] as const;

  return (
    <section
      className="rs-product-ref-section rs-product-ref-section--center"
      id="onboard"
    >
      <span className="rs-product-ref-vertical-rail" aria-hidden="true" />
      <p className="rs-product-ref-label">02 Onboard</p>
      <h2>Set up the client account.</h2>
      <p>
        Move an approved lead into a workspace, invite the client, and add their
        starting plan, habits, and check-in schedule.
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
        <h2>Assign coaching from one workspace.</h2>
        <p>
          Create training programs, add nutrition guidance and habits, then
          assign each item to the client.
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
        <h2>Keep messages beside the client's coaching history.</h2>
        <p>
          Send messages from the workspace that holds the client's plan,
          check-ins, and progress.
        </p>
        <p className="rs-product-ref-section-note">
          Client status and assigned work remain available when a coach returns
          to the conversation.
        </p>
      </div>
      <ProductProductMockup
        title="Coach-client messaging"
        body="The messaging view shows the current thread, unread state, and client account using demo data."
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
      <h2>Run recurring check-ins and track every review.</h2>
      <p>
        Schedule each check-in, review the client's response, add feedback, and
        track the remaining follow-up.
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
        <h2>See which clients need follow-up.</h2>
        <p>
          Attention status can flag an active client when a check-in is missed,
          a reply is overdue, or recent activity changes.
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
        <span>Reason for review</span>
        <strong>Missed latest check-in</strong>
        <p>RepSync identifies the trigger for the coach to review.</p>
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
      <h2>Start with the work that needs attention.</h2>
      <p>
        PT Hub shows leads, active clients, overdue check-ins, attention status,
        lifecycle, and workspace activity.
      </p>
      <p className="rs-product-ref-section-note">
        Current priorities appear together in one starting view.
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
        body="The mobile home shows today's workout, habits, nutrition guidance, and next check-in."
        variant="phone"
      />
      <div>
        <p className="rs-product-ref-label">08 Client Experience</p>
        <h2>Show clients today's plan.</h2>
        <p>
          The client home shows the current workout, nutrition guidance, habits,
          next check-in, messages, and progress.
        </p>
        <article className="rs-product-ref-note">
          <h3>Daily client view</h3>
          <p>
            Clients see assigned work and progress. Coaches manage scheduling,
            history, and follow-up in the workspace.
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
      <h2>Set access for every workspace role.</h2>
      <p>
        Add team members, assign client visibility by responsibility, and keep
        owner actions restricted to the account owner.
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
      <p className="rs-product-ref-label">7-day trial</p>
      <h2>Use the Growth plan free for seven days.</h2>
      <div>
        <Link to="/start-trial">Start 7-day trial</Link>
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
        <Link className="rs-product-sidebar__cta" to="/start-trial">
          Start trial
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
        <Link to="/start-trial">Start 7-day trial</Link>
        <Link to="/pricing">View plans</Link>
      </div>
      <span>No card required. Clients use RepSync free.</span>
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
      "Manage applications, client delivery, check-ins, follow-up, and team access with RepSync.",
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
      title: "Assign each client's current plan.",
      body: "Build reusable coaching material, assign the appropriate plan, and preserve the version delivered to that client.",
    },
    {
      title: "Include nutrition guidance and habits.",
      body: "Add nutrition guidance and recurring habits to the client's assigned work.",
    },
    {
      title: "Review check-ins and follow up.",
      body: "Schedule recurring check-ins, review each response, and record the next coaching action.",
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
    "Client information is spread across several tools.",
    "Specific client-attention reasons are useful.",
    "An assistant or small team needs controlled access.",
    "The client experience should better reflect the coaching brand.",
    "Business reporting and client delivery use separate systems.",
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
          <h1>Manage the work around your coaching.</h1>
          <p>
            Use RepSync to handle applications, onboarding, assigned plans,
            check-ins, messages, and follow-up for every client.
          </p>
          <div className="rs-stitch-hero__actions">
            <SiteLink to="/start-trial">Start 7-day trial</SiteLink>
            <SiteLink to="/product" variant="secondary">
              Explore the product
            </SiteLink>
          </div>
        </div>
        <ProductPreview
          image={stitchImages.coaches}
          alt="RepSync coach operations workflow showing lead review, onboarding, delivery, check-ins, and client attention."
          caption="Coach business workflow and attention model"
          media={<HeroProductMotion />}
        />
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="Audience"
            title="RepSync supports several coaching models."
            body="Independent, hybrid, in-person, and small-team coaches can manage the work that happens between sessions."
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
            eyebrow="Lead process"
            title="Track each prospect through one process."
            body="Record the initial inquiry, application, approval, onboarding, and active client status in RepSync."
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
            RepSync records the leads you receive and the steps required to turn
            an approved applicant into a client.
          </p>
        </div>
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <div className="rs-coaches-split">
            <div className="rs-stitch-reveal">
              <SyncRail />
              <p className="rs-stitch-kicker">01 / Before coaching starts</p>
              <h2>Keep the application when a prospect becomes a client.</h2>
              <p>
                Publish a professional profile, collect an application, qualify
                the lead, approve the applicant, and assign the new client to a
                workspace.
              </p>
              <p className="rs-coaches-section-note">
                Application answers and lead conversations remain available on
                the client record.
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
            title="Manage each client's weekly coaching work."
            body="Programs, nutrition guidance, habits, check-ins, messages, and notes remain available in the client's workspace."
          />
          <div className="rs-stitch-card-grid">
            {deliveryBlocks.map((block) => (
              <article
                className="rs-stitch-card rs-stitch-reveal"
                key={block.title}
              >
                <h3>{block.title}</h3>
                <p>{block.body}</p>
              </article>
            ))}
            <article className="rs-stitch-card rs-stitch-reveal">
              <h3>Message clients from the same workspace.</h3>
              <p>
                Review the client's assigned work, check-ins, and history while
                writing a follow-up message.
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
              <h2>Review client status and follow-up signals.</h2>
              <p>
                Lifecycle records whether a client is onboarding, active,
                paused, completed, or churned. Attention signals identify a
                current item for review.
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
              <h2>Give clients a focused daily view.</h2>
              <p>
                Clients see their assigned work, nutrition guidance, habits,
                next check-in, messages, and progress in their own account.
              </p>
              <p className="rs-coaches-section-note">
                Business reporting and team controls remain in the coach view.
              </p>
              <SiteLink to="/for-clients" variant="secondary">
                See the client experience
              </SiteLink>
            </div>
            <ProductPreview
              image={stitchImages.home}
              alt="RepSync client experience showing today's workout, habits, messages, next check-in, and an active workout timer."
              caption="Client-facing coaching view"
              media={<ClientExperienceMotion />}
            />
          </div>
        </div>
      </section>

      <section className="rs-stitch-section rs-stitch-section--sage">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="04 / Operating structure"
            title="Use PT Hub for the business and workspaces for delivery."
            body="PT Hub covers the coach account and business activity. Each workspace contains its own clients, team access, and delivery settings."
          />
          <div className="rs-coaches-scope-grid">
            <article className="rs-stitch-reveal">
              <p className="rs-stitch-kicker">PT Hub</p>
              <h3>Business and owner view</h3>
              <p>
                Review leads, clients, follow-up signals, public profiles,
                account preferences, and workspaces.
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
            title="Set access by role and client assignment."
            body="Owners can add assistant coaches and viewers, then limit access according to each person's work."
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
                    "Assigned client access",
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
            title="Review the work that needs your decision."
            body="PT Hub shows new leads, active clients, overdue check-ins, follow-up signals, and recent workspace activity."
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
            Use these summaries to choose the next lead or client to review.
          </p>
        </div>
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="Product fit"
            title="Check whether RepSync matches your coaching business."
            body="Review the available workflows and current limitations before starting a trial."
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
              <h2>Plan a move from your current platform.</h2>
              <p>
                List active clients, current programs, check-in routines,
                messages, team access, and what needs to remain archived before
                moving live work.
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
        title="Try the full Growth plan for seven days."
        body="Configure a workspace, review the client workflow, and choose a plan based on your active clients, team, and workspace needs."
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
    [
      "Coach message",
      "Read the latest message from your coach.",
      <MessageSquare />,
    ],
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
    "You sign in to see your own coaching account.",
    "Your assigned plan, check-ins, and messages are not part of the coach's public profile.",
    "Workspace roles and client assignments control coaching-team access.",
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
      body: "Sign in to open your client home and continue with your current plan.",
      action: "Log in",
      to: "/login",
      icon: <UserRound />,
    },
    {
      title: "I am looking for a coach",
      body: "Browse published coach profiles, compare coaching approaches, and apply directly to the coach who feels right.",
      action: "Browse coaches",
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
      "Can I use RepSync on my own?",
      "RepSync client accounts are used with a coach. Most clients join from an invitation sent by their coach.",
    ],
    [
      "Can another client see my information?",
      "Other clients are not shown your assigned plan, check-ins, or messages.",
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
          <h1>See today's coaching in one place.</h1>
          <p>
            Review your training, nutrition guidance, habits, check-ins,
            messages, and progress from your client account.
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
          alt="RepSync client home showing assigned work, check-ins, messages, progress, and next actions."
          caption="Focused client coaching view"
          media={<ClientExperienceMotion />}
        />
      </section>

      <section className="rs-stitch-section">
        <div className="rs-stitch-container">
          <SectionIntro
            eyebrow="01 / Today"
            title="Start with today's assigned work."
            body="Your client home shows the next workout, active habits, coach messages, and upcoming check-in."
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
              <h2>Follow your plan, guidance, and next actions.</h2>
              <p>See what your coach assigned and what you have completed.</p>
            </div>
            <div className="rs-clients-plan-stack">
              <article className="rs-stitch-reveal">
                <span className="rs-stitch-card__icon" aria-hidden="true">
                  <Dumbbell />
                </span>
                <h3>Follow the training your coach has set for you.</h3>
                <p>
                  See scheduled sessions, exercise details, completion state,
                  and upcoming work in the same client account.
                </p>
              </article>
              <article className="rs-stitch-reveal">
                <span className="rs-stitch-card__icon" aria-hidden="true">
                  <Utensils />
                </span>
                <h3>Review nutrition guidance and active habits.</h3>
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
              <p className="rs-stitch-kicker">03 / Check-ins and messages</p>
              <h2>Complete check-ins and message your coach.</h2>
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
              <h3>Complete each scheduled check-in.</h3>
              <p>
                See when a check-in is available, submit your responses, and
                read your coach's review when it is ready.
              </p>
            </article>
            <article className="rs-stitch-reveal">
              <h3>Ask questions in your client account.</h3>
              <p>
                Send your coach questions and keep their replies with your
                coaching history.
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
              <h2>Review your completed work and coaching history.</h2>
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
            title="Your coaching information is private to your account."
            body="A coach's public profile is separate from your assigned plan, check-ins, messages, and progress."
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
            title="Choose how you are entering RepSync."
            body="Open a coach invitation, sign in to an existing account, or browse published coach profiles."
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
        <p className="rs-stitch-kicker">Client access</p>
        <h2>Open your client account.</h2>
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
    title: "Switch to RepSync | Migration planning",
    description:
      "Plan a move to RepSync by reviewing active clients, current assignments, available transfer methods, and launch steps.",
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
      "Active clients, coaches, assistants, viewers, workspace memberships, and invitation status.",
    ],
    [
      "Active coaching",
      "Current programs, nutrition guidance, habits, check-in cadence, upcoming sessions, and the next required client action.",
    ],
    [
      "Current communication",
      "Active client conversations, unread items, current follow-up, and the channel the team will use during the transition.",
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
          <p className="rs-stitch-kicker">Migration planning</p>
          <h1>Plan your move to RepSync.</h1>
          <p>
            Review the client work that must continue, the records available for
            transfer, and the items that should remain archived.
          </p>
          <div className="rs-stitch-hero__actions">
            <SiteLink to="/start-trial">Start 7-day trial</SiteLink>
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
            Keep current coaching work available throughout the move. Historical
            records can remain in an export or read-only archive when needed.
          </p>
        </aside>
      </section>

      <section className="rs-switch-section rs-switch-section--move">
        <div className="rs-switch-section__intro rs-stitch-reveal">
          <p className="rs-stitch-kicker">Data review</p>
          <h2>List the active work and the records to archive.</h2>
          <p>
            Identify the information required for current coaching, then decide
            how to preserve older records for reference.
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
          <h2>Confirm the transfer method for each data type.</h2>
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
          <h2>Assign one active system to each workflow.</h2>
          <p>
            Decide where the team will update assignments, check-ins, and
            messages during each stage of the move. This prevents conflicting
            versions across the two systems.
          </p>
          <strong>
            Start with a small client group and verify access, assignments, and
            messages before inviting the remaining clients.
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
          <h2>Review how your current platform handles each workflow.</h2>
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
          <p className="rs-stitch-kicker">Migration questions</p>
          <h2>Confirm migration limits before rollout.</h2>
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
        <p className="rs-stitch-kicker">First group</p>
        <h2>Configure RepSync with a small group first.</h2>
        <p>
          Use the seven-day Growth trial to configure your workspace, verify
          access, and understand what should move before inviting active
          clients.
        </p>
        <div className="rs-stitch-cta__actions">
          <SiteLink to="/start-trial">Start 7-day trial</SiteLink>
          <SiteLink to="/for-coaches" variant="secondary">
            Explore RepSync for coaches
          </SiteLink>
        </div>
        <p className="rs-switch-final__note">
          Migration support depends on the source platform and available data.
        </p>
      </section>
    </PublicLayout>
  );
}

export function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">(
    "monthly",
  );

  usePublicSeo({
    title: "Plans | RepSync",
    description:
      "Compare RepSync plans for independent coaches and coaching teams, with every plan including the core coaching workflow.",
  });

  return (
    <PublicLayout>
      <section className="rs-pricing-hero">
        <div className="rs-pricing-hero__copy rs-stitch-reveal is-visible">
          <p className="rs-stitch-kicker">Plans</p>
          <h1>Choose a plan for your current client load.</h1>
          <p>
            Every plan includes applications, client delivery, check-ins,
            messaging, and follow-up. Plan limits are based on active clients,
            coach seats, workspaces, and published packages.
          </p>
          <div
            className="rs-pricing-hero__assurances"
            aria-label="Trial details"
          >
            <span>7-day Growth trial</span>
            <span>No card required</span>
            <span>Clients use RepSync free</span>
          </div>
          <div className="rs-pricing-hero__conversion">
            <p>
              <strong>Plans from $19/month.</strong>
              Choose your capacity after the Growth trial.
            </p>
            <SiteLink to="/start-trial">Start 7-day trial</SiteLink>
          </div>
        </div>
      </section>

      <section className="rs-pricing-plans" aria-label="RepSync plans">
        <div
          className={`rs-pricing-period rs-stitch-reveal is-visible${billingPeriod === "annual" ? " is-annual" : ""}`}
          role="group"
          aria-label="Choose a billing period"
        >
          <button
            className={billingPeriod === "monthly" ? "is-active" : ""}
            type="button"
            aria-pressed={billingPeriod === "monthly"}
            onClick={() => setBillingPeriod("monthly")}
          >
            Monthly
          </button>
          <button
            className={billingPeriod === "annual" ? "is-active" : ""}
            type="button"
            aria-pressed={billingPeriod === "annual"}
            onClick={() => setBillingPeriod("annual")}
          >
            Annual
            <span>Two months free</span>
          </button>
        </div>
        <div className="rs-pricing-plan-grid">
          {pricingPlans.map((plan) => (
            <article
              className={`rs-pricing-plan rs-stitch-reveal${plan.featured ? " rs-pricing-plan--featured" : ""}`}
              key={plan.name}
            >
              <div className="rs-pricing-plan__header">
                <p className="rs-stitch-kicker">{plan.name}</p>
                {plan.featured ? <span>Most popular</span> : null}
              </div>
              <p className="rs-pricing-plan__audience">{plan.audience}</p>
              <p className="rs-pricing-plan__price" aria-live="polite">
                <strong>
                  {billingPeriod === "monthly"
                    ? plan.monthlyPrice
                    : plan.annualPrice}
                </strong>
                <span>
                  per {billingPeriod === "monthly" ? "month" : "year"}
                </span>
              </p>
              <ul className="rs-pricing-plan__limits">
                {plan.limits.map((limit) => (
                  <li key={limit}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span>{limit}</span>
                  </li>
                ))}
              </ul>
              <p className="rs-pricing-plan__summary">{plan.summary}</p>
              <SiteLink
                to={buildTrialPath(plan.id)}
                variant={plan.featured ? "primary" : "secondary"}
              >
                Start 7-day trial
              </SiteLink>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-pricing-core">
        <div className="rs-pricing-section-heading rs-stitch-reveal">
          <p className="rs-stitch-kicker">All plans include</p>
          <h2>Every plan includes the core coaching features.</h2>
          <p>
            Launch includes the same core workflows as the larger plans, with
            lower limits for active clients, coach seats, workspaces, and
            published packages.
          </p>
        </div>
        <ul className="rs-pricing-core__grid rs-stitch-reveal">
          {pricingCoreFeatures.map((feature) => (
            <li key={feature}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <p className="rs-pricing-core__note rs-stitch-reveal">
          Plans differ mainly by capacity, team structure, workspace needs,
          advanced reporting, and operating controls.
        </p>
      </section>

      <section className="rs-pricing-seats">
        <div className="rs-pricing-seats__intro rs-stitch-reveal">
          <p className="rs-stitch-kicker">Additional coach seats</p>
          <h2>Add coach seats separately from client capacity.</h2>
          <p>
            Additional coach seats cost $9 per month. An additional seat adds
            team access but does not increase the active-client allowance.
          </p>
        </div>
        <div className="rs-pricing-seats__limits rs-stitch-reveal">
          <p>
            <strong>Launch</strong>
            <span>Maximum 2 total seats</span>
          </p>
          <p>
            <strong>Growth</strong>
            <span>Maximum 5 total seats</span>
          </p>
          <p>
            <strong>Scale</strong>
            <span>Maximum 10 total seats</span>
          </p>
          <p>
            <strong>Studio</strong>
            <span>Custom above 10</span>
          </p>
        </div>
      </section>

      <section className="rs-pricing-counts">
        <div className="rs-pricing-section-heading rs-stitch-reveal">
          <p className="rs-stitch-kicker">Plan limits</p>
          <h2>Plan limits use four definitions.</h2>
        </div>
        <div className="rs-pricing-counts__grid">
          {pricingDefinitions.map((definition, index) => (
            <article className="rs-stitch-reveal" key={definition.title}>
              <span>0{index + 1}</span>
              <h3>{definition.title}</h3>
              <p>{definition.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-pricing-client-access">
        <div className="rs-stitch-reveal">
          <p className="rs-stitch-kicker">Client access</p>
          <h2>Client accounts are free.</h2>
        </div>
        <div className="rs-stitch-reveal">
          <p>
            Clients do not pay RepSync to view their coaching, complete
            workouts, follow nutrition guidance, track habits, submit check-ins,
            or message their coach.
          </p>
          <p>
            Any fee a client pays for coaching is set by the coach and is
            separate from the coach's RepSync software subscription.
          </p>
        </div>
      </section>

      <section className="rs-pricing-trial">
        <div className="rs-pricing-trial__copy rs-stitch-reveal">
          <p className="rs-stitch-kicker">7-day Growth trial</p>
          <h2>Try Growth for seven days before choosing a plan.</h2>
          <p>
            Explore a sample workspace, configure your own workspace, and
            compare the plan limits after testing the available features.
          </p>
          <SiteLink to="/start-trial">Start 7-day trial</SiteLink>
        </div>
        <ul className="rs-pricing-trial__details rs-stitch-reveal">
          {[
            "No card required",
            "One trial per coach account",
            "Trial begins after the first workspace is ready",
            "Trial lasts seven calendar days",
            "Plan intent does not create a charge",
          ].map((detail) => (
            <li key={detail}>
              <CheckCircle2 size={17} aria-hidden="true" />
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rs-pricing-final rs-stitch-reveal">
        <SyncRail />
        <p className="rs-stitch-kicker">Get started</p>
        <h2>Start a seven-day Growth trial.</h2>
        <p>
          Explore the full coaching workflow, then choose the capacity that fits
          your client base, team, and workspace structure.
        </p>
        <div className="rs-stitch-cta__actions">
          <SiteLink to="/start-trial">Start 7-day trial</SiteLink>
          <SiteLink to="/product" variant="secondary">
            Explore the product
          </SiteLink>
        </div>
        <p className="rs-pricing-final__note">
          No card required. Clients use RepSync free.
        </p>
      </section>
      <PublicMobileTrialBar />
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
        <div className="rs-stitch-container">
          <h2 className="sr-only">{title} details</h2>
          {children}
        </div>
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
      title="Answers about using RepSync."
      description="Review product features, client access, plans, migration, integrations, security, and privacy."
    >
      <div className="rs-public-faq-groups">
        {publicFaqGroups.map((group, groupIndex) => {
          const headingId = `faq-group-${groupIndex}`;
          return (
            <section
              aria-labelledby={headingId}
              className="rs-public-faq-group rs-stitch-reveal"
              key={group.category}
            >
              <h2 id={headingId}>{group.category}</h2>
              <div className="rs-stitch-faq">
                {group.items.map((item) => (
                  <details key={item.q}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                    {item.href ? <Link to={item.href}>Read more</Link> : null}
                  </details>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </SimpleInfoPage>
  );
}

export function SecurityPage() {
  return (
    <SimpleInfoPage
      eyebrow="Security"
      title="Private coaching data requires authenticated access."
      description="RepSync separates published coach profiles from private client records and uses workspace roles to control access."
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
      title="Interim privacy notice"
      description="This interim notice explains the categories of account, profile, coaching, application, and marketing information RepSync may process while the final policy is under review."
      robots={legalReviewRequired ? "noindex,nofollow" : "index,follow"}
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
            "Private coaching areas may include programs, nutrition, habits, check-ins, messages, notes, progress, and wearable information.",
          ],
          [
            <MessageSquare />,
            "Marketing forms",
            "Switch-planning forms collect contact details and information about the requested move so the team can respond.",
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
      title="Interim terms of use"
      description="These interim terms describe responsible use of RepSync's public and authenticated surfaces while the final terms are under review."
      robots={legalReviewRequired ? "noindex,nofollow" : "index,follow"}
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
      description="RepSync uses essential browser storage for account and application operation. Anonymous public-site analytics are optional and remain off until you allow them."
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
      <CookiePreferenceControls />
    </SimpleInfoPage>
  );
}

export function SupportPage() {
  return (
    <SimpleInfoPage
      eyebrow="Support"
      title="Contact RepSync support."
      description="Send the support team questions about the product, billing, privacy, or security."
    >
      <FinalCta title="Request a product walkthrough." />
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
      title={`Compare RepSync with ${competitor}`}
      description={`Review applications, client delivery, check-ins, follow-up signals, team access, and current RepSync limitations before moving from ${competitor}.`}
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
