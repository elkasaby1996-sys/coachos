import {
  FormEvent,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";
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
  type ComparisonFeature,
  type MarketingFeature,
  type MarketingFeatureCategory,
  type MarketingPreviewId,
  type MigrationCategory,
  getPublicTrustClaims,
  getVisibleFaqItems,
  getComparisonCategories,
  getActiveMarketingFeatures,
  getComparisonPageData,
  getMarketingCtaDestination,
  getMarketingFeaturesByAudience,
  getMarketingFeaturesByCategory,
  migrationMatrix,
  legalReviewRequired,
  legalSiteConfig,
  marketingProductFeatures,
  marketingRouteMetadata,
  productPreviewGroups,
  publicFaqGroups,
  repSyncOperatingFlow,
  switchingProblems,
  switchingSteps,
  trustClaims,
  unavailableMarketingCapabilities,
} from "../../lib/marketing-public";
import "../../styles/marketing-home.css";

type SeoConfig = {
  title: string;
  description: string;
  canonicalPath?: string;
  robots?: string;
};

type LeadFormMode = "request_access" | "switch";

type DemoStep = "context" | "calendar" | "confirmation";

type LeadFormState = {
  firstName: string;
  lastName: string;
  email: string;
  businessName: string;
  coachingModel: string;
  activeClientsRange: string;
  currentPlatform: string;
  currentPlatformOther: string;
  primaryReason: string;
  migrationNeeds: string[];
  message: string;
  switchingTimeline: string;
  teamSizeRange: string;
  migrationConcerns: string;
  consent: boolean;
  website: string;
};

const marketingOrigin =
  typeof window === "undefined" ? "" : window.location.origin;

const analyticsConsentStorageKey = "repsync_analytics_consent";

type AnalyticsConsentValue = "accepted" | "rejected";

function readAnalyticsConsent(): AnalyticsConsentValue | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(analyticsConsentStorageKey);
  return value === "accepted" || value === "rejected" ? value : null;
}

function writeAnalyticsConsent(value: AnalyticsConsentValue) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(analyticsConsentStorageKey, value);
}

const defaultLeadForm: LeadFormState = {
  firstName: "",
  lastName: "",
  email: "",
  businessName: "",
  coachingModel: "",
  activeClientsRange: "",
  currentPlatform: "",
  currentPlatformOther: "",
  primaryReason: "",
  migrationNeeds: [],
  message: "",
  switchingTimeline: "",
  teamSizeRange: "",
  migrationConcerns: "",
  consent: false,
  website: "",
};

const demoSlots = [
  {
    id: "tue-1000",
    label: "Tuesday",
    time: "10:00",
    detail: "45 min product walkthrough",
    available: true,
  },
  {
    id: "wed-1430",
    label: "Wednesday",
    time: "14:30",
    detail: "Coach workflow review",
    available: true,
  },
  {
    id: "thu-0900",
    label: "Thursday",
    time: "09:00",
    detail: "Unavailable",
    available: false,
  },
  {
    id: "fri-1600",
    label: "Friday",
    time: "16:00",
    detail: "Switch planning demo",
    available: true,
  },
] as const;

const currentPlatformOptions = [
  ["truecoach", "TrueCoach"],
  ["fitr", "FITR"],
  ["trainerize", "Trainerize"],
  ["spreadsheets", "Spreadsheets"],
  ["multiple_tools", "Multiple tools"],
  ["none", "None"],
  ["other", "Other"],
] as const;

const coachingModelOptions = [
  ["online", "Online"],
  ["hybrid", "Hybrid"],
  ["in_person", "In person"],
  ["mixed", "Mixed"],
] as const;

const activeClientRangeOptions = [
  ["0_5", "0-5"],
  ["6_20", "6-20"],
  ["21_50", "21-50"],
  ["51_plus", "51+"],
] as const;

const teamSizeRangeOptions = [
  ["solo", "Solo"],
  ["2_3", "2-3"],
  ["4_10", "4-10"],
  ["11_plus", "11+"],
] as const;

const switchingTimelineOptions = [
  ["immediately", "Immediately"],
  ["within_30_days", "Within 30 days"],
  ["within_90_days", "Within 90 days"],
  ["later", "Later"],
  ["exploring", "Exploring"],
] as const;

const migrationNeedOptions = [
  ["client_information", "Client information"],
  ["active_programs", "Active programs"],
  ["program_templates", "Program templates"],
  ["nutrition", "Nutrition"],
  ["habits", "Habits"],
  ["checkins", "Check-ins"],
  ["documents", "Documents"],
  ["historical_data", "Historical data"],
  ["team_setup", "Team setup"],
  ["other", "Other"],
] as const;

const primaryGoalOptions = [
  ["lead_to_client", "Lead-to-client continuity"],
  ["client_attention", "Client attention visibility"],
  ["team_workspace", "Small-team workspace control"],
  ["delivery_clarity", "Delivery and check-in clarity"],
  ["migration_planning", "Migration planning"],
] as const;

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
    body: "Profiles, applications, lead context.",
  },
  {
    title: "Once they start",
    body: "Onboarding, programs, check-ins.",
  },
  {
    title: "While you coach",
    body: "Training, nutrition, habits, notes.",
  },
  {
    title: "Before they drift",
    body: "Attention cues before silence.",
  },
];

const productPillars = [
  {
    title: "Acquire",
    body: "Profiles and applications.",
  },
  {
    title: "Coach",
    body: "Programs and check-ins.",
  },
  {
    title: "Retain",
    body: "Attention and follow-up.",
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
    a: "Pricing is not public yet. The site routes interested coaches to book a demo so the team can qualify fit and explain the current product stage.",
  },
  {
    q: "Does RepSync make compliance claims?",
    a: "No. The public site avoids HIPAA, GDPR, SOC2, or medical claim language unless those programs are formally in place.",
  },
];

const switchFaqItems = [
  {
    q: "Can RepSync automatically import everything?",
    a: "No. RepSync does not promise a complete automated import. The switch process reviews what can be imported, recreated, or archived.",
  },
  {
    q: "Can you help move active clients?",
    a: "RepSync supports client accounts and workspace assignment. Active-client moves are planned case by case so invitations, assignments, and check-ins are not rushed.",
  },
  {
    q: "Can programs be transferred?",
    a: "RepSync supports programs, but transfer support depends on the source export and program structure. Some work may need to be recreated.",
  },
  {
    q: "Will clients need new accounts?",
    a: "Clients use RepSync client accounts for the private app experience. The launch plan should include invite timing and client communication.",
  },
  {
    q: "Can I continue using my current platform during the transition?",
    a: "Yes. The safest transition may keep historical records or current billing in the previous system while active delivery moves deliberately.",
  },
  {
    q: "How long does a switch take?",
    a: "It depends on active-client count, data quality, team structure, and how much history needs review. RepSync avoids promising a fixed timeline before assessment.",
  },
  {
    q: "Is switching support included during early access?",
    a: "Switch planning is part of the early-access conversation. The scope is confirmed after reviewing your current workflow and migration needs.",
  },
];

function trackMarketingEvent(
  name: string,
  properties: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;
  if (readAnalyticsConsent() !== "accepted") return;
  try {
    window.dispatchEvent(
      new CustomEvent("repsync:marketing-event", {
        detail: { name, properties, path: window.location.pathname },
      }),
    );
  } catch {
    // Marketing analytics must never block navigation or form interaction.
  }
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

function usePageMetadata({
  title,
  description,
  canonicalPath,
  robots = "index,follow",
}: SeoConfig) {
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

    ensureMeta('meta[name="robots"]', () => {
      const tag = document.createElement("meta");
      tag.name = "robots";
      return tag;
    }).content = robots;

    ensureMeta('meta[property="og:url"]', () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:url");
      return tag;
    }).content =
      `${marketingOrigin}${canonicalPath ?? window.location.pathname}`;

    ensureMeta('meta[property="og:image"]', () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:image");
      return tag;
    }).content = `${marketingOrigin}/og-repsync.png`;

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

    ensureMeta('meta[name="twitter:image"]', () => {
      const tag = document.createElement("meta");
      tag.name = "twitter:image";
      return tag;
    }).content = `${marketingOrigin}/og-repsync.png`;

    ensureLink('link[rel="canonical"]', () => {
      const tag = document.createElement("link");
      tag.rel = "canonical";
      return tag;
    }).href = `${marketingOrigin}${canonicalPath ?? window.location.pathname}`;
  }, [canonicalPath, description, robots, title]);
}

function StructuredData({
  id,
  data,
}: {
  id: string;
  data: Record<string, unknown>;
}) {
  useEffect(() => {
    const scriptId = `structured-data-${id}`;
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.text = JSON.stringify(data);
    return () => {
      script?.remove();
    };
  }, [data, id]);

  return null;
}

