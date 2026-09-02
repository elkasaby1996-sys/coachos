import { ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CircleHelp,
  LockKeyhole,
  MapPin,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/coachos";
import {
  useCoachMarketplacePackageCounts,
  useCoachMarketplaceProfiles,
} from "../../features/pt-hub/lib/pt-hub";
import type {
  PTAvailabilityMode,
  PTCoachingMode,
  PTPublicProfile,
} from "../../features/pt-hub/types";
import { routes } from "../../lib/routes";
import { PublicLayout, PublicSiteLink } from "./public-site-shell";
import { usePublicSeo } from "./public-seo";
import "../../styles/marketing-home.css";

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

const specialtyCorrections: Record<string, string> = {
  strenght: "Strength",
};

function normalizeSpecialty(value: string) {
  const trimmed = value.trim();
  return specialtyCorrections[trimmed.toLowerCase()] ?? trimmed;
}

function formatPublicLocation(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

const marketplaceSteps = [
  {
    number: "01",
    title: "Explore",
    body: "Review the coach's approach, specialties, coaching format, and public services.",
  },
  {
    number: "02",
    title: "Apply",
    body: "Share your goals, training experience, and the coaching option that interests you.",
  },
  {
    number: "03",
    title: "Talk",
    body: "Continue the conversation with the coach before either side commits.",
  },
  {
    number: "04",
    title: "Start after approval",
    body: "After approval, create or sign in to your RepSync account and join the coach's workspace.",
  },
];

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
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="rs-marketplace-card" key={index}>
          <Skeleton className="rs-marketplace-card__skeleton-media w-full rounded-none" />
          <div className="rs-marketplace-card__body space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-5 h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CoachMarketplaceCard({
  profile,
  coachingOptionCount,
  imageUrl,
  imageIsPortrait,
}: {
  profile: PTPublicProfile;
  coachingOptionCount: number | undefined;
  imageUrl: string | null;
  imageIsPortrait: boolean;
}) {
  const profilePath = routes.publicProfile(profile.slug);
  const genericSpecialties = new Set([
    "1:1 coaching",
    "one-to-one coaching",
    "programming",
    "online",
    "in person",
  ]);
  const specialties = profile.specialties
    .map(normalizeSpecialty)
    .filter(
      (specialty) => !genericSpecialties.has(specialty.trim().toLowerCase()),
    )
    .slice(0, 3);
  const coachingModes = profile.coachingModes.slice(0, 1);
  const coachingFormat = coachingModes
    .map((mode) => coachingModeLabels[mode])
    .join(" / ");
  const optionsLabel =
    coachingOptionCount && coachingOptionCount > 0
      ? `${coachingOptionCount} coaching option${coachingOptionCount === 1 ? "" : "s"}`
      : null;
  const locationLabel = formatPublicLocation(profile.locationLabel);

  return (
    <article className="rs-marketplace-card">
      <Link
        className="rs-marketplace-card__media"
        to={profilePath}
        aria-label={`View ${profile.displayName}'s coaching profile`}
      >
        {imageUrl ? (
          <img
            className={
              imageIsPortrait
                ? "rs-marketplace-card__image rs-marketplace-card__image--portrait"
                : "rs-marketplace-card__image"
            }
            src={imageUrl}
            alt={`${profile.displayName} coach profile`}
          />
        ) : (
          <div className="rs-marketplace-card__blank" aria-hidden="true" />
        )}
      </Link>
      <div className="rs-marketplace-card__body">
        <h3>
          <Link to={profilePath}>{profile.displayName}</Link>
        </h3>
        {profile.headline ? (
          <p className="rs-marketplace-card__headline">{profile.headline}</p>
        ) : null}

        <p className="rs-marketplace-card__meta">
          <span>{coachingFormat || "Coaching format available"}</span>
          {locationLabel ? (
            <>
              <span aria-hidden="true">&middot;</span>
              <span className="rs-marketplace-card__location">
                <MapPin size={14} aria-hidden="true" />
                <span>{locationLabel}</span>
              </span>
            </>
          ) : null}
        </p>

        <div className="rs-marketplace-card__tags">
          {specialties.map((specialty) => (
            <Badge key={specialty} variant="secondary">
              {specialty}
            </Badge>
          ))}
        </div>

        <div className="rs-marketplace-card__footer">
          {optionsLabel ? <span>{optionsLabel}</span> : null}
          <Link to={profilePath}>
            View profile
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function CoachesPage() {
  const [searchValue, setSearchValue] = useState("");
  const [coachingMode, setCoachingMode] = useState("");
  const [availabilityMode, setAvailabilityMode] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [location, setLocation] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const profilesQuery = useCoachMarketplaceProfiles();
  const profiles = useMemo(
    () => profilesQuery.data ?? [],
    [profilesQuery.data],
  );
  const specialtyOptions = useMemo(
    () =>
      Array.from(
        new Set(
          profiles.flatMap((profile) =>
            profile.specialties.map(normalizeSpecialty),
          ),
        ),
      ).sort(),
    [profiles],
  );
  const locationOptions = useMemo(
    () =>
      Array.from(
        new Set(
          profiles.flatMap((profile) =>
            profile.locationLabel
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ),
      ).sort(),
    [profiles],
  );
  const packageCountsQuery = useCoachMarketplacePackageCounts(
    profiles.map((profile) => profile.userId),
  );
  const filteredProfiles = useMemo(() => {
    const matches = profiles.filter(
      (profile) =>
        profileMatchesSearch(profile, searchValue) &&
        (!coachingMode ||
          profile.coachingModes.includes(coachingMode as PTCoachingMode)) &&
        (!availabilityMode ||
          profile.availabilityModes.includes(
            availabilityMode as PTAvailabilityMode,
          )) &&
        (!specialty ||
          profile.specialties.some(
            (value) => normalizeSpecialty(value) === specialty,
          )) &&
        (!location ||
          profile.locationLabel
            .split(",")
            .map((value) => value.trim())
            .includes(location)),
    );
    return [...matches].sort((left, right) => {
      if (sortBy === "recent") {
        return (
          new Date(right.publishedAt || 0).getTime() -
          new Date(left.publishedAt || 0).getTime()
        );
      }
      if (sortBy === "location") {
        return (left.locationLabel || "").localeCompare(
          right.locationLabel || "",
        );
      }
      return (left.displayName || left.fullName).localeCompare(
        right.displayName || right.fullName,
      );
    });
  }, [
    availabilityMode,
    coachingMode,
    location,
    profiles,
    searchValue,
    sortBy,
    specialty,
  ]);
  const clearFilters = () => {
    setSearchValue("");
    setCoachingMode("");
    setAvailabilityMode("");
    setSpecialty("");
    setLocation("");
  };

  usePublicSeo({
    title: "Coach marketplace | RepSync",
    description:
      "Search published coach profiles by specialty, format, availability, and location, then apply through RepSync.",
    canonicalPath: "/coaches",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "RepSync coach marketplace",
      description: "Published coach profiles available through RepSync.",
      url: `${window.location.origin}/coaches`,
    },
  });

  return (
    <PublicLayout>
      <section className="rs-marketplace-intro">
        <div className="rs-marketplace-intro__copy">
          <p className="rs-stitch-kicker">Coach marketplace</p>
          <h1>Search published coach profiles.</h1>
          <p>
            Compare specialties, coaching formats, locations, availability, and
            services. An application sends your information to the coach and
            carries no subscription charge.
          </p>
        </div>
      </section>

      <section
        className="rs-marketplace-directory"
        aria-label="Coach marketplace directory"
      >
        <div className="rs-marketplace-toolbar" role="search">
          <h2>Search coaches</h2>
          <div className="rs-marketplace-search__field">
            <Search size={18} aria-hidden="true" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by coach, goal, specialty, or location"
              aria-label="Search coaches"
            />
            {searchValue ? (
              <button
                type="button"
                className="rs-marketplace-search__clear"
                onClick={() => setSearchValue("")}
                aria-label="Clear coach search"
              >
                <X size={17} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="rs-marketplace-filters" aria-label="Coach filters">
            <div>
              <Label htmlFor="marketplace-specialty">Goal or specialty</Label>
              <Select
                id="marketplace-specialty"
                value={specialty}
                onChange={(event) => setSpecialty(event.target.value)}
              >
                <option value="">All goals and specialties</option>
                {specialtyOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="marketplace-coaching-mode">Coaching format</Label>
              <Select
                id="marketplace-coaching-mode"
                value={coachingMode}
                onChange={(event) => setCoachingMode(event.target.value)}
              >
                <option value="">All coaching formats</option>
                {Object.entries(coachingModeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="marketplace-location">Location</Label>
              <Select
                id="marketplace-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              >
                <option value="">All locations</option>
                {locationOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="marketplace-availability">Availability</Label>
              <Select
                id="marketplace-availability"
                value={availabilityMode}
                onChange={(event) => setAvailabilityMode(event.target.value)}
              >
                <option value="">Any availability</option>
                {Object.entries(availabilityModeLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </Select>
            </div>
            <div className="rs-marketplace-filter--sort">
              <Label htmlFor="marketplace-sort">Sort by</Label>
              <Select
                id="marketplace-sort"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="recent">Recently added</option>
                <option value="name">Name</option>
                <option value="location">Location</option>
              </Select>
            </div>
          </div>
        </div>

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
            body="Change your search or clear the filters to see every published coach."
            icon={<Search size={20} aria-hidden="true" />}
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear all filters
              </Button>
            }
          />
        ) : (
          <div className="rs-marketplace-grid">
            {filteredProfiles.map((profile, index) => {
              const repeatedProfilePhoto = filteredProfiles
                .slice(0, index)
                .some(
                  (candidate) =>
                    Boolean(profile.profilePhotoUrl) &&
                    candidate.profilePhotoUrl === profile.profilePhotoUrl,
                );
              const useBanner = repeatedProfilePhoto && profile.bannerImageUrl;
              const imageUrl = useBanner
                ? profile.bannerImageUrl
                : (profile.profilePhotoUrl ?? profile.bannerImageUrl);
              return (
                <CoachMarketplaceCard
                  key={profile.userId}
                  profile={profile}
                  imageUrl={imageUrl}
                  imageIsPortrait={
                    Boolean(profile.profilePhotoUrl) && !useBanner
                  }
                  coachingOptionCount={
                    packageCountsQuery.isSuccess
                      ? (packageCountsQuery.data?.[profile.userId] ?? 0)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="rs-marketplace-process">
        <div className="rs-marketplace-section-inner">
          <div className="rs-marketplace-section-heading">
            <div>
              <p className="rs-stitch-kicker">How it works</p>
              <h2>Review a profile, apply, and talk with the coach.</h2>
            </div>
          </div>
          <ol className="rs-marketplace-process__steps">
            {marketplaceSteps.map((step) => (
              <li key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="rs-marketplace-process__note">
            The coach reviews each application and decides whether to accept the
            client.
          </p>
        </div>
      </section>

      <section className="rs-marketplace-trust">
        <div className="rs-marketplace-section-inner rs-marketplace-trust__grid">
          <div>
            <p className="rs-stitch-kicker">Trust</p>
            <h2>Review the information supplied by each coach.</h2>
          </div>
          <div className="rs-marketplace-trust__body">
            <p>
              Coach profiles, services, availability, qualifications, and public
              pricing are supplied by each coach. Review the full profile and
              ask the coach about any information that affects your decision.
            </p>
            <nav aria-label="Marketplace trust resources">
              <Link to="/security">
                <ShieldCheck size={17} aria-hidden="true" />
                Security
              </Link>
              <Link to="/privacy">
                <LockKeyhole size={17} aria-hidden="true" />
                Privacy
              </Link>
              <Link to="/faq">
                <CircleHelp size={17} aria-hidden="true" />
                Client FAQ
              </Link>
            </nav>
          </div>
        </div>
      </section>

      <section className="rs-marketplace-entry">
        <div className="rs-marketplace-section-inner rs-marketplace-entry__grid">
          <div>
            <p className="rs-stitch-kicker">Existing client</p>
            <h2>Open your existing client account.</h2>
            <p>
              Use your invitation or sign in to open your current coaching
              experience.
            </p>
            <div className="rs-marketplace-entry__actions">
              <PublicSiteLink to="/signup/client">
                I have an invitation
              </PublicSiteLink>
              <PublicSiteLink to="/login" variant="secondary">
                Log in
              </PublicSiteLink>
            </div>
          </div>
          <div className="rs-marketplace-entry__coach">
            <p>Are you a coach?</p>
            <Link to="/start-trial">
              Start your 7-day coach trial
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function MarketplaceEmpty({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rs-marketplace-empty">
      {icon ? <div className="rs-marketplace-empty__icon">{icon}</div> : null}
      <h2>{title}</h2>
      <p>{body}</p>
      {action ?? (
        <PublicSiteLink to="/for-coaches" variant="secondary">
          Explore RepSync for coaches
        </PublicSiteLink>
      )}
    </div>
  );
}
