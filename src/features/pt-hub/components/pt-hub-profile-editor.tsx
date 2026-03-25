import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ImageIcon, Save, Sparkles } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import type { StoredProfileDraft } from "../lib/pt-hub";
import { getPublicCoachUrl, slugifyValue } from "../lib/pt-hub";
import type {
  PTAvailabilityMode,
  PTCoachingMode,
  PTProfile,
  PTProfileReadiness,
  PTPublicationState,
} from "../types";
import { PtHubPublicationPanel } from "./pt-hub-publication-panel";
import { PtHubReadinessPanel } from "./pt-hub-readiness-panel";
import { PtHubSectionCard } from "./pt-hub-section-card";

const coachingModeOptions: Array<{
  value: PTCoachingMode;
  label: string;
}> = [
  { value: "one_on_one", label: "1:1 coaching" },
  { value: "programming", label: "Programming" },
  { value: "nutrition", label: "Nutrition" },
  { value: "accountability", label: "Accountability" },
];

const availabilityModeOptions: Array<{
  value: PTAvailabilityMode;
  label: string;
}> = [
  { value: "online", label: "Online" },
  { value: "in_person", label: "In-person" },
];

function listToInput(values: string[]) {
  return values.join(", ");
}

function inputToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createDraft(profile: PTProfile): StoredProfileDraft {
  return {
    fullName: profile.fullName,
    displayName: profile.displayName,
    slug: profile.slug,
    headline: profile.headline,
    searchableHeadline: profile.searchableHeadline,
    shortBio: profile.shortBio,
    specialties: profile.specialties,
    certifications: profile.certifications,
    coachingStyle: profile.coachingStyle,
    coachingModes: profile.coachingModes,
    availabilityModes: profile.availabilityModes,
    locationLabel: profile.locationLabel,
    marketplaceVisible: profile.marketplaceVisible,
    isPublished: profile.isPublished,
    publishedAt: profile.publishedAt,
    profilePhotoUrl: profile.profilePhotoUrl,
    bannerImageUrl: profile.bannerImageUrl,
    socialLinks: profile.socialLinks,
    testimonials: profile.testimonials,
    transformations: profile.transformations,
  };
}

