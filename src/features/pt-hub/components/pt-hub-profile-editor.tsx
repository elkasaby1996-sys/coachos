import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  EyeOff,
  Globe,
  ImageIcon,
  Info,
  Plus,
  Save,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { FieldCharacterMeta } from "../../../components/common/field-character-meta";
import type { StoredProfileDraft } from "../lib/pt-hub";
import {
  getPublicCoachUrl,
  mapPublicPtPackageOptionsFromPackages,
  slugifyValue,
  usePtPackages,
  usePtProfileSlugAvailability,
} from "../lib/pt-hub";
import {
  PUBLIC_PROFILE_SLUG_MAX_LENGTH,
  validatePublicProfileSlug,
} from "../lib/public-profile-slug";
import {
  uploadPtProfileMedia,
  type PtProfileMediaKind,
} from "../lib/pt-profile-media";
import type {
  PTAvailabilityMode,
  PTCoachingMode,
  PTProfile,
  PTProfilePreviewData,
  PTProfileReadiness,
  PTProfileReadinessItem,
  PTPublicationState,
} from "../types";
import { PtHubSectionCard } from "./pt-hub-section-card";
import { PtHubProfilePreview } from "./pt-hub-profile-preview";
import { useSessionAuth } from "../../../lib/auth";
import { routes } from "../../../lib/routes";
import { cn } from "../../../lib/utils";
import {
  getCharacterLimitState,
  hasCharacterLimitError,
} from "../../../lib/character-limits";
import { getSemanticBadgeVariant } from "../../../lib/semantic-status";

const coachingModeOptions: Array<{
  value: PTCoachingMode;
  label: string;
}> = [
  { value: "one_on_one", label: "1:1 coaching" },
  { value: "programming", label: "Programming" },
  { value: "nutrition", label: "Nutrition" },
  { value: "accountability", label: "Consultation" },
];

const availabilityModeOptions: Array<{
  value: PTAvailabilityMode;
  label: string;
}> = [
  { value: "online", label: "Online" },
  { value: "in_person", label: "In-person" },
];

const profileBuilderSteps = [
  {
    value: "identity",
    label: "Identity",
    description: "Name, hero media, and story",
    keys: ["profile_photo", "banner", "display_name", "headline", "bio"],
  },
  {
    value: "proof",
    label: "Proof",
    description: "Specialties, credentials, and results",
    keys: ["specialties", "certifications", "coaching_style"],
  },
  {
    value: "offer",
    label: "Offer",
    description: "Packages and selling surface",
    keys: [],
  },
  {
    value: "visibility",
    label: "Visibility",
    description: "URL, discovery, and social proof",
    keys: ["social_links", "cta_ready"],
  },
  {
    value: "preview",
    label: "Preview",
    description: "Check the public storefront",
    keys: [],
  },
] as const;

function listToInput(values: string[]) {
  return values.join(", ");
}

function inputToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createTransformationDraft() {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `transformation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    summary: "",
    beforeImageUrl: null,
    afterImageUrl: null,
  };
}

function UploadButton({
  label,
  uploading,
  disabled,
  accept = "image/jpeg,image/png,image/webp",
  onFileSelected,
}: {
  label: string;
  uploading: boolean;
  disabled?: boolean;
  accept?: string;
  onFileSelected: (file: File) => Promise<void> | void;
}) {
  return (
    <label className="block">
      <input
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void onFileSelected(file);
        }}
      />
      <span className="inline-flex">
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          disabled={disabled || uploading}
          asChild
        >
          <span>
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : label}
          </span>
        </Button>
      </span>
    </label>
  );
}

function getStepCompletion(
  keys: readonly PTProfileReadinessItem["key"][],
  readiness: PTProfileReadiness,
) {
  if (keys.length === 0) return { complete: 0, total: 0, percent: 100 };

  const complete = keys.filter((key) =>
    readiness.checklist.find((item) => item.key === key && item.complete),
  ).length;

  return {
    complete,
    total: keys.length,
    percent: Math.round((complete / keys.length) * 100),
  };
}

function InfoHint({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const hintId = useId();

  return (
    <span
      className="relative inline-flex"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? hintId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <Info className="h-3.5 w-3.5 [stroke-width:1.8]" />
      </button>
      {open ? (
        <span
          id={hintId}
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-md"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

function ChipInput({
  id,
  label,
  helperText,
  placeholder,
  values,
  value,
  isInvalid,
  onValueChange,
  onValuesChange,
}: {
  id: string;
  label: string;
  helperText?: string;
  placeholder: string;
  values: string[];
  value: string;
  isInvalid: boolean;
  onValueChange: (value: string) => void;
  onValuesChange: (values: string[]) => void;
}) {
  const commitValue = (rawValue: string) => {
    const nextItems = inputToList(rawValue);
    if (nextItems.length === 0) return;

    const merged = Array.from(new Set([...values, ...nextItems]));
    onValuesChange(merged);
    onValueChange("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" && event.key !== ",") return;

    event.preventDefault();
    commitValue(value);
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {helperText ? (
        <p className="max-w-[62ch] text-sm leading-6 text-muted-foreground">
          {helperText}
        </p>
      ) : null}
      <Input
        id={id}
        isInvalid={isInvalid}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onBlur={() => commitValue(value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      <div className="flex min-h-9 flex-wrap gap-2">
        {values.length > 0 ? (
          values.map((item) => (
            <Badge key={item} variant="muted" className="gap-1.5 pr-1">
              {item}
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() =>
                  onValuesChange(
                    values.filter((valueItem) => valueItem !== item),
                  )
                }
                aria-label={`Remove ${item}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Press Enter after each item to build this list.
          </p>
        )}
      </div>
    </div>
  );
}

