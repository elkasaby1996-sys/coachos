import { ReactNode, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { AppFooter } from "../../components/common/app-footer";
import { BloomField } from "./bloom-field";
import "../../styles/marketing-home.css";

const navItems = [
  { label: "Product", to: "/product" },
  { label: "Marketplace", to: "/coaches" },
  { label: "For coaches", to: "/for-coaches" },
  { label: "For clients", to: "/for-clients" },
  { label: "Switch", to: "/switch" },
  { label: "Pricing", to: "/pricing" },
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
    </div>
  );
}
