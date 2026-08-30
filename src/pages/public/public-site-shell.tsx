import { ReactNode, useEffect, useState } from "react";
import { ArrowRight, BarChart3, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { AppFooter } from "../../components/common/app-footer";
import {
  getMarketingAnalyticsConsent,
  setMarketingAnalyticsConsent,
  type MarketingAnalyticsConsent,
} from "../../lib/marketing-analytics";
import { BloomField } from "./bloom-field";
import "../../styles/marketing-home.css";

const navItems = [
  { label: "Product", to: "/product" },
  { label: "Marketplace", to: "/coaches" },
  { label: "For coaches", to: "/for-coaches" },
  { label: "For clients", to: "/for-clients" },
  { label: "Switch", to: "/switch" },
  { label: "Plans", to: "/pricing" },
];

export function PublicSiteLink({
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

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <header className="rs-stitch-header">
      <Link className="rs-stitch-brand" to="/" aria-label="RepSync home">
        <span>R E P S Y N C</span>
      </Link>
      <button
        className="rs-stitch-menu"
        type="button"
        aria-controls="rs-stitch-nav"
        aria-expanded={menuOpen}
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
      </button>
      <nav
        className={`rs-stitch-nav ${menuOpen ? "is-open" : ""}`}
        id="rs-stitch-nav"
        aria-label="Public navigation"
      >
        {navItems.map((item) => (
          <Link
            key={item.to}
            aria-current={location.pathname === item.to ? "page" : undefined}
            className={location.pathname === item.to ? "is-active" : ""}
            to={item.to}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={`rs-stitch-actions ${menuOpen ? "is-open" : ""}`}>
        <PublicSiteLink to="/login" variant="text">
          Log in
        </PublicSiteLink>
        <PublicSiteLink to="/start-trial">Start 7-day trial</PublicSiteLink>
      </div>
    </header>
  );
}

function useMarketingConsent() {
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<MarketingAnalyticsConsent>(null);

  useEffect(() => {
    const syncConsent = () => {
      setConsent(getMarketingAnalyticsConsent());
      setReady(true);
    };
    syncConsent();
    window.addEventListener("repsync:analytics-consent-changed", syncConsent);
    return () =>
      window.removeEventListener(
        "repsync:analytics-consent-changed",
        syncConsent,
      );
  }, []);

  const updateConsent = (value: Exclude<MarketingAnalyticsConsent, null>) => {
    setMarketingAnalyticsConsent(value);
    setConsent(value);
  };

  return { consent, ready, updateConsent };
}

export function MarketingConsentBanner() {
  const location = useLocation();
  const { consent, ready, updateConsent } = useMarketingConsent();
  if (!ready || consent || location.pathname === "/cookies") return null;

  return (
    <aside
      aria-label="Analytics preferences"
      className="rs-consent-banner"
      role="dialog"
    >
      <div className="rs-consent-banner__icon" aria-hidden="true">
        <BarChart3 size={18} />
      </div>
      <div>
        <p>Help improve the public website</p>
        <span>
          Allow anonymous marketing-page usage events. No private coaching or
          health information is included. <Link to="/cookies">Learn more</Link>
        </span>
      </div>
      <div className="rs-consent-banner__actions">
        <button type="button" onClick={() => updateConsent("rejected")}>
          Decline
        </button>
        <button
          className="is-primary"
          type="button"
          onClick={() => updateConsent("accepted")}
        >
          Allow analytics
        </button>
      </div>
    </aside>
  );
}

export function CookiePreferenceControls() {
  const { consent, ready, updateConsent } = useMarketingConsent();
  const status = !ready
    ? "Loading preferences..."
    : consent === "accepted"
      ? "Optional analytics are currently allowed."
      : consent === "rejected"
        ? "Optional analytics are currently declined."
        : "No optional analytics preference has been saved.";

  return (
    <section
      aria-labelledby="cookie-preference-title"
      className="rs-cookie-preferences rs-stitch-reveal"
    >
      <div aria-hidden="true">
        <ShieldCheck size={22} />
      </div>
      <div>
        <p className="rs-stitch-kicker">Your preference</p>
        <h2 id="cookie-preference-title">Control optional analytics.</h2>
        <p aria-live="polite">{status}</p>
      </div>
      <div className="rs-cookie-preferences__actions">
        <button type="button" onClick={() => updateConsent("rejected")}>
          Decline analytics
        </button>
        <button
          className="is-primary"
          type="button"
          onClick={() => updateConsent("accepted")}
        >
          Allow analytics
        </button>
      </div>
    </section>
  );
}

export function PublicMobileTrialBar() {
  return (
    <div className="rs-mobile-trial-bar">
      <span>
        <strong>7-day Growth trial</strong>
        No card required
      </span>
      <PublicSiteLink to="/start-trial">Start trial</PublicSiteLink>
    </div>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

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
      <BloomField className="rs-site-bloom" motionAmount={0.22} speed={0.24} />
      <a className="rs-stitch-skip" href="#main">
        Skip to content
      </a>
      <PublicHeader />
      <main id="main">{children}</main>
      <AppFooter
        className="rs-marketing-app-footer"
        contentClassName="rs-marketing-app-footer__content"
        linkSet="marketing"
      />
      <MarketingConsentBanner />
    </div>
  );
}