function buildBreadcrumbData(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${marketingOrigin}${item.path}`,
    })),
  };
}

function buildFaqData(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
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

function CookieConsentPanel() {
  const [choice, setChoice] = useState<AnalyticsConsentValue | null>(() =>
    readAnalyticsConsent(),
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("repsync:open-cookie-preferences", onOpen);
    return () =>
      window.removeEventListener("repsync:open-cookie-preferences", onOpen);
  }, []);

  useEffect(() => {
    if (!choice) setOpen(true);
  }, [choice]);

  const updateChoice = (value: AnalyticsConsentValue) => {
    writeAnalyticsConsent(value);
    setChoice(value);
    setOpen(false);
    if (value === "accepted") {
      trackMarketingEvent("analytics_consent_changed", {
        page: window.location.pathname,
        consent: "accepted",
      });
    }
  };

  if (!open) return null;

  return (
    <div
      className="rs-consent-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
    >
      <div>
        <p className="rs-eyebrow">Cookie preferences</p>
        <h2 id="cookie-consent-title">Choose optional analytics.</h2>
        <p id="cookie-consent-description">
          Essential storage keeps RepSync working. Optional analytics helps us
          understand public-site usage and is off until you accept it.
        </p>
      </div>
      <div className="rs-consent-actions">
        <button
          className="rs-button"
          type="button"
          onClick={() => updateChoice("accepted")}
        >
          Accept analytics
        </button>
        <button
          className="rs-button rs-button--quiet"
          type="button"
          onClick={() => updateChoice("rejected")}
        >
          Reject optional
        </button>
        {choice ? (
          <button
            className="rs-link-button"
            type="button"
            onClick={() => setOpen(false)}
          >
            Keep current choice
          </button>
        ) : null}
      </div>
    </div>
  );
}

function openCookiePreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("repsync:open-cookie-preferences"));
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
  const location = useLocation();

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
        ["#main > section:not(:first-child)", ".rs-workflow-step"].join(","),
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
  const navItems = [
    {
      label: "Product",
      to: "/product",
      active: location.pathname === "/product",
    },
    {
      label: "For coaches",
      to: "/for-coaches",
      active: location.pathname === "/for-coaches",
    },
    {
      label: "For clients",
      to: "/for-clients",
      active: location.pathname === "/for-clients",
    },
    {
      label: "Why RepSync",
      to: "/#why",
      active: location.pathname === "/" && location.hash === "#why",
    },
    {
      label: "Switch",
      to: "/switch",
      active:
        location.pathname === "/switch" ||
        location.pathname.startsWith("/compare/"),
    },
  ] as const;

  return (
    <div className={`marketing-home-page ${menuOpen ? "menu-open" : ""}`}>
      <StructuredData
        id="organization"
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: legalSiteConfig.businessName,
          url: marketingOrigin || "https://www.repsync.com",
          contactPoint: [
            {
              "@type": "ContactPoint",
              email: legalSiteConfig.contactEmail,
              contactType: "customer support",
            },
            {
              "@type": "ContactPoint",
              email: legalSiteConfig.securityEmail,
              contactType: "security",
            },
          ],
        }}
      />
      <StructuredData
        id="software"
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "RepSync",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description:
            "Coaching business and client management software for public profiles, applications, coaching delivery, check-ins, messaging, attention, and workspace oversight.",
        }}
      />
      <a className="rs-skip-link" href="#main">
        Skip to content
      </a>

      <header
        className={`rs-site-header ${scrolled ? "is-scrolled" : ""}`}
        aria-label="Primary navigation"
      >
        <BrandMark />

        <nav className="rs-desktop-nav" aria-label="Site sections">
          {navItems.map((item) => (
            <Link
              className={item.active ? "is-current" : undefined}
              aria-current={item.active ? "page" : undefined}
              to={item.to}
              key={item.to}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="rs-header-actions">
          <Link className="rs-text-link" to="/login">
            Log in
          </Link>
          <MarketingCta intent="primary" className="rs-button rs-button--small">
            Book a demo
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
          {navItems.slice(0, 3).map((item) => (
            <Link
              className={item.active ? "is-current" : undefined}
              aria-current={item.active ? "page" : undefined}
              to={item.to}
              onClick={closeMenu}
              key={item.to}
            >
              {item.label}
            </Link>
          ))}
          <Link to="/coaches" onClick={closeMenu}>
            Coach marketplace
          </Link>
          <Link
            className={navItems[4].active ? "is-current" : undefined}
            aria-current={navItems[4].active ? "page" : undefined}
            to="/switch"
            onClick={closeMenu}
          >
            Switch
          </Link>
          <Link to="/login" onClick={closeMenu}>
            Log in
          </Link>
          <Link to="/book-demo" onClick={closeMenu}>
            Book a demo
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
        <div className="rs-site-footer__brand">
          <BrandMark />
          <p>
            Coaching business and client-management software for independent
            trainers and small teams.
          </p>
        </div>
        <nav className="rs-site-footer__nav" aria-label="Footer navigation">
          {(
            [
              {
                label: "Product",
                links: [
                  ["Product", "/product"],
                  ["For coaches", "/for-coaches"],
                  ["For clients", "/for-clients"],
                  ["Coach marketplace", "/coaches"],
                  ["Book a demo", "/book-demo"],
                ],
              },
              {
                label: "Switch",
                links: [
                  ["Plan your switch", "/switch"],
                  ["TrueCoach", "/compare/truecoach"],
                  ["Fitr", "/compare/fitr"],
                ],
              },
              {
                label: "Trust",
                links: [
                  ["Security", "/security"],
                  ["FAQ", "/faq"],
                  ["Privacy", "/privacy"],
                  ["Terms", "/terms"],
                  ["Cookies", "/cookies"],
                ],
              },
            ] as Array<{ label: string; links: Array<[string, string]> }>
          ).map((group) => (
            <div className="rs-site-footer__group" key={group.label}>
              <p>{group.label}</p>
              {group.links.map(([label, href]) => (
                <Link key={href} to={href}>
                  {label}
                </Link>
              ))}
              {group.label === "Trust" ? (
                <button type="button" onClick={openCookiePreferences}>
                  Manage cookies
                </button>
              ) : null}
            </div>
          ))}
        </nav>
      </footer>
      <CookieConsentPanel />
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
        active_clients_range: form.activeClientsRange,
        clients_range: form.activeClientsRange,
        current_platform: form.currentPlatform,
        current_platform_other: form.currentPlatformOther.trim(),
        current_tools:
          form.currentPlatform === "other"
            ? form.currentPlatformOther.trim()
            : form.currentPlatform,
        primary_reason: form.primaryReason,
        goal: form.primaryReason,
        migration_needs: form.migrationNeeds,
        message: form.message.trim(),
        switching_timeline: form.switchingTimeline,
        team_size_range: form.teamSizeRange,
        team_size: form.teamSizeRange,
        data_to_move: form.migrationNeeds.join(", "),
        migration_concerns: form.migrationConcerns.trim(),
        migration_notes: [
          form.migrationNeeds.join(", "),
          form.migrationConcerns.trim(),
        ]
          .filter(Boolean)
          .join("\n\n"),
        consent: form.consent,
        website: form.website,
        page_path: window.location.pathname,
        referrer: document.referrer,
        utm_source: new URLSearchParams(window.location.search).get(
          "utm_source",
        ),
        utm_medium: new URLSearchParams(window.location.search).get(
          "utm_medium",
        ),
        utm_campaign: new URLSearchParams(window.location.search).get(
          "utm_campaign",
        ),
        utm_content: new URLSearchParams(window.location.search).get(
          "utm_content",
        ),
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
  if (!form.activeClientsRange) return "Select your active client range.";
  if (mode === "switch") {
    if (!form.currentPlatform) return "Select your current platform.";
    if (form.currentPlatform === "other" && !form.currentPlatformOther.trim()) {
      return "Tell us the other platform.";
    }
    if (!form.switchingTimeline) return "Select your switching timeline.";
    if (!form.teamSizeRange) return "Select your team size.";
    if (form.migrationNeeds.length === 0) {
      return "Select at least one migration need.";
    }
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
  const platformOtherId = useId();
  const reasonId = useId();
  const messageId = useId();
  const timelineId = useId();
  const teamSizeId = useId();
  const migrationNeedsId = useId();
  const concernsId = useId();
  const consentId = useId();
  const websiteId = useId();

  const update = (
    key: keyof LeadFormState,
    value: string | boolean | string[],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (message) setMessage("");
  };

  const toggleMigrationNeed = (value: string, checked: boolean) => {
    setForm((current) => {
      const nextNeeds = checked
        ? Array.from(new Set([...current.migrationNeeds, value]))
        : current.migrationNeeds.filter((item) => item !== value);
      return { ...current, migrationNeeds: nextNeeds };
    });
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
    trackMarketingEvent(
      mode === "switch" ? "switch_form_started" : "request_access_form_started",
      {
        page: window.location.pathname,
        platform: form.currentPlatform || undefined,
        switching_timeline: form.switchingTimeline || undefined,
        active_clients_range: form.activeClientsRange || undefined,
        team_size_range: form.teamSizeRange || undefined,
      },
    );

    try {
      await submitMarketingLead(mode, form);
      setStatus("sent");
      setMessage(
        mode === "switch"
          ? "Thanks. Your switch request has been received."
          : "Thanks. Your demo request has been received.",
      );
      trackMarketingEvent(
        mode === "switch"
          ? "switch_form_submitted"
          : "request_access_form_submitted",
        {
          page: window.location.pathname,
          platform: form.currentPlatform || undefined,
          switching_timeline: form.switchingTimeline || undefined,
          active_clients_range: form.activeClientsRange || undefined,
          team_size_range: form.teamSizeRange || undefined,
        },
      );
    } catch (error) {
      setStatus("idle");
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
      trackMarketingEvent(
        mode === "switch" ? "switch_form_failed" : "request_access_form_failed",
        {
          page: window.location.pathname,
          platform: form.currentPlatform || undefined,
          switching_timeline: form.switchingTimeline || undefined,
          active_clients_range: form.activeClientsRange || undefined,
          team_size_range: form.teamSizeRange || undefined,
        },
      );
    }
  };

  const isSubmitting = status === "submitting";
  const isSent = status === "sent";
  const showSwitchFields = mode === "switch";

  return (
    <form
      className="rs-lead-form"
      onSubmit={handleSubmit}
      noValidate
      aria-describedby="marketing-form-status"
    >
      <div className="rs-form-grid">
        <label htmlFor={firstNameId}>
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
        <label htmlFor={lastNameId}>
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
        <label htmlFor={emailId}>
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
        <label htmlFor={businessId}>
          <span>Business name</span>
          <input
            id={businessId}
            value={form.businessName}
            onChange={(event) => update("businessName", event.target.value)}
            placeholder="Optional"
            autoComplete="organization"
          />
        </label>
      </div>

      <div className="rs-form-grid">
        <label htmlFor={modelId}>
          <span>Coaching model</span>
          <select
            id={modelId}
            value={form.coachingModel}
            onChange={(event) => update("coachingModel", event.target.value)}
            aria-invalid={message === "Select your coaching model."}
            required
          >
            <option value="">Select model</option>
            {coachingModelOptions.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={clientsId}>
          <span>Active clients</span>
          <select
            id={clientsId}
            value={form.activeClientsRange}
            onChange={(event) =>
              update("activeClientsRange", event.target.value)
            }
            aria-invalid={message === "Select your active client range."}
            required
          >
            <option value="">Select range</option>
            {activeClientRangeOptions.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showSwitchFields ? (
        <>
          <div className="rs-form-grid">
            <label htmlFor={platformId}>
              <span>Current platform</span>
              <select
                id={platformId}
                value={form.currentPlatform}
                onChange={(event) => {
                  const value = event.target.value;
                  update("currentPlatform", value);
                  trackMarketingEvent("switch_platform_selected", {
                    page: window.location.pathname,
                    platform: value,
                  });
                }}
                aria-invalid={message === "Select your current platform."}
                required
              >
                <option value="">Select platform</option>
                {currentPlatformOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {form.currentPlatform === "other" ? (
              <label htmlFor={platformOtherId}>
                <span>Other platform</span>
                <input
                  id={platformOtherId}
                  value={form.currentPlatformOther}
                  onChange={(event) =>
                    update("currentPlatformOther", event.target.value)
                  }
                  aria-invalid={message === "Tell us the other platform."}
                  required
                />
              </label>
            ) : (
              <label htmlFor={timelineId}>
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
                  {switchingTimelineOptions.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {form.currentPlatform === "other" ? (
            <label htmlFor={timelineId}>
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
                {switchingTimelineOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label htmlFor={teamSizeId}>
            <span>Team size</span>
            <select
              id={teamSizeId}
              value={form.teamSizeRange}
              onChange={(event) => update("teamSizeRange", event.target.value)}
              aria-invalid={message === "Select your team size."}
              required
            >
              <option value="">Select team size</option>
              {teamSizeRangeOptions.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <label htmlFor={reasonId}>
        <span>Primary reason</span>
        <select
          id={reasonId}
          value={form.primaryReason}
          onChange={(event) => update("primaryReason", event.target.value)}
          aria-invalid={message === "Select your primary reason."}
          required
        >
          <option value="">Select reason</option>
          {primaryGoalOptions.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {showSwitchFields ? (
        <fieldset
          className="rs-checkbox-group"
          aria-describedby={`${migrationNeedsId}-hint`}
        >
          <legend>Migration needs</legend>
          <p id={`${migrationNeedsId}-hint`}>
            Select everything you want reviewed before switching.
          </p>
          <div>
            {migrationNeedOptions.map(([value, label]) => {
              const id = `${migrationNeedsId}-${value}`;
              return (
                <label htmlFor={id} key={value}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={form.migrationNeeds.includes(value)}
                    onChange={(event) =>
                      toggleMigrationNeed(value, event.target.checked)
                    }
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {showSwitchFields ? (
        <label htmlFor={concernsId}>
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
      ) : null}

      <label htmlFor={messageId}>
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
          I agree RepSync can contact me about this request and have read the{" "}
          <Link to="/privacy">privacy notice</Link>. Do not include client
          health or medical information in this form.
        </span>
      </label>

      <button className="rs-button" type="submit" disabled={status !== "idle"}>
        {isSubmitting
          ? "Sending"
          : isSent
            ? "Request sent"
            : mode === "switch"
              ? "Plan your switch"
              : "Send demo context"}
      </button>
      <p
        className="rs-form-message"
        id="marketing-form-status"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </form>
  );
}

function validateDemoContext(form: LeadFormState) {
  if (form.website.trim()) return "Thanks.";
  if (form.firstName.trim().length < 2) return "Enter your first name.";
  if (form.lastName.trim().length < 2) return "Enter your last name.";
  if (!/\S+@\S+\.\S+/.test(form.email.trim())) {
    return "Enter a valid email address.";
  }
  if (!form.coachingModel) return "Select your coaching model.";
  if (!form.activeClientsRange) return "Select your active client range.";
  if (!form.primaryReason) return "Select your demo focus.";
  if (!form.consent) return "Confirm we can contact you about RepSync.";
  return null;
}

function BookDemoFlow() {
  const [form, setForm] = useState(defaultLeadForm);
  const [step, setStep] = useState<DemoStep>("context");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "loading">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const firstNameId = useId();
  const lastNameId = useId();
  const emailId = useId();
  const businessId = useId();
  const modelId = useId();
  const clientsId = useId();
  const reasonId = useId();
  const notesId = useId();
  const consentId = useId();
  const websiteId = useId();

  const update = (
    key: keyof LeadFormState,
    value: string | boolean | string[],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (message) setMessage("");
  };

  const handleContextSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== "idle") return;

    const validationMessage = validateDemoContext(form);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setStatus("submitting");
    window.setTimeout(() => {
      trackMarketingEvent("demo_context_submitted", {
        page: window.location.pathname,
        active_clients_range: form.activeClientsRange,
        primary_reason: form.primaryReason,
      });
      setStep("calendar");
      setMessage("Context saved. Choose an available demo time.");
      setStatus("idle");
    }, 500);
  };

  const handleConfirmSlot = () => {
    if (!selectedSlot) {
      setMessage("Choose an available demo time.");
      return;
    }
    setStatus("loading");
    window.setTimeout(() => {
      setStatus("idle");
      setStep("confirmation");
      setMessage("Demo time held. RepSync will confirm by email.");
      trackMarketingEvent("demo_slot_selected", {
        page: window.location.pathname,
        selected_slot: selectedSlot,
      });
    }, 650);
  };

  const selectedSlotDetails = demoSlots.find(
    (slot) => slot.id === selectedSlot,
  );
  const isBusy = status !== "idle";

  return (
    <div className="rs-booking-flow">
      <ol className="rs-booking-steps" aria-label="Demo booking progress">
        {[
          ["context", "Context"],
          ["calendar", "Calendar"],
          ["confirmation", "Confirmation"],
        ].map(([id, label]) => (
          <li className={step === id ? "is-active" : ""} key={id}>
            {label}
          </li>
        ))}
      </ol>

      {step === "context" ? (
        <form
          className="rs-lead-form"
          onSubmit={handleContextSubmit}
          noValidate
          aria-describedby="demo-form-status"
        >
          <div className="rs-form-grid">
            <label htmlFor={firstNameId}>
              <span>First name</span>
              <input
                id={firstNameId}
                value={form.firstName}
                onChange={(event) => update("firstName", event.target.value)}
                autoComplete="given-name"
                required
              />
            </label>
            <label htmlFor={lastNameId}>
              <span>Last name</span>
              <input
                id={lastNameId}
                value={form.lastName}
                onChange={(event) => update("lastName", event.target.value)}
                autoComplete="family-name"
                required
              />
            </label>
          </div>
          <div className="rs-form-grid">
            <label htmlFor={emailId}>
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
            <label htmlFor={businessId}>
              <span>Business name</span>
              <input
                id={businessId}
                value={form.businessName}
                onChange={(event) => update("businessName", event.target.value)}
                autoComplete="organization"
              />
            </label>
          </div>
          <div className="rs-form-grid">
            <label htmlFor={modelId}>
              <span>Coaching model</span>
              <select
                id={modelId}
                value={form.coachingModel}
                onChange={(event) =>
                  update("coachingModel", event.target.value)
                }
                required
              >
                <option value="">Select model</option>
                {coachingModelOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={clientsId}>
              <span>Active clients</span>
              <select
                id={clientsId}
                value={form.activeClientsRange}
                onChange={(event) =>
                  update("activeClientsRange", event.target.value)
                }
                required
              >
                <option value="">Select range</option>
                {activeClientRangeOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label htmlFor={reasonId}>
            <span>Demo focus</span>
            <select
              id={reasonId}
              value={form.primaryReason}
              onChange={(event) => update("primaryReason", event.target.value)}
              required
            >
              <option value="">Select focus</option>
              {primaryGoalOptions.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={notesId}>
            <span>What should we prepare?</span>
            <textarea
              id={notesId}
              value={form.message}
              onChange={(event) => update("message", event.target.value)}
              rows={4}
              placeholder="Current tools, client workflow, team setup, or switching questions."
            />
          </label>
          <label className="rs-hidden-field" htmlFor={websiteId}>
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
              I agree RepSync can contact me about this demo and have read the{" "}
              <Link to="/privacy">privacy notice</Link>.
            </span>
          </label>
          <button className="rs-button" type="submit" disabled={isBusy}>
            {status === "submitting"
              ? "Saving context"
              : "Continue to calendar"}
          </button>
          <p
            className="rs-form-message"
            id="demo-form-status"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        </form>
      ) : null}

      {step === "calendar" ? (
        <div
          className="rs-calendar-panel"
          aria-labelledby="demo-calendar-title"
        >
          <div>
            <p className="rs-eyebrow">Calendar</p>
            <h2 id="demo-calendar-title">Choose a demo time.</h2>
            <p>
              This placeholder calendar shows the intended scheduling state. No
              external scheduling service is connected in this local build.
            </p>
          </div>
          <div className="rs-slot-grid">
            {demoSlots.map((slot) => (
              <button
                className={selectedSlot === slot.id ? "is-selected" : ""}
                type="button"
                key={slot.id}
                disabled={!slot.available || isBusy}
                onClick={() => {
                  setSelectedSlot(slot.id);
                  setMessage("");
                }}
                aria-pressed={selectedSlot === slot.id}
              >
                <span>{slot.label}</span>
                <strong>{slot.time}</strong>
                <small>{slot.detail}</small>
              </button>
            ))}
          </div>
          <div className="rs-calendar-actions">
            <button
              className="rs-button rs-button--quiet"
              type="button"
              onClick={() => setStep("context")}
              disabled={isBusy}
            >
              Edit context
            </button>
            <button
              className="rs-button"
              type="button"
              onClick={handleConfirmSlot}
              disabled={isBusy}
            >
              {status === "loading" ? "Holding time" : "Confirm demo"}
            </button>
          </div>
          <p className="rs-form-message" role="status" aria-live="polite">
            {message}
          </p>
        </div>
      ) : null}

      {step === "confirmation" ? (
        <div
          className="rs-confirmation-panel"
          aria-labelledby="demo-confirmed-title"
        >
          <p className="rs-eyebrow">Demo held</p>
          <h2 id="demo-confirmed-title">
            Your RepSync demo is ready to confirm.
          </h2>
          <p>
            We have the coaching context and selected time
            {selectedSlotDetails
              ? `: ${selectedSlotDetails.label} at ${selectedSlotDetails.time}`
              : "."}
            . A RepSync team member will confirm the calendar invite by email.
          </p>
          <div className="rs-confirmation-summary">
            <span>{form.businessName || "Coaching business"}</span>
            <span>{form.email}</span>
            <span>{selectedSlotDetails?.detail ?? "Product walkthrough"}</span>
          </div>
          <Link className="rs-link-cta" to="/product">
            Review the product chapters
          </Link>
        </div>
      ) : null}
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
      <div
        className="rs-preview-card__screen"
        role="img"
        aria-label={group.caption}
      >
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
    ["Lead-to-client continuity", "Profile to approval."],
    ["Specific client attention", "Know who needs you."],
    ["Business and coaching delivery together", "Leads and delivery."],
    ["Controlled coaching workspaces", "Scoped team access."],
  ];

  return (
    <section className="rs-section" id="why" aria-labelledby="why-title">
      <SectionIntro
        eyebrow="Why RepSync"
        title="Built for the work around the workout."
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
    <section
      className="rs-section rs-attention-section"
      aria-labelledby="attention-title"
    >
      <div className="rs-section__heading">
        <p className="rs-eyebrow">Client attention</p>
        <h2 id="attention-title">Lifecycle and attention stay separate.</h2>
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
    <section
      className="rs-section rs-workspace-section"
      aria-labelledby="workspace-title"
    >
      <div>
        <p className="rs-eyebrow">Small-team workspace</p>
        <h2 id="workspace-title">
          Give coaches the right view of shared work.
        </h2>
      </div>
      <div className="rs-workspace-roles">
        {[
          ["Owner", "Settings, clients, leads, team access."],
          ["Assistant coach", "Assigned-client work."],
          ["Viewer", "Read-oriented context."],
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
        body="Verified product architecture only."
      />
      <div className="rs-feature-grid rs-feature-grid--four">
        {[
          ["Role-based access", "Owner, assistant, viewer."],
          ["Client-scoped visibility", "Authenticated routes."],
          ["Supabase authentication", "Configured auth stack."],
          ["Controlled public profiles", "Published only."],
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
    ["Review", "Map the current setup."],
    ["Prepare", "Decide what moves."],
    ["Launch", "Invite and confirm."],
  ];

  return (
    <section
      className="rs-section rs-switch-section"
      aria-labelledby="switch-title"
    >
      <SectionIntro
        eyebrow="Switching"
        title="Switch tools without losing coaching momentum."
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
        <p>Marketed capabilities come from the central availability list.</p>
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
            <div className="rs-hero__visual-label">
              <span>PT Hub</span>
              <span>Live coaching workload</span>
            </div>
            <ProductPreviewFrame group={getPreviewGroup("coach")} featured />
          </div>
        </div>

        <div className="rs-hero__content">
          <p className="rs-eyebrow">
            RepSync for independent trainers and small teams
          </p>
          <h1 id="hero-title">Run the whole coaching business.</h1>
          <p className="rs-hero__lede">
            More than workout delivery. RepSync connects public profiles,
            applications, delivery, attention cues, and the workspace that keeps
            the week moving.
          </p>
          <div className="rs-hero__actions">
            <MarketingCta intent="primary">Book a demo</MarketingCta>
            <MarketingCta
              intent="product"
              className="rs-button rs-button--quiet"
            >
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
          From public profile to weekly delivery, RepSync keeps the coaching
          relationship in one operating layer.
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

      <section
        className="rs-section rs-band-secondary"
        aria-labelledby="problem-title"
      >
        <SectionIntro
          eyebrow="The problem"
          title="The coaching business usually lives in five places."
          body="RepSync brings public presence, applications, delivery, check-ins, and client context back into one system."
        />
        <div className="rs-feature-grid rs-feature-grid--four rs-feature-grid--editorial">
          {lifecycleItems.map((item, index) => (
            <article key={item.title}>
              <span aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="rs-section rs-product-section rs-band-white"
        id="product"
        aria-labelledby="product-title"
      >
        <SectionIntro
          eyebrow="Product journey"
          title="Acquire, coach, and retain from the same operating layer."
          body="Public demand, coach workflow, and client delivery stay connected."
        />

        <ProductEvidenceGrid />
      </section>

      <DifferentiationSection />
      <ClientAttentionSection />

      <section
        className="rs-section rs-workflow-section rs-band-sage"
        id="workflow"
      >
        <div className="rs-workflow-copy">
          <p className="rs-eyebrow">Client experience</p>
          <h2>Clients should know what to do next.</h2>
          <p>Today, this week, check-in, message, progress, next touchpoint.</p>
        </div>
        <div className="rs-workflow-map" aria-label="RepSync coaching workflow">
          {[
            ["01", "Apply", "A prospect opens a coach profile and applies."],
            ["02", "Start", "The coach reviews and approves the fit."],
            [
              "03",
              "Do the work",
              "The client sees programs, habits, nutrition, and check-ins.",
            ],
            [
              "04",
              "Stay connected",
              "The coach tracks attention and follow-up.",
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
        <p className="rs-eyebrow">Demo</p>
        <h2 id="demo-title">Build the coaching business clients expect.</h2>
        <p>
          Book a demo and see how RepSync can present your brand, organize your
          clients, and bring the week into focus.
        </p>
      </div>
      <div className="rs-cta-actions">
        <MarketingCta intent="primary">Book a demo</MarketingCta>
        <MarketingCta intent="switch" className="rs-button rs-button--quiet">
          Plan your switch
        </MarketingCta>
      </div>
    </section>
  );
}

export function MarketingHomePage() {
  return (
    <MarketingLayout seo={getMarketingSeo("/")}>
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
  useEffect(() => {
    trackMarketingEvent("product_page_viewed", { page: "/product" });
  }, []);

  return (
    <MarketingLayout seo={getMarketingSeo("/product")}>
      <StructuredData
        id="product-breadcrumbs"
        data={buildBreadcrumbData([
          { name: "RepSync", path: "/" },
          { name: "Product", path: "/product" },
        ])}
      />
      <StructuredData id="product-faq" data={buildFaqData(productFaqItems)} />
      <section className="rs-page-hero">
        <p className="rs-eyebrow">THE REPSYNC PRODUCT</p>
        <h1>One system for the whole coaching relationship.</h1>
        <p className="rs-hero__lede">
          Capture interest, onboard clients, deliver coaching, run check-ins,
          communicate, and see who needs attention without separating the
          business from the coaching.
        </p>
        <div className="rs-hero__actions">
          <AudienceCta to="/book-demo" label="Book a demo" audience="product" />
          <AudienceCta
            to="/switch"
            label="Plan your switch"
            audience="product"
            className="rs-button rs-button--quiet"
          />
        </div>
      </section>

      <ProductOperatingModel />

      {productCategoryOrder.map((category) => (
        <ProductCategorySection
          category={category}
          key={category}
          previewId={
            category === "acquire"
              ? "lead_pipeline"
              : category === "onboard"
                ? "client_detail"
                : category === "deliver"
                  ? "program_assignment"
                  : category === "retain"
                    ? "client_attention"
                    : category === "operate"
                      ? "pt_hub"
                      : category === "client_experience"
                        ? "client_home"
                        : undefined
          }
        />
      ))}

      <section
        className="rs-section rs-workspace-section"
        aria-labelledby="product-team-title"
      >
        <div>
          <p className="rs-eyebrow">Small-team workspaces</p>
          <h2 id="product-team-title">
            Structured for one coach. Ready for a small team.
          </h2>
          <p>
            RepSync describes owner, assistant coach, viewer, assigned-client
            access, shared client communication, and workspace-scoped delivery
            without implying enterprise-scale permission builders.
          </p>
        </div>
        <ProductPreviewById previewId="team_permissions" featured />
      </section>

      <VerifiedAvailabilitySection />
      <ProductFaqSection />
      <FinalCta />
    </MarketingLayout>
  );
}

export function ForCoachesPage() {
  useEffect(() => {
    trackMarketingEvent("for_coaches_page_viewed", { page: "/for-coaches" });
  }, []);

  const coachFeatures = getMarketingFeaturesByAudience("coach").filter(
    (feature) => feature.id !== "whoop_context",
  );

  return (
    <MarketingLayout seo={getMarketingSeo("/for-coaches")}>
      <StructuredData
        id="for-coaches-breadcrumbs"
        data={buildBreadcrumbData([
          { name: "RepSync", path: "/" },
          { name: "For Coaches", path: "/for-coaches" },
        ])}
      />
      <StructuredData id="coach-faq" data={buildFaqData(coachFaqItems)} />
      <section className="rs-page-hero">
        <p className="rs-eyebrow">FOR COACHES</p>
        <h1>
          Run a more organized coaching business without making coaching feel
          corporate.
        </h1>
        <p className="rs-hero__lede">
          RepSync connects the work before a client joins, the weekly coaching
          relationship, and the decisions that keep clients moving.
        </p>
        <div className="rs-hero__actions">
          <AudienceCta to="/book-demo" label="Book a demo" audience="coach" />
          <AudienceCta
            to="/switch"
            label="Plan your switch"
            audience="coach"
            className="rs-button rs-button--quiet"
          />
        </div>
      </section>

      <section className="rs-section">
        <SectionIntro
          eyebrow="Who RepSync is for"
          title="Built for independent coaches, hybrid coaches, in-person follow-up, and small teams."
        />
        <div className="rs-feature-grid rs-feature-grid--four">
          {coachSegments.map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-section">
        <SectionIntro
          eyebrow="Common operating problems"
          title="The work breaks down when acquisition, delivery, and attention live apart."
        />
        <div className="rs-feature-grid rs-feature-grid--four">
          {coachProblems.map((problem) => (
            <article key={problem}>
              <h3>{problem}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-section rs-product-category">
        <SectionIntro
          eyebrow="Lead-to-client workflow"
          title="From public profile to approved coaching relationship."
          body="RepSync connects profile, application, lead record, conversation, approval, and workspace assignment without claiming it generates leads for you."
        />
        <div className="rs-product-category__grid">
          <ProductPreviewById previewId="public_profile" />
          <ProductPreviewById previewId="lead_pipeline" featured />
        </div>
      </section>

      <section className="rs-section rs-product-category">
        <SectionIntro
          eyebrow="Weekly coaching workflow"
          title="Programs, nutrition, habits, check-ins, and messages in one rhythm."
          body="The weekly workflow is described from verified product areas, with client-facing work and coach context kept together."
        />
        <div className="rs-feature-grid">
          {coachFeatures
            .filter((feature) =>
              [
                "program_delivery",
                "nutrition_habits_checkins",
                "messaging",
              ].includes(feature.id),
            )
            .map((feature) => (
              <FeatureCard feature={feature} key={feature.id} />
            ))}
        </div>
      </section>

      <ClientAttentionSection />

      <section className="rs-section rs-product-category">
        <SectionIntro
          eyebrow="Professional client experience"
          title="Clients get a calmer way to follow the plan."
          body="The client experience is positioned around today's work, nutrition guidance, habits, check-ins, messages, and progress rather than coach operations."
        />
        <ProductPreviewById previewId="client_home" featured />
      </section>

      <WorkspaceSection />

      <section className="rs-section">
        <SectionIntro
          eyebrow="Business visibility"
          title="See the lead pipeline and the coaching workload together."
          body="PT Hub marketing stays neutral: lead flow, active clients, overdue check-ins, attention signals, lifecycle visibility, and workspace performance without invented results."
        />
        <ProductPreviewById previewId="pt_hub" featured />
      </section>

      <section className="rs-section rs-fit-section">
        <div>
          <SectionIntro
            eyebrow="Fit checklist"
            title="RepSync is a good fit when..."
          />
          <ul>
            {coachFitItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <SectionIntro
            eyebrow="Current limitations"
            title="RepSync may not be the right fit yet when..."
          />
          <ul>
            {coachNotYetFitItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rs-demo-section">
        <div>
          <p className="rs-eyebrow">Switching</p>
          <h2>Bring the operating model with you.</h2>
          <p>
            Use the switch form when your current tools split lead intake,
            client delivery, check-ins, and team coordination.
          </p>
        </div>
        <AudienceCta to="/switch" label="Plan your switch" audience="coach" />
      </section>

      <CoachFaqSection />
      <FinalCta />
    </MarketingLayout>
  );
}

export function ForClientsPage() {
  useEffect(() => {
    trackMarketingEvent("for_clients_page_viewed", { page: "/for-clients" });
  }, []);

  return (
    <MarketingLayout seo={getMarketingSeo("/for-clients")}>
      <StructuredData
        id="for-clients-breadcrumbs"
        data={buildBreadcrumbData([
          { name: "RepSync", path: "/" },
          { name: "For Clients", path: "/for-clients" },
        ])}
      />
      <StructuredData id="client-faq" data={buildFaqData(clientFaqItems)} />
      <section className="rs-page-hero">
        <p className="rs-eyebrow">FOR CLIENTS</p>
        <h1>Everything your coach needs you to see, in one clear place.</h1>
        <p className="rs-hero__lede">
          View your coaching plan, check-ins, habits, nutrition guidance, and
          messages without searching through several different apps.
        </p>
        <div className="rs-hero__actions">
          <AudienceCta
            to="/login"
            label="I have an invitation"
            audience="client"
          />
          <AudienceCta
            to="/login"
            label="Log in"
            audience="client"
            className="rs-button rs-button--quiet"
          />
          <AudienceCta
            to="/coaches"
            label="I am looking for a coach"
            audience="client"
            className="rs-link-cta"
          />
        </div>
      </section>

      <section className="rs-section">
        <SectionIntro
          eyebrow="What the client sees"
          title="A private coaching home, not the coach's business dashboard."
          body="Clients see their own coaching information: workouts, nutrition guidance, habits, check-ins, messages, progress, and supported wearable context."
        />
        <div className="rs-feature-grid">
          {getMarketingFeaturesByAudience("client").map((feature) => (
            <FeatureCard feature={feature} compact key={feature.id} />
          ))}
        </div>
      </section>

      <section className="rs-section rs-product-category">
        <SectionIntro
          eyebrow="Today's coaching view"
          title="The next action is easier to find."
          body="The client home preview uses deterministic demonstration data and does not connect to live private client records."
        />
        <ProductPreviewById previewId="client_home" featured />
      </section>

      <section className="rs-section">
        <SectionIntro
          eyebrow="Workouts"
          title="Training work stays attached to the coaching relationship."
          body="Clients can follow assigned workout work while coaches keep program context in the workspace."
        />
        <ProductPreviewById previewId="program_assignment" />
      </section>

      <section className="rs-section rs-product-category">
        <SectionIntro
          eyebrow="Nutrition and habits"
          title="Guidance and routines sit beside the plan."
          body="Nutrition guidance and habit setup are explained as coaching context, without turning the client page into a technical product spec."
        />
        <div className="rs-product-category__grid">
          <ProductPreviewById previewId="nutrition_assignment" />
          <ProductPreviewById previewId="checkin" />
        </div>
      </section>

      <section className="rs-section">
        <SectionIntro
          eyebrow="Check-ins and messaging"
          title="Clients know where to answer and where to look for replies."
          body="RepSync describes in-app messages and recurring check-ins only; it does not claim attachments, video calls, WhatsApp sync, or automatic email sequences."
        />
        <div className="rs-feature-grid">
          {[
            "Upcoming or available check-ins",
            "Coach messages",
            "Progress and wearable context",
          ].map((title) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>
                {title === "Progress and wearable context"
                  ? "Supported wearable context is presented carefully, with broad wearable support and Garmin excluded from current claims."
                  : "The client sees only their own coaching relationship and the next relevant action."}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-section rs-client-privacy">
        <SectionIntro
          eyebrow="Privacy and coach access"
          title="Your coaching information stays in your coaching relationship."
          body="Clients do not see other clients, unpublished coach information, PT Hub analytics, lead pipelines, internal permissions, or workspace administration."
        />
        <div className="rs-feature-grid">
          {[
            "Clients see their own coaching information.",
            "Coaches access clients through their coaching workspace.",
            "Workspace access is controlled by role and assignment.",
            "Account authentication protects private coaching areas.",
          ].map((item) => (
            <article key={item}>
              <h3>{item}</h3>
            </article>
          ))}
        </div>
        <div className="rs-section-actions">
          <Link className="rs-link-cta" to="/security">
            Read security notes
          </Link>
          <Link className="rs-link-cta" to="/privacy">
            Read privacy notice
          </Link>
        </div>
      </section>

      <section className="rs-section rs-join-paths">
        <SectionIntro
          eyebrow="How to join"
          title="Use the path that matches where you are."
          body="RepSync uses the existing invitation and login flows. It does not create a separate invitation system from the marketing page."
        />
        <div className="rs-feature-grid">
          {clientJoinPaths.map(([label, to, body]) => (
            <article key={label}>
              <h3>{label}</h3>
              <p>{body}</p>
              <Link
                className="rs-link-cta"
                to={to}
                onClick={() =>
                  trackMarketingEvent("client_join_path_clicked", {
                    page: "/for-clients",
                    cta_label: label,
                    cta_destination: to,
                  })
                }
              >
                {label}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <ClientFaqSection />
      <FinalCta />
    </MarketingLayout>
  );
}

function availabilityText(status: MarketingFeature["availability"]) {
  if (status === "available") return "Available";
  if (status === "beta") return "Beta";
  if (status === "coming_soon") return "Coming soon";
  return "Not currently available";
}

function AvailabilityPill({
  status,
}: {
  status: MarketingFeature["availability"];
}) {
  return (
    <span className="rs-product-availability" data-status={status}>
      {availabilityText(status)}
    </span>
  );
}

function ProductPreviewById({
  previewId,
  featured,
}: {
  previewId: MarketingPreviewId;
  featured?: boolean;
}) {
  const group = getPreviewGroup(previewId);
  return <ProductPreviewFrame group={group} featured={featured} />;
}

function FeatureCard({
  feature,
  compact = false,
}: {
  feature: MarketingFeature;
  compact?: boolean;
}) {
  return (
    <article className={compact ? "rs-feature-card--compact" : undefined}>
      <div className="rs-card-kicker">
        <span>{feature.category.replace("_", " ")}</span>
        <AvailabilityPill status={feature.availability} />
      </div>
      <h3>{feature.title}</h3>
      <p>{feature.longDescription ?? feature.shortDescription}</p>
      {feature.note ? <p className="rs-card-note">{feature.note}</p> : null}
    </article>
  );
}

function ProductCategorySection({
  category,
  previewId,
}: {
  category: MarketingFeatureCategory;
  previewId?: MarketingPreviewId;
}) {
  const copy = productCategoryCopy[category];
  const features = getMarketingFeaturesByCategory(category);

  useEffect(() => {
    trackMarketingEvent("product_category_viewed", {
      page: "/product",
      category,
    });
  }, [category]);

  return (
    <section
      className="rs-section rs-product-category"
      aria-labelledby={`${category}-title`}
    >
      <SectionIntro
        eyebrow={copy.eyebrow}
        title={copy.title}
        body={copy.body}
      />
      <div className="rs-product-category__grid">
        <div className="rs-feature-grid">
          {features.map((feature) => (
            <FeatureCard feature={feature} key={feature.id} />
          ))}
        </div>
        {previewId ? (
          <ProductPreviewById previewId={previewId} featured />
        ) : null}
      </div>
    </section>
  );
}

function ProductOperatingModel() {
  const steps = [
    ["Acquire", "Public profile", "Application and lead context"],
    ["Onboard", "Workspace", "Client setup and first assignments"],
    ["Deliver", "Program", "Nutrition, habits, and coaching work"],
    ["Check in", "Check-in", "Recurring review cadence"],
    ["Identify attention", "Attention signal", "Reason for coach review"],
    ["Retain", "Lifecycle", "Relationship state and next action"],
    [
      "Review performance",
      "PT Hub",
      "Leads, clients, and workspace visibility",
    ],
  ];

  return (
    <section
      className="rs-section rs-operating-model"
      aria-labelledby="product-operating-model-title"
    >
      <SectionIntro
        eyebrow="Product operating model"
        title="One relationship, seven connected moments."
        body="The product language uses RepSync entities while keeping database implementation details out of the public site."
      />
      <div className="rs-operating-flow" aria-label="RepSync operating flow">
        {steps.map(([label, entity, detail], index) => (
          <article key={label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{label}</h3>
            <strong>{entity}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function VerifiedAvailabilitySection() {
  useEffect(() => {
    trackMarketingEvent("product_availability_viewed", {
      page: "/product",
      available_count: marketingProductFeatures.filter(
        (feature) => feature.availability !== "not_available",
      ).length,
    });
  }, []);

  return (
    <section
      className="rs-section rs-verified-availability"
      aria-labelledby="verified-availability-title"
    >
      <SectionIntro
        eyebrow="Verified availability"
        title="Marketed capabilities come from one central configuration."
        body="Unavailable items are shown as limitations where trust matters, not as active product capabilities."
      />
      <div className="rs-availability-matrix">
        {marketingProductFeatures.map((feature) => (
          <article key={feature.id}>
            <AvailabilityPill status={feature.availability} />
            <h3>{feature.title}</h3>
            <p>{feature.shortDescription}</p>
          </article>
        ))}
        {unavailableMarketingCapabilities.map((feature) => (
          <article key={feature.key}>
            <AvailabilityPill status={feature.status} />
            <h3>{feature.label}</h3>
            <p>
              This capability is intentionally excluded from active marketing
              claims until it is production-ready.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductFaqSection() {
  return (
    <section className="rs-section">
      <SectionIntro
        eyebrow="FAQ"
        title="Product questions, answered plainly."
      />
      <div className="rs-faq-list">
        {productFaqItems.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CoachFaqSection() {
  return (
    <section className="rs-section">
      <SectionIntro
        eyebrow="FAQ"
        title="Questions coaches ask before switching."
      />
      <div className="rs-faq-list">
        {coachFaqItems.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function ClientFaqSection() {
  return (
    <section className="rs-section">
      <SectionIntro eyebrow="FAQ" title="Client questions, answered clearly." />
      <div className="rs-faq-list">
        {clientFaqItems.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function AudienceCta({
  to,
  label,
  audience,
  className = "rs-button",
}: {
  to: string;
  label: string;
  audience: "coach" | "client" | "product";
  className?: string;
}) {
  return (
    <Link
      className={className}
      to={to}
      onClick={() =>
        trackMarketingEvent("audience_cta_clicked", {
          page: window.location.pathname,
          audience,
          cta_label: label,
          cta_destination: to,
        })
      }
    >
      {label}
    </Link>
  );
}

const productCategoryCopy: Record<
  MarketingFeatureCategory,
  { eyebrow: string; title: string; body: string }
> = {
  acquire: {
    eyebrow: "Acquire",
    title: "Turn interest into a structured coaching relationship.",
    body: "Publish a coach profile, collect applications, review leads, message prospects, and approve or decline before assigning the relationship to a workspace.",
  },
  onboard: {
    eyebrow: "Onboard",
    title: "Move accepted clients into a clear starting process.",
    body: "Configure the client's starting setup from one connected workspace without implying every onboarding action is automated.",
  },
  deliver: {
    eyebrow: "Deliver",
    title: "Deliver the work without losing the context around it.",
    body: "Programs, nutrition, habits, and check-ins sit beside the client relationship so reusable templates and assigned work stay understandable.",
  },
  communicate: {
    eyebrow: "Communicate",
    title: "Keep conversations connected to the right coaching relationship.",
    body: "RepSync markets lead and client messaging in context, without advertising unsupported attachments, voice notes, video calling, WhatsApp sync, or push notification claims.",
  },
  retain: {
    eyebrow: "Retain",
    title: "See who needs attention and why.",
    body: "Lifecycle describes the client journey. Attention explains whether a coach needs to act and the reason for that action.",
  },
  operate: {
    eyebrow: "Operate",
    title: "See the coaching work and the business around it.",
    body: "PT Hub brings lead pipeline, active clients, overdue check-ins, at-risk clients, lifecycle visibility, and workspace performance into the coach's operating view.",
  },
  client_experience: {
    eyebrow: "Client experience",
    title: "Clear for the coach. Calm for the client.",
    body: "Clients see their own plan, check-ins, habits, nutrition guidance, messages, progress, and supported wearable context without seeing coach operations.",
  },
};

const productCategoryOrder: MarketingFeatureCategory[] = [
  "acquire",
  "onboard",
  "deliver",
  "communicate",
  "retain",
  "operate",
  "client_experience",
];

const coachSegments = [
  [
    "Independent online coach",
    "Manages leads, delivers remote coaching, runs recurring check-ins, and needs visibility across active clients.",
  ],
  [
    "Hybrid coach",
    "Combines in-person and online delivery and needs one place for work that happens outside sessions.",
  ],
  [
    "In-person coach",
    "Uses RepSync for structured follow-up, accountability, check-ins, and client context between appointments.",
  ],
  [
    "Small coaching team",
    "Shares delivery across a workspace while keeping role and assigned-client access controlled.",
  ],
];

const coachProblems = [
  "Leads disappear inside DMs.",
  "Public profiles are disconnected from onboarding.",
  "Client context is spread across several tools.",
  "Check-ins require manual follow-up.",
  "Client attention is detected too late.",
  "Assistants need access without owner permissions.",
  "Clients experience inconsistent communication and delivery.",
  "Business visibility is separated from coaching delivery.",
];

const coachFitItems = [
  "You manage leads outside your coaching platform.",
  "Coaching delivery and business operations are separated.",
  "You run recurring client check-ins.",
  "You want specific attention reasons rather than vague risk labels.",
  "You need a professional public profile and application flow.",
  "You collaborate with an assistant or small team.",
  "Your clients use several disconnected channels.",
  "You want one structured place for the coaching relationship.",
];

const coachNotYetFitItems = [
  "You need automated billing immediately.",
  "You require a native mobile application.",
  "You require fully automated competitor migration.",
  "You need a large public marketplace as the primary growth channel.",
  "You require enterprise-scale staffing or custom permission builders.",
];

const productFaqItems = [
  {
    q: "Is RepSync a workout builder or a full coaching system?",
    a: "RepSync includes coaching delivery surfaces, but the product is explained as the operating layer around the full relationship: acquisition, onboarding, delivery, communication, attention, and workspace oversight.",
  },
  {
    q: "Does RepSync automate every onboarding step?",
    a: "No. RepSync helps configure the client's starting setup from one connected workspace, but this page does not claim a fully automated onboarding sequence.",
  },
  {
    q: "Does RepSync include billing or program commerce?",
    a: "No. Automated billing and program commerce are not marketed as currently available capabilities.",
  },
];

const coachFaqItems = [
  {
    q: "Is RepSync only for online coaches?",
    a: "No. It can fit online, hybrid, in-person, and small-team workflows when the coach needs structured follow-up, check-ins, messaging, and client attention visibility.",
  },
  {
    q: "Can assistants access every client?",
    a: "RepSync supports controlled workspace roles and assigned-client access patterns. Marketing should not imply every teammate can access every client.",
  },
  {
    q: "Can RepSync replace my billing system today?",
    a: "No. Automated billing is a verified current limitation in the marketing availability configuration.",
  },
];

const clientFaqItems = [
  {
    q: "Do I need an invitation from my coach?",
    a: "Most clients should use the invitation link their coach sends. The invitation flow is the existing secure join path.",
  },
  {
    q: "Can I see other clients or coach business data?",
    a: "No. The client experience is positioned around your own coaching information, not other clients, lead pipelines, PT Hub analytics, or workspace administration.",
  },
  {
    q: "Can I find a coach in RepSync?",
    a: "Published coach profiles can appear in the public coach directory while marketplace availability remains beta-positioned.",
  },
];

const clientJoinPaths = [
  [
    "I have an invitation",
    "/login",
    "Open the invite link from your coach, or log in with the invited email if you already started.",
  ],
  [
    "I already have an account",
    "/login",
    "Log in to continue to your private client workspace.",
  ],
  [
    "I am looking for a coach",
    "/coaches",
    "Browse published coach profiles while marketplace availability remains beta-positioned.",
  ],
  [
    "Independent client signup",
    "/signup/client",
    "Use the existing client signup route only when you have a valid reason to create a client account.",
  ],
] as const;

const migrationSupportLabels: Record<MigrationCategory["support"], string> = {
  supported: "Supported",
  assisted: "Assisted",
  evaluate: "Evaluate case by case",
  not_supported: "Not currently supported",
};

const availabilityLabels: Record<
  ComparisonFeature["repSync"]["availability"],
  string
> = {
  included: "Included",
  beta: "Beta",
  planned: "Planned",
  not_available: "Not currently available",
};

const competitorAvailabilityLabels: Record<
  ComparisonFeature["competitor"]["availability"],
  string
> = {
  included: "Included",
  partial: "Partial",
  not_available: "Not currently available",
  unknown: "Unknown",
};

function MigrationMatrixSection() {
  return (
    <section className="rs-section" aria-labelledby="migration-matrix-title">
      <SectionIntro
        eyebrow="Migration capability"
        title="What may need to move."
        body="This matrix is intentionally conservative. If support cannot be verified from the repository, the item is marked for evaluation instead of presented as automatically supported."
      />
      <div className="rs-migration-matrix">
        {migrationMatrix.map((item) => (
          <article data-support={item.support} key={item.id}>
            <div>
              <span>{migrationSupportLabels[item.support]}</span>
              <h3>{item.label}</h3>
            </div>
            <p>{item.description}</p>
            {item.note ? <p className="rs-card-note">{item.note}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function SwitchFaqSection() {
  return (
    <section className="rs-section">
      <SectionIntro
        eyebrow="Switching FAQ"
        title="Honest answers before the move."
      />
      <div className="rs-faq-list">
        {switchFaqItems.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function AvailabilityBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className="rs-availability-badge" data-tone={tone}>
      {label}
    </span>
  );
}

function ComparisonCategorySection({
  category,
  competitorName,
  features,
}: {
  category: string;
  competitorName: string;
  features: ComparisonFeature[];
}) {
  useEffect(() => {
    trackMarketingEvent("comparison_category_viewed", {
      section: category,
      page: window.location.pathname,
    });
  }, [category]);

  return (
    <section className="rs-comparison-category" aria-label={category}>
      <h3>{category}</h3>
      <div className="rs-comparison-table" role="table">
        <div className="rs-comparison-table__head" role="row">
          <span role="columnheader">Feature</span>
          <span role="columnheader">RepSync</span>
          <span role="columnheader">{competitorName}</span>
        </div>
        {features.map((feature) => (
          <div className="rs-comparison-table__row" role="row" key={feature.id}>
            <span role="cell">
              <strong>{feature.label}</strong>
              {feature.description ? (
                <small>{feature.description}</small>
              ) : null}
            </span>
            <span role="cell">
              <AvailabilityBadge
                label={availabilityLabels[feature.repSync.availability]}
                tone={feature.repSync.availability}
              />
              {feature.repSync.note ? (
                <small>{feature.repSync.note}</small>
              ) : null}
            </span>
            <span role="cell">
              <AvailabilityBadge
                label={
                  competitorAvailabilityLabels[feature.competitor.availability]
                }
                tone={feature.competitor.availability}
              />
              {feature.competitor.note ? (
                <small>{feature.competitor.note}</small>
              ) : null}
              {feature.competitor.evidence ? (
                <a
                  href={feature.competitor.evidence.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    trackMarketingEvent("comparison_source_opened", {
                      page: window.location.pathname,
                      section: category,
                      platform: competitorName.toLowerCase(),
                    })
                  }
                >
                  Source: {feature.competitor.evidence.sourceLabel}
                </a>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SwitchPage() {
  useEffect(() => {
    trackMarketingEvent("switch_page_viewed", { page: "/switch" });
  }, []);

  return (
    <MarketingLayout seo={getMarketingSeo("/switch")}>
      <StructuredData
        id="switch-breadcrumbs"
        data={buildBreadcrumbData([
          { name: "RepSync", path: "/" },
          { name: "Switch Coaching Platforms", path: "/switch" },
        ])}
      />
      <StructuredData id="switch-faq" data={buildFaqData(switchFaqItems)} />
      <section className="rs-page-hero rs-switch-hero">
        <p className="rs-eyebrow">SWITCHING TO REPSYNC</p>
        <h1>Move the coaching business, not just the workout library.</h1>
        <p className="rs-hero__lede">
          RepSync connects lead management, onboarding, coaching delivery,
          check-ins, communication, client attention, and workspace control.
          Tell us what you use today and we will help you assess the safest
          transition.
        </p>
        <div className="rs-hero__actions">
          <a className="rs-button" href="#switch-request-form">
            Plan your switch
          </a>
          <Link className="rs-link-cta" to="/compare/truecoach">
            Moving from TrueCoach
          </Link>
          <Link className="rs-link-cta" to="/compare/fitr">
            Moving from FITR
          </Link>
        </div>
      </section>

      <section className="rs-section" aria-labelledby="switch-why-title">
        <SectionIntro
          eyebrow="Why coaches consider switching"
          title="The platform problem is usually a workflow problem."
          body="The goal is not to attack other tools. The goal is to see which parts of the coaching business are fragmented and what should be connected before a move."
        />
        <div className="rs-feature-grid rs-feature-grid--three">
          {switchingProblems.map((problem) => (
            <article key={problem}>
              <h3>{problem}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-section" aria-labelledby="switch-connects-title">
        <SectionIntro
          eyebrow="What RepSync connects"
          title="A single operating flow from public interest to client attention."
        />
        <div className="rs-flow-grid">
          {repSyncOperatingFlow.map((group) => (
            <article key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section
        className="rs-section rs-workflow-section"
        aria-labelledby="switch-process-title"
      >
        <div className="rs-workflow-copy">
          <p className="rs-eyebrow">Switching process</p>
          <h2 id="switch-process-title">Move deliberately.</h2>
          <p>
            RepSync does not promise one-click migration, complete historical
            import, zero downtime, or no client action. The process starts with
            what is live and what needs to stay available.
          </p>
        </div>
        <div className="rs-workflow-map">
          {switchingSteps.map((step, index) => (
            <div className="rs-workflow-step" key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <MigrationMatrixSection />

      <section className="rs-form-page" id="switch-request-form">
        <div>
          <p className="rs-eyebrow">Switch request</p>
          <h2>Tell us what needs to move.</h2>
          <p className="rs-hero__lede">
            Share only business workflow context. Do not include client health,
            medical, or sensitive client details in this form.
          </p>
        </div>
        <LeadForm mode="switch" />
      </section>

      <SwitchFaqSection />
      <FinalCta />
    </MarketingLayout>
  );
}

export function CompareTrueCoachPage() {
  return <ComparePage competitor="truecoach" />;
}

export function CompareFitrPage() {
  return <ComparePage competitor="fitr" />;
}

function ComparePage({ competitor }: { competitor: ComparisonCompetitor }) {
  const comparison = getComparisonPageData(competitor);
  const categories = getComparisonCategories(comparison.features);

  useEffect(() => {
    trackMarketingEvent("comparison_page_viewed", {
      page: comparison.canonicalPath,
      platform: comparison.competitor,
    });
  }, [comparison.canonicalPath, comparison.competitor]);

  return (
    <MarketingLayout seo={getMarketingSeo(comparison.canonicalPath)}>
      <StructuredData
        id={`${comparison.competitor}-breadcrumbs`}
        data={buildBreadcrumbData([
          { name: "RepSync", path: "/" },
          { name: "Comparisons", path: comparison.canonicalPath },
          {
            name: `RepSync vs ${comparison.competitorName}`,
            path: comparison.canonicalPath,
          },
        ])}
      />
      <StructuredData
        id={`${comparison.competitor}-faq`}
        data={buildFaqData(comparison.faqs)}
      />
      <section className="rs-page-hero">
        <p className="rs-eyebrow">{comparison.heroEyebrow}</p>
        <h1>{comparison.heroTitle}</h1>
        <p className="rs-hero__lede">{comparison.heroBody}</p>
        <p className="rs-last-reviewed">
          Last reviewed: {comparison.lastReviewed}
        </p>
        <div className="rs-hero__actions">
          <Link
            className="rs-button"
            to="/switch"
            onClick={() =>
              trackMarketingEvent("comparison_cta_clicked", {
                page: comparison.canonicalPath,
                platform: comparison.competitor,
                cta_label: comparison.primaryCta,
                cta_destination: "/switch",
              })
            }
          >
            {comparison.primaryCta}
          </Link>
          <Link
            className="rs-button rs-button--quiet"
            to="/product"
            onClick={() =>
              trackMarketingEvent("comparison_cta_clicked", {
                page: comparison.canonicalPath,
                platform: comparison.competitor,
                cta_label: comparison.secondaryCta,
                cta_destination: "/product",
              })
            }
          >
            {comparison.secondaryCta}
          </Link>
        </div>
      </section>

      <section
        className="rs-section"
        aria-labelledby="comparison-summary-title"
      >
        <SectionIntro
          eyebrow="Short comparison summary"
          title={`How to read this ${comparison.competitorName} comparison.`}
        />
        <div className="rs-feature-grid">
          {comparison.summary.map((item) => (
            <article key={item}>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-section">
        <SectionIntro
          eyebrow="Operating-model comparison"
          title="Compare verified features and switching fit."
          body="Competitor claims below use official public product sources. Unknown claims are omitted rather than guessed."
        />
        {categories.map((category) => (
          <ComparisonCategorySection
            category={category}
            competitorName={comparison.competitorName}
            features={comparison.features.filter(
              (feature) => feature.category === category,
            )}
            key={category}
          />
        ))}
        <p className="rs-trademark-note">{comparison.trademarkDisclaimer}</p>
      </section>

      <section
        className="rs-section"
        aria-labelledby="comparison-emphasis-title"
      >
        <SectionIntro
          eyebrow="What RepSync emphasizes"
          title="Lead continuity, delivery clarity, and client attention."
          body="RepSync is strongest when the switch is about operating the whole coaching relationship, not simply changing a workout builder."
        />
        <ProductEvidenceGrid />
      </section>

      <section className="rs-section" aria-labelledby="comparison-switch-title">
        <SectionIntro
          eyebrow="Switching considerations"
          title={`Questions to answer before moving from ${comparison.competitorName}.`}
        />
        <div className="rs-feature-grid">
          {comparison.switchingConsiderations.map((item) => (
            <article key={item}>
              <h3>{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="rs-section">
        <SectionIntro
          eyebrow="FAQ"
          title="Platform-specific switching questions."
        />
        <div className="rs-faq-list">
          {comparison.faqs.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rs-demo-section">
        <div>
          <p className="rs-eyebrow">Plan the move</p>
          <h2>Switch only after the workflow is clear.</h2>
          <p>
            Tell RepSync what you use today, what is active, and what needs to
            remain available during the transition.
          </p>
        </div>
        <div className="rs-cta-actions">
          <Link
            className="rs-button"
            to="/switch"
            onClick={() =>
              trackMarketingEvent("comparison_cta_clicked", {
                page: comparison.canonicalPath,
                platform: comparison.competitor,
                cta_label: comparison.primaryCta,
                cta_destination: "/switch",
              })
            }
          >
            {comparison.primaryCta}
          </Link>
          <Link
            className="rs-button rs-button--quiet"
            to="/book-demo"
            onClick={() =>
              trackMarketingEvent("comparison_cta_clicked", {
                page: comparison.canonicalPath,
                platform: comparison.competitor,
                cta_label: "Book a demo",
                cta_destination: "/book-demo",
              })
            }
          >
            Book a demo
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function FaqPage() {
  const visibleFaqItems = getVisibleFaqItems();

  return (
    <MarketingLayout seo={getMarketingSeo("/faq")}>
      <StructuredData
        id="faq-breadcrumbs"
        data={buildBreadcrumbData([
          { name: "RepSync", path: "/" },
          { name: "FAQ", path: "/faq" },
        ])}
      />
      <StructuredData id="public-faq" data={buildFaqData(visibleFaqItems)} />
      <section className="rs-page-hero">
        <p className="rs-eyebrow">FAQ</p>
        <h1>Useful answers. No inflated claims.</h1>
        <p className="rs-hero__lede">
          Product, coach, client, switching, availability, integration,
          security, and privacy answers are kept concise and tied to verified
          product behavior.
        </p>
      </section>
      <section className="rs-section">
        <div className="rs-faq-groups">
          {publicFaqGroups.map((group) => (
            <section
              key={group.category}
              aria-labelledby={`faq-${group.category}`}
            >
              <div className="rs-section__heading">
                <p className="rs-eyebrow">{group.category}</p>
                <h2 id={`faq-${group.category}`}>{group.category}</h2>
              </div>
              <div className="rs-faq-list">
                {group.items.map((item) => (
                  <details
                    id={item.q.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                    key={item.q}
                  >
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                    {item.href ? (
                      <Link className="rs-link-cta" to={item.href}>
                        Learn more
                      </Link>
                    ) : null}
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}

export function SecurityPage() {
  const publicTrustClaims = getPublicTrustClaims();
  const securitySections = [
    [
      "Authentication",
      "Private app areas require authenticated accounts through the configured Supabase client. The browser client rejects service-role keys.",
    ],
    [
      "Workspace and role access",
      "Workspace access follows roles such as owner, admin, coach, assistant coach, and viewer. Public copy does not imply every role can manage every setting.",
    ],
    [
      "Client-data boundaries",
      "Client information is scoped to authenticated coaching relationships, workspace access, and assigned-client visibility patterns.",
    ],
    [
      "Public-profile visibility",
      "Coach profiles are public only when published. Marketplace visibility is separate from publication and should not expose private workspace data.",
    ],
    [
      "Invitations",
      "Team invite flows check invite status, email match, expiration, and acceptance state before access is granted.",
    ],
    [
      "Data requests",
      `Send access, correction, export, or deletion requests to ${legalSiteConfig.privacyEmail}.`,
    ],
    [
      "Responsible disclosure",
      "Report suspected security issues without including client health details, credentials, or private records in the first message.",
    ],
    [
      "Security contact",
      `Security reports can be sent to ${legalSiteConfig.securityEmail}.`,
    ],
  ];

  return (
    <MarketingLayout seo={getMarketingSeo("/security")}>
      <StructuredData
        id="security-breadcrumbs"
        data={buildBreadcrumbData([
          { name: "RepSync", path: "/" },
          { name: "Security", path: "/security" },
        ])}
      />
      <section className="rs-page-hero">
        <p className="rs-eyebrow">SECURITY AT REPSYNC</p>
        <h1>Access should follow the coaching relationship.</h1>
        <p className="rs-hero__lede">
          RepSync separates public profile information from private coaching
          data and controls workspace access through authenticated roles and
          client relationships.
        </p>
      </section>
      <section className="rs-section">
        <SectionIntro
          eyebrow="Verified trust claims"
          title="Security copy is limited to behavior verified in the repository."
          body="Internal evidence references stay in code and launch evidence. Planned or unsupported certification claims are not rendered as current behavior."
        />
        <div className="rs-feature-grid">
          {publicTrustClaims.map((claim) => (
            <article key={claim.id}>
              <h3>{claim.title}</h3>
              <p>{claim.description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="rs-section">
        <SectionIntro
          eyebrow="Plain-language controls"
          title="What RepSync currently says about access."
        />
        <div className="rs-feature-grid">
          {securitySections.map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="rs-section-actions">
          <Link className="rs-link-cta" to="/privacy">
            Read the privacy notice
          </Link>
          <Link className="rs-link-cta" to="/cookies">
            Manage cookie preferences
          </Link>
        </div>
      </section>
      <section className="rs-status-section">
        <div>
          <p className="rs-eyebrow">Claims not made</p>
          <h2>No unsupported compliance language.</h2>
          <p>
            This page does not claim HIPAA compliance, GDPR certification, SOC
            2, ISO 27001, bank-grade security, end-to-end encryption, zero-trust
            certification, penetration-test completion, or uptime guarantees.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function BookDemoPage() {
  return (
    <MarketingLayout seo={getMarketingSeo("/book-demo")}>
      <section className="rs-form-page">
        <div>
          <p className="rs-eyebrow">Book a demo</p>
          <h1>See the coaching journey from inquiry to check-in.</h1>
          <p className="rs-hero__lede">
            Share your coaching context, choose an available placeholder time,
            and RepSync will confirm the calendar invite by email.
          </p>
        </div>
        <BookDemoFlow />
      </section>
    </MarketingLayout>
  );
}

export function RequestAccessPage() {
  return <BookDemoPage />;
}

export function PrivacyPage() {
  const privacySections = [
    [
      "Account information",
      "RepSync may process account identity, email, authentication state, profile details, and settings needed to operate the service.",
    ],
    [
      "Coach profile information",
      "Coach profile details, specialties, public profile copy, images, packages, and publication settings may be used to render coach-controlled public surfaces.",
    ],
    [
      "Client coaching information",
      "Private coaching areas may include workspace relationships, programs, nutrition guidance, habits, check-ins, messages, notes, progress, and wearable context where supported.",
    ],
    [
      "Public profile and application information",
      "Published coach profile information is public. Public applications collect prospect context so a coach can review fit and respond.",
    ],
    [
      "Marketing-form information",
      "Request-access and switch forms collect business workflow context, contact details, current platform, client range, timeline, and consent.",
    ],
    [
      "Device, usage, analytics, cookies, and local storage",
      "Essential storage supports authentication and preferences. Optional public-site analytics is gated by the cookie preference stored in local storage.",
    ],
    [
      "Connected integrations and service providers",
      "RepSync may rely on configured infrastructure, authentication, storage, analytics, notification, email, and integration providers where needed to operate the product.",
    ],
    [
      "Retention and requests",
      "Retention is handled at a high level until legal review sets exact periods. Contact the privacy address for access, correction, export, or deletion requests.",
    ],
  ];

  return (
    <MarketingLayout seo={getMarketingSeo("/privacy")}>
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Privacy</p>
        <h1>Privacy Policy</h1>
        <p className="rs-hero__lede">
          This is a conservative draft privacy notice for RepSync public and app
          surfaces. It needs human legal review before production launch.
        </p>
        <p className="rs-last-reviewed">
          Effective date: {legalSiteConfig.effectiveDate}. Version:{" "}
          {legalSiteConfig.version}. Legal approval:{" "}
          {legalReviewRequired
            ? "Required before production launch"
            : "Approved"}
        </p>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid">
          {privacySections.map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="rs-section-actions">
          <a
            className="rs-link-cta"
            href={`mailto:${legalSiteConfig.privacyEmail}`}
          >
            Contact privacy
          </a>
          <Link className="rs-link-cta" to="/cookies">
            Cookie preferences
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function TermsPage() {
  const termsSections = [
    [
      "Eligibility and accounts",
      "Users are responsible for accurate account information, keeping credentials secure, and using the service only where they are allowed to do so.",
    ],
    [
      "Acceptable use",
      "Do not misuse RepSync, attempt unauthorized access, interfere with service operation, or upload content that violates law or others' rights.",
    ],
    [
      "Coach responsibilities",
      "Coaches are responsible for coaching content, client communication, professional obligations, and reviewing information before relying on it.",
    ],
    [
      "Client responsibilities",
      "Clients are responsible for using their own account, following coach instructions appropriately, and not sharing private workspace access.",
    ],
    [
      "Public profile and coaching content",
      "Coaches control public profile content and should only publish information they have the right to share.",
    ],
    [
      "Intellectual property and third-party services",
      "RepSync and third-party providers retain their respective rights. Third-party services may have separate terms.",
    ],
    [
      "Early access behavior",
      "Features may change, be limited, or be unavailable during early access. RepSync does not promise uninterrupted availability, permanent storage, medical outcomes, revenue outcomes, retention outcomes, or migration completeness.",
    ],
    [
      "Suspension, termination, disclaimers, and limitations",
      "RepSync may restrict access for misuse or risk. These draft terms require legal review before production launch.",
    ],
  ];

  return (
    <MarketingLayout seo={getMarketingSeo("/terms")}>
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Terms</p>
        <h1>Terms of Service</h1>
        <p className="rs-hero__lede">
          These draft terms describe expected use of RepSync public and app
          surfaces. They require human legal review before production launch.
        </p>
        <p className="rs-last-reviewed">
          Effective date: {legalSiteConfig.effectiveDate}. Version:{" "}
          {legalSiteConfig.version}. Legal approval:{" "}
          {legalReviewRequired
            ? "Required before production launch"
            : "Approved"}
        </p>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid">
          {termsSections.map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="rs-section-actions">
          <a
            className="rs-link-cta"
            href={`mailto:${legalSiteConfig.contactEmail}`}
          >
            Contact support
          </a>
          <Link className="rs-link-cta" to="/privacy">
            Privacy notice
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function CookiesPage() {
  const cookieRows = [
    [
      "Essential",
      "Always available",
      "Authentication, route state, security-sensitive app operation, and saved cookie preference.",
    ],
    [
      "Analytics",
      "Optional",
      "Public-site usage events after you accept analytics. Events must not include email, names, free-text form content, client data, health data, or private identifiers.",
    ],
  ];

  return (
    <MarketingLayout seo={getMarketingSeo("/cookies")}>
      <section className="rs-page-hero">
        <p className="rs-eyebrow">Cookies</p>
        <h1>Cookie notice and analytics preferences.</h1>
        <p className="rs-hero__lede">
          RepSync uses essential browser storage for app operation and stores
          your analytics preference locally. Optional analytics is off until you
          accept it.
        </p>
        <div className="rs-hero__actions">
          <button
            className="rs-button"
            type="button"
            onClick={openCookiePreferences}
          >
            Manage preferences
          </button>
        </div>
      </section>
      <section className="rs-section">
        <div className="rs-feature-grid">
          {cookieRows.map(([title, status, body]) => (
            <article key={title}>
              <span>{status}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="rs-section-actions">
          <a
            className="rs-link-cta"
            href={`mailto:${legalSiteConfig.privacyEmail}`}
          >
            Contact privacy
          </a>
          <Link className="rs-link-cta" to="/privacy">
            Privacy notice
          </Link>
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
  return <BookDemoPage />;
}

export function DemoPage() {
  return <BookDemoPage />;
}