export function PtHubProfileEditor({
  profile,
  readiness,
  publicationState,
  saving,
  publishing,
  onSave,
  onTogglePublish,
}: {
  profile: PTProfile;
  readiness: PTProfileReadiness;
  publicationState: PTPublicationState;
  saving: boolean;
  publishing: boolean;
  onSave: (draft: StoredProfileDraft) => Promise<void>;
  onTogglePublish: (nextPublished: boolean) => Promise<void>;
}) {
  const [form, setForm] = useState<StoredProfileDraft>(createDraft(profile));
  const [specialtiesInput, setSpecialtiesInput] = useState(
    listToInput(profile.specialties),
  );
  const [certificationsInput, setCertificationsInput] = useState(
    listToInput(profile.certifications),
  );

  useEffect(() => {
    setForm(createDraft(profile));
    setSpecialtiesInput(listToInput(profile.specialties));
    setCertificationsInput(listToInput(profile.certifications));
  }, [profile]);

  const toggleValue = <TValue extends string>(
    values: TValue[],
    value: TValue,
  ) =>
    values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];

  const hasChanges =
    JSON.stringify(form) !== JSON.stringify(createDraft(profile));
  const publicUrl = getPublicCoachUrl(form.slug);
  const quickWins = readiness.checklist.filter((item) => !item.complete).slice(0, 4);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.34fr)_340px]">
      <Tabs defaultValue="identity" className="min-w-0">
        <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-[22px] border border-border/60 bg-background/35 p-2">
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="expertise">Expertise</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="social">Social Links</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        {!readiness.readyForPublish ? (
          <div className="mt-5 rounded-[24px] border border-border/60 bg-background/30 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">
                    Editor priorities
                  </p>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Complete the next few high-signal items inside the editor to strengthen publish readiness.
                </p>
              </div>
              <Badge variant="secondary">{readiness.completionPercent}% complete</Badge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {quickWins.map((item) => (
                <div
                  key={item.key}
                  className="rounded-[18px] bg-background/45 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {item.guidance}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="ghost" className="shrink-0">
                      <Link to={item.href}>Fix</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <TabsContent value="identity" className="space-y-5">
          <PtHubSectionCard
            title="Profile media"
            description="Keep the public-facing visual system deliberate. Upload storage can wire in later without changing the editor structure."
            contentClassName="space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-dashed border-border/70 bg-background/35 p-4">
                <div className="flex h-28 items-center justify-center rounded-[20px] border border-border/60 bg-background/70">
                  {form.profilePhotoUrl ? (
                    <img
                      src={form.profilePhotoUrl}
                      alt={form.displayName || form.fullName || "Profile preview"}
                      className="h-full w-full rounded-[20px] object-cover"
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                      Profile photo preview
                    </div>
                  )}
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">Profile photo</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use a square headshot for the public-facing coach identity.
                </p>
                <Input
                  className="mt-4"
                  placeholder="Image URL or upload wiring later"
                  value={form.profilePhotoUrl ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      profilePhotoUrl: event.target.value || null,
                    }))
                  }
                />
              </div>
              <div className="rounded-[24px] border border-dashed border-border/70 bg-background/35 p-4">
                <div className="flex h-28 items-center justify-center rounded-[20px] border border-border/60 bg-background/70">
                  {form.bannerImageUrl ? (
                    <img
                      src={form.bannerImageUrl}
                      alt="Banner preview"
                      className="h-full w-full rounded-[20px] object-cover"
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                      Banner preview
                    </div>
                  )}
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">Banner image</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Wide visual used in the public profile hero and future marketplace listing.
                </p>
                <Input
                  className="mt-4"
                  placeholder="Banner image URL or upload wiring later"
                  value={form.bannerImageUrl ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      bannerImageUrl: event.target.value || null,
                    }))
                  }
                />
              </div>
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Identity"
            description="This is the internal PT Hub editor for your future public-facing profile."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Full name
                </label>
                <Input
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, fullName: event.target.value }))
                  }
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Display name
                </label>
                <Input
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((prev) => {
                      const nextDisplayName = event.target.value;
                      return {
                        ...prev,
                        displayName: nextDisplayName,
                        slug:
                          prev.slug || !nextDisplayName
                            ? prev.slug
                            : slugifyValue(nextDisplayName),
                      };
                    })
                  }
                  placeholder="How clients will see your brand"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Headline</label>
              <Input
                value={form.headline}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    headline: event.target.value,
                    searchableHeadline:
                      prev.searchableHeadline || !event.target.value
                        ? prev.searchableHeadline
                        : event.target.value,
                  }))
                }
                placeholder="High-performance coach for founders, athletes, and operators"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Short bio</label>
              <textarea
                className="min-h-[160px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={form.shortBio}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, shortBio: event.target.value }))
                }
                placeholder="Outline your mission, outcomes, and the type of client transformation you specialize in."
              />
            </div>
          </PtHubSectionCard>
        </TabsContent>

        <TabsContent value="expertise" className="space-y-5">
          <PtHubSectionCard
            title="Positioning and proof"
            description="Clarify what you help with, the proof behind it, and how you coach."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Specialties
                  </label>
                  <Input
                    value={specialtiesInput}
                    onChange={(event) => {
                      setSpecialtiesInput(event.target.value);
                      setForm((prev) => ({
                        ...prev,
                        specialties: inputToList(event.target.value),
                      }));
                    }}
                    placeholder="Strength, Hypertrophy, Fat loss, Executive performance"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.specialties.length > 0 ? (
                    form.specialties.map((item) => (
                      <Badge key={item} variant="muted">
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Add specialties to shape your positioning.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Certifications
                  </label>
                  <Input
                    value={certificationsInput}
                    onChange={(event) => {
                      setCertificationsInput(event.target.value);
                      setForm((prev) => ({
                        ...prev,
                        certifications: inputToList(event.target.value),
                      }));
                    }}
                    placeholder="NASM CPT, Precision Nutrition, EXOS"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.certifications.length > 0 ? (
                    form.certifications.map((item) => (
                      <Badge key={item} variant="secondary">
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Add at least one credential to strengthen trust.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-sm font-medium text-foreground">
                Coaching style
              </label>
              <p className="text-sm text-muted-foreground">
                Describe how you coach, communicate, and keep clients accountable.
              </p>
            </div>
            <textarea
              className="min-h-[180px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              value={form.coachingStyle}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  coachingStyle: event.target.value,
                }))
              }
              placeholder="Structured, high-touch, feedback-driven, and deeply habit-focused."
            />
          </PtHubSectionCard>
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-5">
          <PtHubSectionCard
            title="Public route"
            description="This slug powers the public profile URL and future shareable coach page."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Public slug
                </label>
                <Input
                  value={form.slug}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      slug: slugifyValue(event.target.value),
                    }))
                  }
                  placeholder="your-name-coach"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Searchable headline
                </label>
                <Input
                  value={form.searchableHeadline}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      searchableHeadline: event.target.value,
                    }))
                  }
                  placeholder="Used for future marketplace search and discovery"
                />
              </div>
            </div>
            <div className="rounded-[20px] bg-background/45 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Public URL preview
              </p>
              <p className="mt-2 break-all text-sm text-foreground">
                {publicUrl ?? "Add a slug to generate your public URL."}
              </p>
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Discoverability"
            description="These fields prepare the profile for future marketplace filtering without building the full directory yet."
          >
            <div className="grid gap-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">
                  Coaching modes
                </label>
                <div className="flex flex-wrap gap-2">
                  {coachingModeOptions.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={
                        form.coachingModes.includes(option.value)
                          ? "default"
                          : "secondary"
                      }
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          coachingModes: toggleValue(
                            prev.coachingModes,
                            option.value,
                          ),
                        }))
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">
                  Availability
                </label>
                <div className="flex flex-wrap gap-2">
                  {availabilityModeOptions.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={
                        form.availabilityModes.includes(option.value)
                          ? "default"
                          : "secondary"
                      }
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          availabilityModes: toggleValue(
                            prev.availabilityModes,
                            option.value,
                          ),
                        }))
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Location
                  </label>
                  <Input
                    value={form.locationLabel}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        locationLabel: event.target.value,
                      }))
                    }
                    placeholder="Riyadh, Saudi Arabia"
                  />
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Marketplace visibility
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Controls future directory discoverability.
                      </p>
                    </div>
                    <Switch
                      checked={form.marketplaceVisible}
                      onCheckedChange={(checked) =>
                        setForm((prev) => ({
                          ...prev,
                          marketplaceVisible: checked,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </PtHubSectionCard>
        </TabsContent>

        <TabsContent value="social" className="space-y-5">
          <PtHubSectionCard
            title="Social links"
            description="Keep these destination links clean and intentional. The future public page will reuse them."
          >
            <div className="space-y-4">
              {form.socialLinks.map((link) => (
                <div
                  key={link.platform}
                  className="grid gap-3 rounded-[18px] bg-background/35 px-4 py-3 md:grid-cols-[160px_1fr]"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {link.label}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Leave blank to keep it hidden later.
                    </p>
                  </div>
                  <Input
                    value={link.url}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        socialLinks: prev.socialLinks.map((item) =>
                          item.platform === link.platform
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      }))
                    }
                    placeholder={`https://${link.platform}.com/your-handle`}
                  />
                </div>
              ))}
            </div>
          </PtHubSectionCard>
        </TabsContent>

        <TabsContent value="preview" className="space-y-5">
          <PtHubSectionCard
            title="Public profile preview"
            description="Use the dedicated preview page for the full live layout. This tab keeps a lightweight editorial snapshot inside the editor."
          >
            <div className="overflow-hidden rounded-[28px] border border-border/70 bg-background/70">
              <div className="h-40 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.35),transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(8,12,22,1))]" />
              <div className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-semibold text-foreground">
                      {form.displayName || "Display name"}
                    </p>
                    <p className="mt-1 text-sm text-primary">
                      {form.headline || "Headline goes here"}
                    </p>
                  </div>
                  <Badge variant="secondary">Draft preview</Badge>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {form.shortBio ||
                    "Short bio preview. Your PT Hub profile powers the public coach page and future marketplace surfaces."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {form.specialties.length > 0 ? (
                    form.specialties.map((item) => (
                      <Badge key={item}>{item}</Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Specialties will appear here.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </PtHubSectionCard>
        </TabsContent>
      </Tabs>

      <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <PtHubPublicationPanel
          publicationState={publicationState}
          publishing={publishing}
          onTogglePublish={onTogglePublish}
        />

        <PtHubReadinessPanel readiness={readiness} compact />

        <PtHubSectionCard
          title="Preview and save"
          description="Use the internal preview while editing, then save the latest profile changes."
        >
          <div className="space-y-3">
            <Button asChild variant="secondary" className="w-full">
              <Link to="/pt-hub/profile/preview">Open full preview</Link>
            </Button>
            <Button
              className="w-full"
              disabled={saving || !hasChanges}
              onClick={() => onSave(form)}
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </PtHubSectionCard>
      </div>
    </div>
  );
}
