import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  MapPin,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { AppFooter } from "../../components/common/app-footer";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/coachos";
import { useCoachMarketplaceProfiles } from "../../features/pt-hub/lib/pt-hub";
import type {
  PTAvailabilityMode,
  PTCoachingMode,
  PTPublicProfile,
} from "../../features/pt-hub/types";
import { routes } from "../../lib/routes";
import "../../styles/marketing-home.css";

type SeoConfig = {
  title: string;
  description: string;
  robots?: string;
};

const navItems = [
  { label: "Product", to: "/product" },
  { label: "Marketplace", to: "/coaches" },
  { label: "For coaches", to: "/for-coaches" },
  { label: "For clients", to: "/for-clients" },
  { label: "Switch", to: "/switch" },
];

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

function usePublicSeo({
  title,
  description,
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
      <span>R E P S Y N C</span>
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
      {variant === "primary" ? (
        <ArrowRight size={16} aria-hidden="true" />
      ) : null}
    </Link>
  );
}

function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
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
  );
}

function PublicMarketplaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="rs-stitch-site">
      <a className="rs-stitch-skip" href="#main">
        Skip to content
      </a>
      <PublicHeader />
      <main id="main">{children}</main>
      <AppFooter
        className="rs-marketing-app-footer"
        contentClassName="rs-marketing-app-footer__content"
      />
    </div>
  );
}

function getInitials(profile: PTPublicProfile) {
  const source = profile.displayName || profile.fullName || "Coach";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
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

function MarketplaceSkeletonGrid() {
  return (
    <div className="rs-marketplace-grid" aria-label="Loading coaches">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="rs-marketplace-card" key={index}>
          <div className="rs-marketplace-card__top">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function CoachMarketplaceCard({ profile }: { profile: PTPublicProfile }) {
  const profilePath = routes.publicProfile(profile.slug);
  const specialties = profile.specialties.slice(0, 3);
  const coachingModes = profile.coachingModes.slice(0, 2);
  const availabilityModes = profile.availabilityModes.slice(0, 2);

  return (
    <article className="rs-marketplace-card">
      <div className="rs-marketplace-card__media">
        {profile.bannerImageUrl ? (
          <img
            src={profile.bannerImageUrl}
            alt={`${profile.displayName} coaching profile banner`}
          />
        ) : (
          <div className="rs-marketplace-card__blank" aria-hidden="true" />
        )}
      </div>
      <div className="rs-marketplace-card__body">
        <div className="rs-marketplace-card__top">
          <div className="rs-marketplace-card__avatar">
            {profile.profilePhotoUrl ? (
              <img src={profile.profilePhotoUrl} alt={profile.displayName} />
            ) : (
              <span>{getInitials(profile) || "RS"}</span>
            )}
          </div>
          <div className="min-w-0">
            <h2>{profile.displayName}</h2>
            {profile.headline ? <p>{profile.headline}</p> : null}
            {profile.locationLabel ? (
              <span className="rs-marketplace-card__location">
                <MapPin size={14} aria-hidden="true" />
                {profile.locationLabel}
              </span>
            ) : null}
          </div>
        </div>

        <p className="rs-marketplace-card__bio">
          {profile.shortBio ||
            profile.coachingStyle ||
            "This coach has published a RepSync profile and is open to client applications."}
        </p>

        <div className="rs-marketplace-card__tags">
          {specialties.map((specialty) => (
            <Badge key={specialty} variant="secondary">
              {specialty}
            </Badge>
          ))}
          {coachingModes.map((mode) => (
            <Badge key={mode} variant="muted">
              {coachingModeLabels[mode]}
            </Badge>
          ))}
          {availabilityModes.map((mode) => (
            <Badge key={mode} variant="neutral">
              {availabilityModeLabels[mode]}
            </Badge>
          ))}
        </div>

        <div className="rs-marketplace-card__actions">
          <Button asChild>
            <Link to={profilePath}>View profile</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={`${profilePath}#public-pt-apply-form`}>Apply</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function CoachesPage() {
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

  usePublicSeo({
    title: "Coach marketplace | RepSync",
    description:
      "Browse published RepSync coach profiles, compare coaching approaches, and apply to work with the right PT.",
  });

  return (
    <PublicMarketplaceLayout>
      <section className="rs-marketplace-hero">
        <div className="rs-marketplace-hero__copy">
          <p className="rs-stitch-kicker">Coach marketplace</p>
          <h1>Find a coach with a clear public profile.</h1>
          <p>
            Browse published RepSync PT profiles, compare coaching styles,
            review specialties, and apply without starting a subscription.
          </p>
        </div>
        <div className="rs-marketplace-search" role="search">
          <div className="rs-marketplace-search__field">
            <Search size={18} aria-hidden="true" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by name, specialty, location, or coaching style"
              aria-label="Search coaches"
            />
          </div>
          <div className="rs-marketplace-search__meta">
            <span>
              {profilesQuery.isLoading
                ? "Loading coaches"
                : `${filteredProfiles.length} coach${
                    filteredProfiles.length === 1 ? "" : "es"
                  }`}
            </span>
            <span>
              <SlidersHorizontal size={14} aria-hidden="true" />
              Published coach profiles
            </span>
          </div>
        </div>
      </section>

      <section className="rs-marketplace-section" aria-label="Available coaches">
        {profilesQuery.isLoading ? (
          <MarketplaceSkeletonGrid />
        ) : profilesQuery.error ? (
          <MarketplaceEmpty
            title="Unable to load the coach marketplace."
            body="Retry in a moment. Published coach profiles will appear here once marketplace data is available."
          />
        ) : profiles.length === 0 ? (
          <MarketplaceEmpty
            title="No coaches are listed yet."
            body="Published RepSync coach profiles will appear here when coaches make themselves visible in the marketplace."
            icon={<UserRound size={20} aria-hidden="true" />}
          />
        ) : filteredProfiles.length === 0 ? (
          <MarketplaceEmpty
            title="No matching coaches."
            body="Try a different name, specialty, location, coaching mode, or service type."
            icon={<Search size={20} aria-hidden="true" />}
          />
        ) : (
          <div className="rs-marketplace-grid">
            {filteredProfiles.map((profile) => (
              <CoachMarketplaceCard key={profile.userId} profile={profile} />
            ))}
          </div>
        )}
      </section>
    </PublicMarketplaceLayout>
  );
}

function MarketplaceEmpty({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rs-marketplace-empty">
      {icon ? <div className="rs-marketplace-empty__icon">{icon}</div> : null}
      <h2>{title}</h2>
      <p>{body}</p>
      <SiteLink to="/for-coaches" variant="secondary">
        Explore RepSync for coaches
      </SiteLink>
    </div>
  );
}