function PtHubLiveProfilePreview({
  form,
  displayNameValue,
}: {
  form: StoredProfileDraft;
  displayNameValue: string;
}) {
  return (
    <div className="pt-hub-live-preview overflow-hidden rounded-[24px] border border-border/70 bg-background/55">
      <div className="relative h-20 overflow-hidden bg-muted">
        {form.bannerImageUrl ? (
          <img
            src={form.bannerImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,oklch(var(--primary)/0.26),transparent_34%),linear-gradient(135deg,oklch(var(--bg-surface-elevated)/0.9),oklch(var(--bg-surface)/0.74))]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent" />
      </div>
      <div className="relative space-y-3 px-4 pb-4 pt-0">
        <div className="-mt-10 flex items-end justify-between gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] border border-border/70 bg-background shadow-[0_16px_34px_-26px_oklch(0_0_0/0.65)]">
            {form.profilePhotoUrl ? (
              <img
                src={form.profilePhotoUrl}
                alt={displayNameValue || "Profile photo preview"}
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
        <div>
          <p className="text-lg font-semibold leading-tight text-foreground">
            {displayNameValue || "Display name"}
          </p>
          <p className="mt-1 text-sm font-medium leading-5 text-primary">
            {form.headline || "Headline appears here"}
          </p>
        </div>
        <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
          {form.shortBio ||
            "Add a short bio so prospects understand your coaching style, proof, and ideal client fit."}
        </p>
        <div className="flex flex-wrap gap-2">
          {form.specialties.length > 0 ? (
            form.specialties.slice(0, 2).map((item) => (
              <Badge key={item} variant="muted">
                {item}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Specialties will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function createDraft(profile: PTProfile): StoredProfileDraft {
  const normalizedDisplayName =
    profile.displayName.trim() || profile.fullName.trim();
  const normalizedFullName = profile.fullName.trim() || normalizedDisplayName;

  return {
    fullName: normalizedFullName,
    displayName: normalizedDisplayName,
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

function getDraftProfilePreviewData(
  draft: StoredProfileDraft,
): PTProfilePreviewData {
  const displayName = draft.displayName.trim() || draft.fullName.trim();
  const slug = validatePublicProfileSlug(draft.slug, {
    allowEmpty: true,
  }).slug;

  return {
    fullName: draft.fullName,
    displayName,
    slug,
    headline: draft.headline,
    searchableHeadline: draft.searchableHeadline,
    shortBio: draft.shortBio,
    specialties: draft.specialties,
    certifications: draft.certifications,
    coachingStyle: draft.coachingStyle,
    coachingModes: draft.coachingModes,
    availabilityModes: draft.availabilityModes,
    locationLabel: draft.locationLabel,
    marketplaceVisible: draft.marketplaceVisible,
    isPublished: draft.isPublished,
    publicUrl: getPublicCoachUrl(slug),
    profilePhotoUrl: draft.profilePhotoUrl,
    bannerImageUrl: draft.bannerImageUrl,
    socialLinks: draft.socialLinks,
    testimonials: draft.testimonials,
    transformations: draft.transformations,
  };
}

function applyUploadedProfileMedia(
  draft: StoredProfileDraft,
  params: {
    kind: PtProfileMediaKind;
    publicUrl: string;
    transformationId?: string;
  },
) {
  if (params.kind === "profile-photo") {
    return { ...draft, profilePhotoUrl: params.publicUrl };
  }

  if (params.kind === "banner") {
    return { ...draft, bannerImageUrl: params.publicUrl };
  }

  return {
    ...draft,
    transformations: draft.transformations.map((item) =>
      item.id === params.transformationId
        ? {
            ...item,
            beforeImageUrl:
              params.kind === "transformation-before"
                ? params.publicUrl
                : item.beforeImageUrl,
            afterImageUrl:
              params.kind === "transformation-after"
                ? params.publicUrl
                : item.afterImageUrl,
          }
        : item,
    ),
  };
}

function PtHubProfileLaunchPanel({
  form,
  displayNameValue,
  readiness,
  publicationState,
  saving,
  publishing,
  mediaBusy,
  hasChanges,
  hasOverLimitErrors,
  onSave,
  onTogglePublish,
}: {
  form: StoredProfileDraft;
  displayNameValue: string;
  readiness: PTProfileReadiness;
  publicationState: PTPublicationState;
  saving: boolean;
  publishing: boolean;
  mediaBusy: boolean;
  hasChanges: boolean;
  hasOverLimitErrors: boolean;
  onSave: (draft: StoredProfileDraft) => Promise<void>;
  onTogglePublish: (nextPublished: boolean) => Promise<void>;
}) {
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const missingItems = readiness.checklist.filter((item) => !item.complete);
  const topMissingItems = missingItems.slice(0, 2);
  const remainingMissingCount = missingItems.length - topMissingItems.length;
  const publicSlugValidation = validatePublicProfileSlug(form.slug, {
    allowEmpty: true,
  });
  const publicProfilePath =
    publicSlugValidation.valid && publicSlugValidation.slug
      ? routes.publicProfile(publicSlugValidation.slug)
      : null;
  const publicUrl = getPublicCoachUrl(publicSlugValidation.slug);
  const canPublishNow =
    publicationState.canPublish && !hasChanges && !hasOverLimitErrors;
  const primaryActionLabel = hasChanges
    ? "Save profile"
    : publicationState.isPublished
      ? "View public profile"
      : readiness.readyForPublish
        ? "Publish profile"
        : "Finish profile";
  const canCopyPublicUrl = Boolean(publicationState.isPublished && publicUrl);

  const handleCopyPublicUrl = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopiedPublicUrl(true);
    window.setTimeout(() => setCopiedPublicUrl(false), 1800);
  };

  return (
    <aside className="pt-hub-profile-launch-rail space-y-5">
      <PtHubSectionCard
        title="Launch panel"
        description="Readiness validates the profile. Publishing makes it live."
        contentClassName="space-y-4"
        actions={
          <Badge
            variant={getSemanticBadgeVariant(
              publicationState.isPublished ? "Published" : "Unpublished",
            )}
          >
            {publicationState.isPublished ? "Published" : "Unpublished"}
          </Badge>
        }
      >
        <div className="space-y-2.5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Profile readiness
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {readiness.readyForPublish
                  ? "Ready to publish."
                  : `${missingItems.length} blocker${missingItems.length === 1 ? "" : "s"} before launch.`}
              </p>
            </div>
            <span className="font-mono text-[1.65rem] font-semibold leading-none tabular-nums text-foreground">
              {readiness.completionPercent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                readiness.readyForPublish ? "bg-success" : "bg-warning",
              )}
              style={{ width: `${readiness.completionPercent}%` }}
            />
          </div>
        </div>

        {missingItems.length > 0 ? (
          <div className="rounded-[20px] border border-warning/22 bg-warning/12 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <p className="text-sm font-medium text-foreground">
                Finish first
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {topMissingItems.map((item) => (
                <Badge key={item.key} variant="warning">
                  {item.label}
                </Badge>
              ))}
              {remainingMissingCount > 0 ? (
                <Badge variant="secondary">+{remainingMissingCount} more</Badge>
              ) : null}
            </div>
          </div>
        ) : null}

        <PtHubLiveProfilePreview
          form={form}
          displayNameValue={displayNameValue}
        />

        <div className="grid gap-3">
          <Button
            asChild
            variant="secondary"
            className="w-full justify-between"
          >
            <Link to="/pt-hub/profile/preview">
              Open full preview
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild={publicationState.isPublished && Boolean(publicUrl)}
            className="w-full justify-between"
            disabled={
              saving ||
              publishing ||
              mediaBusy ||
              hasOverLimitErrors ||
              (!hasChanges &&
                !publicationState.isPublished &&
                readiness.readyForPublish &&
                !canPublishNow)
            }
            onClick={() => {
              if (hasChanges) {
                void onSave({
                  ...form,
                  fullName: displayNameValue,
                  displayName: displayNameValue,
                });
                return;
              }

              if (!readiness.readyForPublish || publicationState.isPublished) {
                return;
              }

              void onTogglePublish(!publicationState.isPublished);
            }}
          >
            {publicationState.isPublished && publicProfilePath ? (
              <a href={publicProfilePath} target="_blank" rel="noreferrer">
                <span>{primaryActionLabel}</span>
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : (
              <>
                <span>
                  {mediaBusy
                    ? "Finish uploads first"
                    : saving
                      ? "Saving..."
                      : publishing
                        ? "Updating..."
                        : hasOverLimitErrors
                          ? "Fix profile errors"
                          : primaryActionLabel}
                </span>
                {hasChanges ? (
                  <Save className="h-4 w-4" />
                ) : publicationState.isPublished ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : readiness.readyForPublish ? (
                  <Globe className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </>
            )}
          </Button>
          {canCopyPublicUrl ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between"
              onClick={() => void handleCopyPublicUrl()}
            >
              {copiedPublicUrl ? "Link copied" : "Copy link"}
              <Copy className="h-4 w-4" />
            </Button>
          ) : null}
          {publicationState.isPublished ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between text-muted-foreground hover:text-foreground"
              disabled={saving || publishing || mediaBusy}
              onClick={() => void onTogglePublish(false)}
            >
              {publishing ? "Updating..." : "Unpublish profile"}
              <EyeOff className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </PtHubSectionCard>
    </aside>
  );
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
  const reduceMotion = useReducedMotion();
  const fieldIdPrefix = useId();
  const [activeTab, setActiveTab] = useState("identity");
  const { user } = useSessionAuth();
  const packagesQuery = usePtPackages();
  const [form, setForm] = useState<StoredProfileDraft>(createDraft(profile));
  const [specialtiesInput, setSpecialtiesInput] = useState("");
  const [certificationsInput, setCertificationsInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    setForm(createDraft(profile));
    setSpecialtiesInput("");
    setCertificationsInput("");
    setLocationInput("");
    setMediaError(null);
    setUploadingTarget(null);
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
  const quickWins = readiness.checklist
    .filter((item) => !item.complete)
    .slice(0, 4);
  const showLaunchPriorities =
    !publicationState.isPublished || !readiness.readyForPublish;
  const mediaBusy = Boolean(uploadingTarget);
  const displayNameValue = form.displayName.trim() || form.fullName.trim();
  const locationValues = inputToList(form.locationLabel);
  const previewData = getDraftProfilePreviewData(form);
  const packageOptions = mapPublicPtPackageOptionsFromPackages(
    packagesQuery.data ?? [],
  );
  const displayNameLimitState = getCharacterLimitState({
    value: form.displayName,
    kind: "short_name",
    fieldLabel: "Display name",
  });
  const headlineLimitState = getCharacterLimitState({
    value: form.headline,
    kind: "entity_name",
    fieldLabel: "Headline",
  });
  const shortBioLimitState = getCharacterLimitState({
    value: form.shortBio,
    kind: "bio",
    fieldLabel: "Short bio",
  });
  const specialtiesLimitState = getCharacterLimitState({
    value: listToInput([...form.specialties, specialtiesInput]),
    kind: "default_text",
    fieldLabel: "Specialties",
  });
  const certificationsLimitState = getCharacterLimitState({
    value: listToInput([...form.certifications, certificationsInput]),
    kind: "default_text",
    fieldLabel: "Certifications",
  });
  const coachingStyleLimitState = getCharacterLimitState({
    value: form.coachingStyle,
    kind: "default_text",
    fieldLabel: "Coaching style",
  });
  const slugLimitState = getCharacterLimitState({
    value: form.slug,
    limit: PUBLIC_PROFILE_SLUG_MAX_LENGTH,
    fieldLabel: "Public slug",
  });
  const slugValidation = validatePublicProfileSlug(form.slug, {
    allowEmpty: true,
  });
  const slugAvailabilityQuery = usePtProfileSlugAvailability(form.slug);
  const slugAvailability = slugAvailabilityQuery.data;
  const slugErrorText =
    slugValidation.error ??
    (slugAvailability && !slugAvailability.available
      ? slugAvailability.message || "This public slug is already in use."
      : null);
  const slugChangedAfterPublish =
    profile.isPublished &&
    slugValidation.slug !== validatePublicProfileSlug(profile.slug).slug;
  const locationLimitState = getCharacterLimitState({
    value: listToInput([...locationValues, locationInput]),
    kind: "default_text",
    fieldLabel: "Location",
  });
  const transformationTitleStates = form.transformations.map((item) =>
    getCharacterLimitState({
      value: item.title,
      kind: "entity_name",
      fieldLabel: "Transformation title",
    }),
  );
  const transformationSummaryStates = form.transformations.map((item) =>
    getCharacterLimitState({
      value: item.summary,
      kind: "default_text",
      fieldLabel: "Transformation summary",
    }),
  );
  const socialLinkStates = form.socialLinks.map((link) =>
    getCharacterLimitState({
      value: link.url,
      kind: "default_text",
      fieldLabel: `${link.label} URL`,
    }),
  );
  const hasOverLimitErrors =
    hasCharacterLimitError([
      displayNameLimitState,
      headlineLimitState,
      shortBioLimitState,
      specialtiesLimitState,
      certificationsLimitState,
      coachingStyleLimitState,
      slugLimitState,
      locationLimitState,
      ...transformationTitleStates,
      ...transformationSummaryStates,
      ...socialLinkStates,
    ]) || Boolean(slugErrorText);

  const updateTransformation = (
    transformationId: string,
    patch: Partial<StoredProfileDraft["transformations"][number]>,
  ) => {
    setForm((prev) => ({
      ...prev,
      transformations: prev.transformations.map((item) =>
        item.id === transformationId ? { ...item, ...patch } : item,
      ),
    }));
  };

  const handleMediaUpload = async (params: {
    file: File;
    kind:
      | "profile-photo"
      | "banner"
      | "transformation-before"
      | "transformation-after";
    targetKey: string;
    transformationId?: string;
  }) => {
    if (!user?.id) {
      setMediaError("Please sign in again before uploading media.");
      return;
    }

    setUploadingTarget(params.targetKey);
    setMediaError(null);
    try {
      const { publicUrl } = await uploadPtProfileMedia({
        userId: user.id,
        file: params.file,
        kind: params.kind,
        transformationId: params.transformationId,
      });

      const nextDraft = applyUploadedProfileMedia(form, {
        kind: params.kind,
        publicUrl,
        transformationId: params.transformationId,
      });

      setForm(nextDraft);
      await onSave(nextDraft);
    } catch (error) {
      setMediaError(
        error instanceof Error
          ? error.message
          : "Unable to upload profile media.",
      );
    } finally {
      setUploadingTarget(null);
    }
  };

  return (
    <div className="pt-hub-work-grid xl:grid-cols-[minmax(0,1.36fr)_360px]">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
        <TabsList className="pt-hub-profile-step-rail h-auto min-h-[4rem] w-full justify-start gap-1.5 overflow-x-auto rounded-[24px] p-1.5 xl:justify-center xl:overflow-visible">
          {profileBuilderSteps.map((step) => {
            const isActive = activeTab === step.value;
            const completion = getStepCompletion(step.keys, readiness);
            const isComplete = completion.percent === 100;

            return (
              <TabsTrigger
                key={step.value}
                className={cn(
                  "pt-hub-profile-step-trigger group flex items-center justify-center",
                  isActive ? "text-foreground" : "text-muted-foreground",
                  "min-w-[6.75rem] gap-2 sm:min-w-[7.25rem] xl:min-w-0 xl:flex-1",
                )}
                value={step.value}
              >
                {isActive ? (
                  <motion.span
                    layoutId="pt-hub-profile-tab-active-pill"
                    className="pt-hub-tab-active-pill absolute inset-0 rounded-[22px] border"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            type: "spring",
                            stiffness: 280,
                            damping: 30,
                          }
                    }
                  />
                ) : null}
                {isComplete ? (
                  <CheckCircle2
                    className="relative z-10 h-4.5 w-4.5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className={cn(
                      "relative z-10 flex shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/40 text-muted-foreground",
                      isActive ? "h-8 w-8" : "h-7 w-7",
                    )}
                    aria-hidden="true"
                  >
                    <span className="font-mono text-[11px] tabular-nums">
                      {completion.total > 0
                        ? `${completion.complete}/${completion.total}`
                        : "OK"}
                    </span>
                  </span>
                )}
                <span className={cn("relative z-10 min-w-0 text-center")}>
                  <span className="block text-xs font-semibold sm:text-sm">
                    {step.label}
                  </span>
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {showLaunchPriorities ? (
          <div className="pt-hub-support-rail mt-5 rounded-[24px] px-5 py-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)] lg:items-center">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">
                    Launch priorities
                  </p>
                  <Badge variant="secondary">
                    {readiness.completionPercent}% complete
                  </Badge>
                </div>
                <p className="max-w-[66ch] text-sm leading-6 text-muted-foreground">
                  Complete the highest-signal items while you edit. The launch
                  panel keeps save, preview, and publishing in one place.
                </p>
              </div>
              <div className="grid gap-2">
                {quickWins.length > 0 ? (
                  quickWins.slice(0, 3).map((item) => (
                    <div
                      key={item.key}
                      className="pt-hub-support-tile flex items-start justify-between gap-3 rounded-[18px] px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {item.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.guidance}
                        </p>
                      </div>
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                      >
                        <Link to={item.href}>Fix</Link>
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="pt-hub-support-tile rounded-[18px] px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      Ready to publish
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Review the live preview, then publish from the launch
                      panel.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {mediaError ? (
          <div className="mt-5 rounded-[22px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {mediaError}
          </div>
        ) : null}

        <TabsContent value="identity" className="space-y-5">
          <PtHubSectionCard title="Profile media" contentClassName="space-y-4">
            <div className="pt-hub-media-builder overflow-hidden rounded-[28px] border border-border/65 bg-background/35">
              <div className="relative h-64 overflow-hidden bg-muted">
                {form.bannerImageUrl ? (
                  <img
                    src={form.bannerImageUrl}
                    alt="Banner preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_20%_10%,oklch(var(--primary)/0.18),transparent_34%),linear-gradient(135deg,oklch(var(--bg-surface-elevated)/0.84),oklch(var(--bg-surface)/0.62))]">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                      Banner preview
                    </div>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/95 to-transparent" />
                <div className="absolute bottom-5 left-5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-[0_18px_42px_-30px_oklch(0_0_0/0.72)]">
                  {form.profilePhotoUrl ? (
                    <img
                      src={form.profilePhotoUrl}
                      alt={displayNameValue || "Profile preview"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="grid gap-5 p-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Profile photo
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Square portrait, JPG, PNG, or WebP. Aim for at least
                      800x800.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <UploadButton
                      label="Upload photo"
                      uploading={uploadingTarget === "profile-photo"}
                      disabled={
                        mediaBusy && uploadingTarget !== "profile-photo"
                      }
                      onFileSelected={async (file) =>
                        handleMediaUpload({
                          file,
                          kind: "profile-photo",
                          targetKey: "profile-photo",
                        })
                      }
                    />
                    {form.profilePhotoUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="gap-2"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            profilePhotoUrl: null,
                          }))
                        }
                      >
                        <X className="h-4 w-4" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Banner image
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Wide storefront image. Use 1600x600 or larger for the
                      cleanest crop.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <UploadButton
                      label="Upload banner"
                      uploading={uploadingTarget === "banner"}
                      disabled={mediaBusy && uploadingTarget !== "banner"}
                      onFileSelected={async (file) =>
                        handleMediaUpload({
                          file,
                          kind: "banner",
                          targetKey: "banner",
                        })
                      }
                    />
                    {form.bannerImageUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="gap-2"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, bannerImageUrl: null }))
                        }
                      >
                        <X className="h-4 w-4" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Brand identity"
            description="Set the public name and core profile story."
          >
            <div className="space-y-2">
              <label
                htmlFor={`${fieldIdPrefix}-display-name`}
                className="text-sm font-medium text-foreground"
              >
                Display name
              </label>
              <Input
                id={`${fieldIdPrefix}-display-name`}
                isInvalid={displayNameLimitState.overLimit}
                value={form.displayName}
                onChange={(event) =>
                  setForm((prev) => {
                    const nextDisplayName = event.target.value;
                    return {
                      ...prev,
                      displayName: nextDisplayName,
                      fullName: nextDisplayName,
                      slug:
                        prev.slug || !nextDisplayName
                          ? prev.slug
                          : slugifyValue(nextDisplayName),
                    };
                  })
                }
                placeholder="How clients will see your brand"
              />
              <FieldCharacterMeta
                count={displayNameLimitState.count}
                limit={displayNameLimitState.limit}
                errorText={displayNameLimitState.errorText}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor={`${fieldIdPrefix}-headline`}
                className="text-sm font-medium text-foreground"
              >
                Headline
              </label>
              <Input
                id={`${fieldIdPrefix}-headline`}
                isInvalid={headlineLimitState.overLimit}
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
              <FieldCharacterMeta
                count={headlineLimitState.count}
                limit={headlineLimitState.limit}
                errorText={headlineLimitState.errorText}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor={`${fieldIdPrefix}-short-bio`}
                className="text-sm font-medium text-foreground"
              >
                Short bio
              </label>
              <div className="space-y-1">
                <div className="relative">
                  <Textarea
                    id={`${fieldIdPrefix}-short-bio`}
                    isInvalid={shortBioLimitState.overLimit}
                    className="h-[160px] resize-none pb-10"
                    value={form.shortBio}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        shortBio: event.target.value,
                      }))
                    }
                    placeholder="Outline your mission, outcomes, and the type of client transformation you specialize in."
                  />
                  <div className="pointer-events-none absolute bottom-3 right-3">
                    <span
                      className={cn(
                        "inline-flex min-w-[4.4rem] justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                        shortBioLimitState.overLimit
                          ? "border-danger/40 bg-danger/10 text-danger"
                          : "border-border/80 bg-background/85 text-muted-foreground",
                      )}
                      title={`Max ${shortBioLimitState.limit} chars`}
                      aria-label={`Character count ${shortBioLimitState.count} out of ${shortBioLimitState.limit}`}
                    >
                      {shortBioLimitState.count}/{shortBioLimitState.limit}
                    </span>
                  </div>
                </div>
                {shortBioLimitState.errorText ? (
                  <p role="alert" className="text-xs text-danger">
                    {shortBioLimitState.errorText}
                  </p>
                ) : null}
              </div>
            </div>
          </PtHubSectionCard>
        </TabsContent>

        <TabsContent value="proof" className="space-y-5">
          <PtHubSectionCard
            title="Positioning and proof"
            description="Clarify who you coach, what outcomes you drive, and why clients should trust the process."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <ChipInput
                  id={`${fieldIdPrefix}-specialties`}
                  label="Specialties"
                  placeholder="Strength, fat loss, executive performance"
                  values={form.specialties}
                  value={specialtiesInput}
                  isInvalid={specialtiesLimitState.overLimit}
                  onValueChange={setSpecialtiesInput}
                  onValuesChange={(nextValues) =>
                    setForm((prev) => ({ ...prev, specialties: nextValues }))
                  }
                />
                <FieldCharacterMeta
                  count={specialtiesLimitState.count}
                  limit={specialtiesLimitState.limit}
                  errorText={specialtiesLimitState.errorText}
                />
              </div>

              <div className="space-y-2">
                <ChipInput
                  id={`${fieldIdPrefix}-certifications`}
                  label="Certifications"
                  placeholder="NASM CPT, Precision Nutrition, EXOS"
                  values={form.certifications}
                  value={certificationsInput}
                  isInvalid={certificationsLimitState.overLimit}
                  onValueChange={setCertificationsInput}
                  onValuesChange={(nextValues) =>
                    setForm((prev) => ({ ...prev, certifications: nextValues }))
                  }
                />
                <FieldCharacterMeta
                  count={certificationsLimitState.count}
                  limit={certificationsLimitState.limit}
                  errorText={certificationsLimitState.errorText}
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`${fieldIdPrefix}-coaching-style`}
                  className="text-sm font-medium text-foreground"
                >
                  Coaching style
                </label>
                <InfoHint label="Coaching style guidance">
                  Describe how you coach, communicate, and keep clients
                  accountable from week one to peak adherence.
                </InfoHint>
              </div>
            </div>
            <Textarea
              id={`${fieldIdPrefix}-coaching-style`}
              isInvalid={coachingStyleLimitState.overLimit}
              className="min-h-[180px]"
              value={form.coachingStyle}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  coachingStyle: event.target.value,
                }))
              }
              placeholder="Structured, high-touch, feedback-driven, and deeply habit-focused."
            />
            <FieldCharacterMeta
              count={coachingStyleLimitState.count}
              limit={coachingStyleLimitState.limit}
              errorText={coachingStyleLimitState.errorText}
            />

            <div className="space-y-4 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-foreground">
                      Transformation proof
                    </label>
                    <InfoHint label="Transformation proof guidance">
                      Add before-and-after stories with real media so the public
                      profile has visual proof.
                    </InfoHint>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      transformations: [
                        ...prev.transformations,
                        createTransformationDraft(),
                      ],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add transformation
                </Button>
              </div>

              {form.transformations.length > 0 ? (
                <div className="space-y-4">
                  {form.transformations.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-[22px] border border-border/60 bg-background/35 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          Transformation {index + 1}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          className="gap-2"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              transformations: prev.transformations.filter(
                                (entry) => entry.id !== item.id,
                              ),
                            }))
                          }
                        >
                          <X className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">
                            Title
                          </label>
                          <Input
                            isInvalid={
                              transformationTitleStates[index]?.overLimit
                            }
                            value={item.title}
                            onChange={(event) =>
                              updateTransformation(item.id, {
                                title: event.target.value,
                              })
                            }
                            placeholder="12-week strength and body recomposition"
                          />
                          <FieldCharacterMeta
                            count={transformationTitleStates[index]?.count ?? 0}
                            limit={
                              transformationTitleStates[index]?.limit ?? 100
                            }
                            errorText={
                              transformationTitleStates[index]?.errorText
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">
                            Summary
                          </label>
                          <Input
                            isInvalid={
                              transformationSummaryStates[index]?.overLimit
                            }
                            value={item.summary}
                            onChange={(event) =>
                              updateTransformation(item.id, {
                                summary: event.target.value,
                              })
                            }
                            placeholder="Lost 8kg while building visible strength and consistency."
                          />
                          <FieldCharacterMeta
                            count={
                              transformationSummaryStates[index]?.count ?? 0
                            }
                            limit={
                              transformationSummaryStates[index]?.limit ?? 255
                            }
                            errorText={
                              transformationSummaryStates[index]?.errorText
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="space-y-3 rounded-[20px] border border-border/60 bg-background/55 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Before photo
                          </p>
                          <div className="flex h-40 items-center justify-center overflow-hidden rounded-[18px] border border-border/60 bg-background/70">
                            {item.beforeImageUrl ? (
                              <img
                                src={item.beforeImageUrl}
                                alt={item.title || "Before transformation"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <ImageIcon className="h-4 w-4" />
                                Before preview
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <UploadButton
                              label="Upload before"
                              uploading={
                                uploadingTarget === `${item.id}-before`
                              }
                              disabled={
                                mediaBusy &&
                                uploadingTarget !== `${item.id}-before`
                              }
                              onFileSelected={async (file) =>
                                handleMediaUpload({
                                  file,
                                  kind: "transformation-before",
                                  targetKey: `${item.id}-before`,
                                  transformationId: item.id,
                                })
                              }
                            />
                            {item.beforeImageUrl ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="gap-2"
                                onClick={() =>
                                  updateTransformation(item.id, {
                                    beforeImageUrl: null,
                                  })
                                }
                              >
                                <X className="h-4 w-4" />
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <div className="space-y-3 rounded-[20px] border border-border/60 bg-background/55 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            After photo
                          </p>
                          <div className="flex h-40 items-center justify-center overflow-hidden rounded-[18px] border border-border/60 bg-background/70">
                            {item.afterImageUrl ? (
                              <img
                                src={item.afterImageUrl}
                                alt={item.title || "After transformation"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <ImageIcon className="h-4 w-4" />
                                After preview
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <UploadButton
                              label="Upload after"
                              uploading={uploadingTarget === `${item.id}-after`}
                              disabled={
                                mediaBusy &&
                                uploadingTarget !== `${item.id}-after`
                              }
                              onFileSelected={async (file) =>
                                handleMediaUpload({
                                  file,
                                  kind: "transformation-after",
                                  targetKey: `${item.id}-after`,
                                  transformationId: item.id,
                                })
                              }
                            />
                            {item.afterImageUrl ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="gap-2"
                                onClick={() =>
                                  updateTransformation(item.id, {
                                    afterImageUrl: null,
                                  })
                                }
                              >
                                <X className="h-4 w-4" />
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[20px] border border-dashed border-border/60 bg-background/30 px-4 py-5 text-sm text-muted-foreground">
                  Add transformation stories here to showcase before-and-after
                  proof on your public coach page.
                </div>
              )}
            </div>
          </PtHubSectionCard>
        </TabsContent>

        <TabsContent value="offer" className="space-y-5">
          <PtHubSectionCard
            title="Package management"
            description="Package editing lives in the dedicated PT Hub Packages surface, so this profile stays focused on storefront positioning."
          >
            <div className="rounded-[20px] border border-border/60 bg-background/35 p-4">
              <p className="text-sm text-muted-foreground">
                Use PT Hub Packages to create, publish or hide, archive, and
                reorder packages. This keeps one canonical package-management
                surface.
              </p>
              <div className="mt-3">
                <Button asChild variant="secondary" size="sm">
                  <Link to="/pt-hub/packages">Open Packages</Link>
                </Button>
              </div>
            </div>
          </PtHubSectionCard>
        </TabsContent>

        <TabsContent value="visibility" className="space-y-5">
          <PtHubSectionCard
            title="Public route"
            description="This slug powers the public profile URL and future shareable coach landing page."
          >
            <div className="max-w-xl space-y-2">
              <label
                htmlFor={`${fieldIdPrefix}-slug`}
                className="text-sm font-medium text-foreground"
              >
                Public slug
              </label>
              <Input
                id={`${fieldIdPrefix}-slug`}
                isInvalid={slugLimitState.overLimit || Boolean(slugErrorText)}
                value={form.slug}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    slug: event.target.value,
                  }))
                }
                placeholder="your-name-coach"
              />
              <p className="text-sm leading-6 text-muted-foreground">
                Use lowercase letters, numbers, and single hyphens. Keep it
                short, readable, and close to your public coach name.
              </p>
              {slugErrorText ? (
                <p className="text-sm font-medium text-destructive">
                  {slugErrorText}
                </p>
              ) : slugAvailability?.available ? (
                <p className="text-sm font-medium text-success">
                  This public slug is available.
                </p>
              ) : slugAvailabilityQuery.isFetching ? (
                <p className="text-sm text-muted-foreground">
                  Checking slug availability...
                </p>
              ) : null}
              {slugChangedAfterPublish ? (
                <p className="text-sm font-medium text-warning">
                  Changing your public URL may break links you already shared.
                </p>
              ) : null}
              <FieldCharacterMeta
                count={slugLimitState.count}
                limit={slugLimitState.limit}
                errorText={slugLimitState.errorText ?? undefined}
              />
            </div>
            <div className="rounded-[20px] bg-background/45 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Public URL preview
              </p>
              <p className="mt-2 break-all text-sm text-foreground">
                {publicUrl ?? "Add a slug to generate your public URL."}
              </p>
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Discoverability"
            description="Prepare the profile for filtering, search, and coach discovery."
          >
            <div className="pt-hub-work-grid">
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

              <div className="app-form-grid">
                <div className="app-form-col-12 space-y-2">
                  <ChipInput
                    id={`${fieldIdPrefix}-location`}
                    label="Location"
                    placeholder="Riyadh, Dubai, London"
                    values={locationValues}
                    value={locationInput}
                    isInvalid={locationLimitState.overLimit}
                    onValueChange={setLocationInput}
                    onValuesChange={(nextValues) =>
                      setForm((prev) => ({
                        ...prev,
                        locationLabel: listToInput(nextValues),
                      }))
                    }
                  />
                  <FieldCharacterMeta
                    count={locationLimitState.count}
                    limit={locationLimitState.limit}
                    errorText={locationLimitState.errorText}
                  />
                </div>
              </div>
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Social links"
            description="Keep destination links clean and intentional. The future public page will reuse them directly."
          >
            <div className="space-y-4">
              {form.socialLinks.map((link, index) => (
                <div
                  key={link.platform}
                  className="app-form-grid rounded-[18px] bg-background/35 px-4 py-3"
                >
                  <div className="app-form-col-3">
                    <label
                      htmlFor={`${fieldIdPrefix}-social-${link.platform}`}
                      className="text-sm font-medium text-foreground"
                    >
                      {link.label}
                    </label>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Leave blank to keep it hidden later.
                    </p>
                  </div>
                  <Input
                    id={`${fieldIdPrefix}-social-${link.platform}`}
                    className="app-form-col-9"
                    isInvalid={socialLinkStates[index]?.overLimit}
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
                  <FieldCharacterMeta
                    className="app-form-col-9 md:col-start-4"
                    count={socialLinkStates[index]?.count ?? 0}
                    limit={socialLinkStates[index]?.limit ?? 255}
                    errorText={socialLinkStates[index]?.errorText}
                  />
                </div>
              ))}
            </div>
          </PtHubSectionCard>
        </TabsContent>

        <TabsContent value="preview" className="space-y-5">
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-background/70">
            <PtHubProfilePreview
              profile={previewData}
              packageOptions={packageOptions}
              statusBadges={[
                {
                  label: publicationState.isPublished
                    ? "Published"
                    : "Unpublished",
                  tone: publicationState.isPublished ? "success" : "warning",
                },
                {
                  label: `${readiness.completionPercent}% ready`,
                  tone: "info",
                },
              ]}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="xl:sticky xl:top-28 xl:col-start-2 xl:row-start-1 xl:self-start">
        <PtHubProfileLaunchPanel
          form={form}
          displayNameValue={displayNameValue}
          readiness={readiness}
          publicationState={publicationState}
          saving={saving}
          publishing={publishing}
          mediaBusy={mediaBusy}
          hasChanges={hasChanges}
          hasOverLimitErrors={hasOverLimitErrors}
          onSave={onSave}
          onTogglePublish={onTogglePublish}
        />
      </div>
    </div>
  );
}
