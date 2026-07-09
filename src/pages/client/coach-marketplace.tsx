import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/coachos";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { useCoachMarketplaceProfiles } from "../../features/pt-hub/lib/pt-hub";
import type {
  PTAvailabilityMode,
  PTCoachingMode,
  PTPublicProfile,
} from "../../features/pt-hub/types";
import { routes } from "../../lib/routes";

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

function MarketplaceSkeletonGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <SurfaceCard key={index}>
          <SurfaceCardContent className="space-y-4 pt-5 sm:pt-6">
            <div className="flex gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-20 w-full rounded-2xl" />
          </SurfaceCardContent>
        </SurfaceCard>
      ))}
    </div>
  );
}

function CoachMarketplaceCard({ profile }: { profile: PTPublicProfile }) {
  const profilePath = routes.publicProfile(profile.slug);
  const specialties = profile.specialties.slice(0, 3);
  const coachingModes = profile.coachingModes.slice(0, 3);
  const availabilityModes = profile.availabilityModes.slice(0, 2);

  return (
    <SurfaceCard className="h-full">
      <SurfaceCardContent className="flex h-full flex-col gap-5 pt-5 sm:pt-6">
        <div className="flex min-w-0 gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border/70 bg-muted/40">
            {profile.profilePhotoUrl ? (
              <img
                src={profile.profilePhotoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                {getInitials(profile)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">
                {profile.displayName}
              </h2>
              {profile.headline ? (
                <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {profile.headline}
                </p>
              ) : null}
            </div>
            {profile.locationLabel ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">{profile.locationLabel}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-20">
          <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
            {profile.shortBio ||
              profile.coachingStyle ||
              "This coach has published a RepSync profile and is open to client inquiries."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
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

        <div className="mt-auto flex flex-wrap gap-2">
          <Button asChild>
            <Link to={profilePath}>View profile</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={`${profilePath}#apply`}>Apply</Link>
          </Button>
        </div>
      </SurfaceCardContent>
    </SurfaceCard>
  );
}

export function ClientCoachMarketplacePage() {
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
    <div className="space-y-6">
      <PortalPageHeader
        title="Coach Marketplace"
        subtitle="Browse published RepSync coaches and choose who you want to work with."
        module="leads"
        stateText={
          profilesQuery.isLoading
            ? "Loading coaches"
            : `${filteredProfiles.length} coach${filteredProfiles.length === 1 ? "" : "es"}`
        }
      />

      <SurfaceCard>
        <SurfaceCardHeader>
          <SurfaceCardTitle>Find your next coach</SurfaceCardTitle>
          <SurfaceCardDescription>
            Search by name, specialty, location, coaching style, or service
            type.
          </SurfaceCardDescription>
        </SurfaceCardHeader>
        <SurfaceCardContent>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="relative">
              <Search className="app-search-icon h-4 w-4" />
              <Input
                className="app-search-input"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search coaches"
              />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/50 px-3 py-2 text-xs font-medium text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Published coaches only
            </div>
          </div>
        </SurfaceCardContent>
      </SurfaceCard>

      {profilesQuery.isLoading ? (
        <MarketplaceSkeletonGrid />
      ) : profilesQuery.error ? (
        <SurfaceCard>
          <SurfaceCardContent className="py-8">
            <EmptyStateBlock
              title="Unable to load Coach Marketplace"
              description="Retry in a moment. Published coach profiles will appear here once the marketplace data is available."
            />
          </SurfaceCardContent>
        </SurfaceCard>
      ) : profiles.length === 0 ? (
        <SurfaceCard>
          <SurfaceCardContent className="py-8">
            <EmptyStateBlock
              title="No coaches are listed yet"
              description="Published RepSync coach profiles will appear here when coaches make themselves visible in the marketplace."
              icon={<UserRound className="h-5 w-5" />}
            />
          </SurfaceCardContent>
        </SurfaceCard>
      ) : filteredProfiles.length === 0 ? (
        <SurfaceCard>
          <SurfaceCardContent className="py-8">
            <EmptyStateBlock
              title="No matching coaches"
              description="Try a different name, specialty, location, or coaching style."
              icon={<Search className="h-5 w-5" />}
            />
          </SurfaceCardContent>
        </SurfaceCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredProfiles.map((profile) => (
            <CoachMarketplaceCard key={profile.userId} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}
