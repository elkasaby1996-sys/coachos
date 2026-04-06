import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth";
import {
  matchesClientSegment,
  normalizeClientLifecycleState,
  type ClientSegmentKey,
} from "../../../lib/client-lifecycle";
import { formatRelativeTime } from "../../../lib/relative-time";
import { supabase } from "../../../lib/supabase";
import { useWorkspace } from "../../../lib/use-workspace";
import type {
  PTAvailabilityMode,
  PTAccountSettingsDraft,
  PTAnalyticsSnapshot,
  PTAnalyticsWorkspaceBreakdown,
  PTClientSummary,
  PTCoachingMode,
  PTLead,
  PTLeadNote,
  PTLeadStatus,
  PTInvoiceSummary,
  PTOverviewStats,
  PTPublicLeadInput,
  PTPublicProfile,
  PTPublicTestimonial,
  PTPublicTransformation,
  PTPublicationState,
  PTProfile,
  PTProfileReadiness,
  PTProfileReadinessItem,
  PTProfilePreviewData,
  PTRevenueSnapshot,
  PTSubscriptionSummary,
  PTSocialLink,
  PTWorkspaceSummary,
} from "../types";

const COACHING_MODE_VALUES = [
  "one_on_one",
  "programming",
  "nutrition",
  "accountability",
] as const satisfies readonly PTCoachingMode[];

const AVAILABILITY_MODE_VALUES = [
  "online",
  "in_person",
] as const satisfies readonly PTAvailabilityMode[];

const DEFAULT_SOCIAL_LINKS: PTSocialLink[] = [
  { platform: "website", label: "Website", url: "" },
  { platform: "instagram", label: "Instagram", url: "" },
  { platform: "linkedin", label: "LinkedIn", url: "" },
  { platform: "youtube", label: "YouTube", url: "" },
];

const DEFAULT_PROFILE_FIELDS = {
  fullName: "",
  displayName: "",
  slug: "",
  headline: "",
  searchableHeadline: "",
  shortBio: "",
  specialties: [] as string[],
  certifications: [] as string[],
  coachingStyle: "",
  coachingModes: [] as PTCoachingMode[],
  availabilityModes: ["online"] as PTAvailabilityMode[],
  locationLabel: "",
  marketplaceVisible: false,
  isPublished: false,
  publishedAt: null as string | null,
  profilePhotoUrl: null as string | null,
  bannerImageUrl: null as string | null,
  socialLinks: DEFAULT_SOCIAL_LINKS,
  testimonials: [] as PTPublicTestimonial[],
  transformations: [] as PTPublicTransformation[],
};

const DEFAULT_SETTINGS: PTAccountSettingsDraft = {
  contactEmail: "",
  supportEmail: "",
  phone: "",
  timezone:
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC",
  city: "",
  clientAlerts: true,
  weeklyDigest: true,
  productUpdates: false,
  profileVisibility: "draft",
  subscriptionPlan: "Repsync Pro",
  subscriptionStatus: "Billing placeholder",
};

type PtHubProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  slug: string | null;
  headline: string | null;
  searchable_headline: string | null;
  short_bio: string | null;
  specialties: string[] | null;
  certifications: string[] | null;
  coaching_style: string | null;
  coaching_modes: string[] | null;
  availability_modes: string[] | null;
  location_label: string | null;
  marketplace_visible: boolean | null;
  is_published: boolean | null;
  published_at: string | null;
  profile_photo_url: string | null;
  banner_image_url: string | null;
  social_links: unknown;
  testimonials: unknown;
  transformations: unknown;
  updated_at: string | null;
  created_at: string | null;
};

type LegacyPtProfileRow = {
  display_name: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type PtHubSettingsRow = {
  id: string;
  user_id: string;
  contact_email: string | null;
  support_email: string | null;
  phone: string | null;
  timezone: string | null;
  city: string | null;
  client_alerts: boolean;
  weekly_digest: boolean;
  product_updates: boolean;
  profile_visibility: "draft" | "private" | "listed";
  subscription_plan: string | null;
  subscription_status: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type WorkspaceMemberRow = {
  workspace_id: string | null;
  role: string | null;
  created_at: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string | null;
  owner_user_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type ClientRow = {
  id: string;
  workspace_id: string | null;
  status: string | null;
  display_name: string | null;
  goal: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PtClientsSummaryRow = {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  status: string | null;
  lifecycle_state: string | null;
  lifecycle_changed_at: string | null;
  paused_reason: string | null;
  churn_reason: string | null;
  display_name: string | null;
  goal: string | null;
  tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  onboarding_status: string | null;
  onboarding_incomplete: boolean | null;
  last_session_at: string | null;
  last_checkin_at: string | null;
  last_message_at: string | null;
  last_client_reply_at: string | null;
  last_activity_at: string | null;
  overdue_checkins_count: number | null;
  has_overdue_checkin: boolean | null;
  risk_flags: string[] | null;
};

type PtHubLeadRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  goal_summary: string;
  training_experience: string | null;
  budget_interest: string | null;
  package_interest: string | null;
  status: PTLeadStatus;
  submitted_at: string;
  source: string | null;
  source_slug: string | null;
  converted_at: string | null;
  converted_workspace_id: string | null;
  converted_client_id: string | null;
  created_at: string;
  updated_at: string | null;
};

type PtHubLeadNoteRow = {
  id: string;
  lead_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

function isPresent(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function getDateDaysAgo(daysAgo: number) {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  return value;
}

function normalizeTextList(values?: string[] | null) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeEnumList<TValue extends string>(
  values: unknown,
  allowed: readonly TValue[],
) {
  const source = Array.isArray(values) ? values : [];
  return source.filter(
    (value): value is TValue =>
      typeof value === "string" && allowed.includes(value as TValue),
  );
}

function normalizeSocialLinks(raw?: unknown) {
  const source = Array.isArray(raw) ? raw : [];
  return DEFAULT_SOCIAL_LINKS.map((link) => {
    const match = source.find((item) => {
      if (!item || typeof item !== "object") return false;
      return (item as { platform?: unknown }).platform === link.platform;
    }) as { url?: unknown } | undefined;

    return {
      platform: link.platform,
      label: link.label,
      url: typeof match?.url === "string" ? match.url.trim() : "",
    };
  });
}

function createTransformationId(seed: string, index: number) {
  const normalizedSeed = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalizedSeed ? `${normalizedSeed}-${index + 1}` : `transformation-${index + 1}`;
}

function normalizeTestimonials(raw?: unknown) {
  const source = Array.isArray(raw) ? raw : [];
  return source
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const testimonial = item as Record<string, unknown>;
      return {
        quote:
          typeof testimonial.quote === "string" ? testimonial.quote.trim() : "",
        author:
          typeof testimonial.author === "string"
            ? testimonial.author.trim()
            : "",
        role:
          typeof testimonial.role === "string" ? testimonial.role.trim() : null,
      } satisfies PTPublicTestimonial;
    })
    .filter((item) => item.quote && item.author);
}

function normalizeTransformations(raw?: unknown) {
  const source = Array.isArray(raw) ? raw : [];
  return source
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const transformation = item as Record<string, unknown>;
      const title =
        typeof transformation.title === "string"
          ? transformation.title.trim()
          : "";
      const summary =
        typeof transformation.summary === "string"
          ? transformation.summary.trim()
          : "";
      const beforeImageUrl =
        typeof transformation.beforeImageUrl === "string"
          ? transformation.beforeImageUrl.trim() || null
          : null;
      const afterImageUrl =
        typeof transformation.afterImageUrl === "string"
          ? transformation.afterImageUrl.trim() || null
          : null;

      return {
        id:
          typeof transformation.id === "string" && transformation.id.trim()
            ? transformation.id.trim()
            : createTransformationId(title || summary, index),
        title,
        summary,
        beforeImageUrl,
        afterImageUrl,
      } satisfies PTPublicTransformation;
    })
    .filter(
      (item) =>
        item.title ||
        item.summary ||
        item.beforeImageUrl ||
        item.afterImageUrl,
    );
}

export function slugifyValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getPublicCoachUrl(slug: string | null | undefined) {
  if (!slug) return null;
  if (typeof window === "undefined") return `/coach/${slug}`;
  return `${window.location.origin}/coach/${slug}`;
}

function computeProfileCompletion(profile: StoredProfileDraft) {
  const checks = [
    Boolean(profile.profilePhotoUrl?.trim()),
    Boolean(profile.bannerImageUrl?.trim()),
    Boolean(profile.fullName.trim()),
    Boolean(profile.displayName.trim()),
    Boolean(profile.headline.trim()),
    Boolean(profile.shortBio.trim()),
    profile.specialties.length > 0,
    profile.certifications.length > 0,
    Boolean(profile.coachingStyle.trim()),
    profile.socialLinks.some((link) => Boolean(link.url.trim())),
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

function isLeadInDateWindow(submittedAt: string, startDate: Date) {
  const parsed = new Date(submittedAt);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed >= startDate;
}

function isClientActive(status: string | null) {
  if (!status) return true;
  const normalized = status.trim().toLowerCase();
  return !["archived", "inactive", "paused"].includes(normalized);
}

function isLifecycleCoached(lifecycleState: string | null | undefined) {
  const lifecycle = normalizeClientLifecycleState(lifecycleState);
  return ["active", "at_risk"].includes(lifecycle);
}

function mapPtClientSummary(
  row: PtClientsSummaryRow,
  workspaceName: string,
): PTClientSummary {
  const recentActivityAt =
    row.last_activity_at ??
    row.updated_at ??
    row.created_at ??
    row.last_message_at ??
    row.last_checkin_at;

  return {
    id: row.id,
    workspaceId: row.workspace_id ?? "",
    workspaceName,
    displayName: row.display_name?.trim() || "Client",
    status: row.status?.trim() || "active",
    lifecycleState: row.lifecycle_state?.trim() || "active",
    lifecycleChangedAt: row.lifecycle_changed_at,
    pausedReason: row.paused_reason ?? null,
    churnReason: row.churn_reason ?? null,
    goal: row.goal,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    onboardingStatus: row.onboarding_status ?? null,
    onboardingIncomplete: Boolean(row.onboarding_incomplete),
    lastActivityAt: row.last_activity_at ?? null,
    lastClientReplyAt: row.last_client_reply_at ?? null,
    hasOverdueCheckin: Boolean(row.has_overdue_checkin),
    overdueCheckinsCount: row.overdue_checkins_count ?? 0,
    riskFlags: row.risk_flags ?? [],
    recentActivityLabel: recentActivityAt
      ? formatRelativeTime(recentActivityAt)
      : "No recent activity",
  };
}

function getWorkspaceStatus(
  workspaceId: string,
  activeWorkspaceId: string | null,
  clientCount: number | null,
): PTWorkspaceSummary["status"] {
  if (workspaceId === activeWorkspaceId) return "current";
  if ((clientCount ?? 0) > 0) return "active";
  return "new";
}

export function usePtHubWorkspaces() {
  const { user } = useAuth();
  const { workspaceId: activeWorkspaceId } = useWorkspace();

  return useQuery({
    queryKey: ["pt-hub-workspaces", user?.id, activeWorkspaceId],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return [] as PTWorkspaceSummary[];

      const [{ data: memberData, error: memberError }, { data, error }] =
        await Promise.all([
          supabase
            .from("workspace_members")
            .select("workspace_id, role, created_at")
            .eq("user_id", userId)
            .returns<WorkspaceMemberRow[]>(),
          supabase
            .from("workspaces")
            .select("id, name, owner_user_id, updated_at, created_at")
            .eq("owner_user_id", userId)
            .order("updated_at", { ascending: false })
            .returns<WorkspaceRow[]>(),
        ]);

      if (memberError) throw memberError;
      if (error) throw error;

      const workspaceRows = data ?? [];
      const memberMap = new Map(
        (memberData ?? [])
          .filter((row) => Boolean(row.workspace_id))
          .map((row) => [row.workspace_id as string, row]),
      );
      const workspaceIds = workspaceRows.map((row) => row.id);

      let clientCountMap = new Map<string, number>();
      if (workspaceIds.length > 0) {
        const { data: clients, error: clientsError } = await supabase
          .from("clients")
          .select(
            "id, workspace_id, status, display_name, goal, created_at, updated_at",
          )
          .in("workspace_id", workspaceIds)
          .returns<ClientRow[]>();

        if (clientsError) throw clientsError;

        clientCountMap = (clients ?? []).reduce((map, client) => {
          if (!client.workspace_id || !isClientActive(client.status))
            return map;
          map.set(client.workspace_id, (map.get(client.workspace_id) ?? 0) + 1);
          return map;
        }, new Map<string, number>());
      }

      return workspaceRows.map((workspace) => {
        const clientCount = clientCountMap.get(workspace.id) ?? 0;
        return {
          id: workspace.id,
          name: workspace.name?.trim() || "Untitled workspace",
          status: getWorkspaceStatus(
            workspace.id,
            activeWorkspaceId,
            clientCount,
          ),
          clientCount,
          lastUpdated: workspace.updated_at ?? workspace.created_at ?? null,
          ownerUserId: workspace.owner_user_id,
          role: memberMap.get(workspace.id)?.role ?? null,
          createdAt: workspace.created_at ?? null,
        } satisfies PTWorkspaceSummary;
      });
    },
  });
}

function mapLeadNote(row: PtHubLeadNoteRow): PTLeadNote {
  return {
    id: row.id,
    leadId: row.lead_id,
    authorUserId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapLead(row: PtHubLeadRow, notes: PTLeadNote[]): PTLead {
  const source = row.source?.trim() || "manual";
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    goalSummary: row.goal_summary,
    trainingExperience: row.training_experience,
    budgetInterest: row.budget_interest,
    packageInterest: row.package_interest,
    status: row.status,
    submittedAt: row.submitted_at,
    notesPreview: notes[0]?.body ?? null,
    notes,
    source,
    sourceLabel:
      source === "public_profile"
        ? "Public profile"
        : source === "marketplace"
          ? "Marketplace"
          : "Manual",
    sourceSlug: row.source_slug,
    convertedAt: row.converted_at,
    convertedWorkspaceId: row.converted_workspace_id,
    convertedClientId: row.converted_client_id,
  };
}

export function usePtHubProfile() {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();

  return useQuery({
    queryKey: ["pt-hub-profile", user?.id, workspaceId],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return null as PTProfile | null;

      const [
        { data: hubProfile, error: hubProfileError },
        { data: legacyRows, error: legacyError },
      ] = await Promise.all([
        supabase
          .from("pt_hub_profiles")
          .select(
            "id, user_id, full_name, display_name, slug, headline, searchable_headline, short_bio, specialties, certifications, coaching_style, coaching_modes, availability_modes, location_label, marketplace_visible, is_published, published_at, profile_photo_url, banner_image_url, social_links, testimonials, transformations, updated_at, created_at",
          )
          .eq("user_id", userId)
          .maybeSingle<PtHubProfileRow>(),
        supabase
          .from("pt_profiles")
          .select("display_name, updated_at, created_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .returns<LegacyPtProfileRow[]>(),
      ]);

      if (hubProfileError) throw hubProfileError;
      if (legacyError) throw legacyError;

      const legacyProfile = legacyRows?.[0] ?? null;
      const fullName =
        hubProfile?.full_name?.trim() ||
        user.user_metadata?.full_name?.trim() ||
        hubProfile?.display_name?.trim() ||
        legacyProfile?.display_name?.trim() ||
        "";
      const displayName =
        hubProfile?.display_name?.trim() ||
        legacyProfile?.display_name?.trim() ||
        user.user_metadata?.full_name?.trim() ||
        "";

      const profileDraft: StoredProfileDraft = {
        fullName,
        displayName,
        slug:
          hubProfile?.slug?.trim() ||
          slugifyValue(displayName || fullName || ""),
        headline: hubProfile?.headline?.trim() || "",
        searchableHeadline:
          hubProfile?.searchable_headline?.trim() ||
          hubProfile?.headline?.trim() ||
          "",
        shortBio: hubProfile?.short_bio?.trim() || "",
        specialties: normalizeTextList(hubProfile?.specialties),
        certifications: normalizeTextList(hubProfile?.certifications),
        coachingStyle: hubProfile?.coaching_style?.trim() || "",
        coachingModes: normalizeEnumList(
          hubProfile?.coaching_modes,
          COACHING_MODE_VALUES,
        ),
        availabilityModes: normalizeEnumList(
          hubProfile?.availability_modes,
          AVAILABILITY_MODE_VALUES,
        ),
        locationLabel: hubProfile?.location_label?.trim() || "",
        marketplaceVisible: hubProfile?.marketplace_visible ?? false,
        isPublished: hubProfile?.is_published ?? false,
        publishedAt: hubProfile?.published_at ?? null,
        profilePhotoUrl: hubProfile?.profile_photo_url ?? null,
        bannerImageUrl: hubProfile?.banner_image_url ?? null,
        socialLinks: normalizeSocialLinks(hubProfile?.social_links),
        testimonials: normalizeTestimonials(hubProfile?.testimonials),
        transformations: normalizeTransformations(hubProfile?.transformations),
      };

      const availabilityModes =
        profileDraft.availabilityModes.length > 0
          ? profileDraft.availabilityModes
          : DEFAULT_PROFILE_FIELDS.availabilityModes;

      return {
        id: hubProfile?.id ?? null,
        workspaceId: workspaceId ?? null,
        ...profileDraft,
        availabilityModes,
        publicUrl: getPublicCoachUrl(profileDraft.slug),
        completionPercent: computeProfileCompletion(profileDraft),
        updatedAt:
          hubProfile?.updated_at ??
          legacyProfile?.updated_at ??
          legacyProfile?.created_at ??
          null,
      } satisfies PTProfile;
    },
  });
}

export function usePtHubSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["pt-hub-settings", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return null;

      const { data, error } = await supabase
        .from("pt_hub_settings")
        .select(
          "id, user_id, contact_email, support_email, phone, timezone, city, client_alerts, weekly_digest, product_updates, profile_visibility, subscription_plan, subscription_status, updated_at, created_at",
        )
        .eq("user_id", userId)
        .maybeSingle<PtHubSettingsRow>();

      if (error) throw error;

      return {
        ...DEFAULT_SETTINGS,
        contactEmail: data?.contact_email ?? user?.email ?? "",
        supportEmail: data?.support_email ?? user?.email ?? "",
        phone: data?.phone ?? "",
        timezone: data?.timezone ?? DEFAULT_SETTINGS.timezone,
        city: data?.city ?? "",
        clientAlerts: data?.client_alerts ?? true,
        weeklyDigest: data?.weekly_digest ?? true,
        productUpdates: data?.product_updates ?? false,
        profileVisibility: data?.profile_visibility ?? "draft",
        subscriptionPlan:
          data?.subscription_plan ?? DEFAULT_SETTINGS.subscriptionPlan,
        subscriptionStatus:
          data?.subscription_status ?? DEFAULT_SETTINGS.subscriptionStatus,
      } satisfies PTAccountSettingsDraft;
    },
  });
}

export function usePtHubOverview() {
  const workspacesQuery = usePtHubWorkspaces();
  const profileQuery = usePtHubProfile();
  const settingsQuery = usePtHubSettings();
  const leadsQuery = usePtHubLeads();
  const clientsQuery = usePtHubClients();
  const readinessQuery = usePtHubProfileReadiness();

  return useQuery({
    queryKey: [
      "pt-hub-overview",
      workspacesQuery.data,
      profileQuery.data?.completionPercent,
      profileQuery.data?.updatedAt,
      settingsQuery.data?.subscriptionStatus,
      leadsQuery.data,
      clientsQuery.data,
      readinessQuery.data?.completionPercent,
    ],
    enabled:
      workspacesQuery.isSuccess &&
      profileQuery.isSuccess &&
      settingsQuery.isSuccess &&
      leadsQuery.isSuccess &&
      clientsQuery.isSuccess &&
      readinessQuery.isSuccess,
    queryFn: async () => {
      const workspaces = workspacesQuery.data ?? [];
      const latestWorkspace = workspaces[0] ?? null;
      const leads = leadsQuery.data ?? [];
      const clients = clientsQuery.data ?? [];
      const startOfWeek = getDateDaysAgo(7);
      const startOfMonth = getDateDaysAgo(30);
      const previousMonthStart = getDateDaysAgo(60);
      const monthlyLeads = leads.filter((lead) =>
        isLeadInDateWindow(lead.submittedAt, startOfMonth),
      );
      const applicationsPreviousWindow = leads.filter((lead) => {
        const parsed = new Date(lead.submittedAt);
        if (Number.isNaN(parsed.getTime())) return false;
        return parsed >= previousMonthStart && parsed < startOfMonth;
      }).length;

      return {
        activeWorkspaces: workspaces.length,
        activeClients: clients.filter((client) =>
          isLifecycleCoached(client.lifecycleState),
        ).length,
        profileCompletionPercent:
          readinessQuery.data?.completionPercent ??
          profileQuery.data?.completionPercent ??
          0,
        subscriptionStatus:
          settingsQuery.data?.subscriptionStatus ??
          DEFAULT_SETTINGS.subscriptionStatus,
        latestWorkspaceId: latestWorkspace?.id ?? null,
        latestWorkspaceName: latestWorkspace?.name ?? null,
        lastProfileUpdate: profileQuery.data?.updatedAt ?? null,
        applicationsThisWeek: leads.filter((lead) =>
          isLeadInDateWindow(lead.submittedAt, startOfWeek),
        ).length,
        applicationsThisMonth: monthlyLeads.length,
        applicationsPreviousWindow,
        readyForPublish: readinessQuery.data?.readyForPublish ?? false,
        missingSetupItems: readinessQuery.data?.missingItems ?? [],
        businessHealthLabel:
          readinessQuery.data?.readyForPublish && monthlyLeads.length > 0
            ? "Healthy momentum"
            : readinessQuery.data?.completionPercent &&
                readinessQuery.data.completionPercent >= 70
              ? "Near publish-ready"
              : "Setup in progress",
      } satisfies PTOverviewStats;
    },
  });
}

export function getPtProfileReadiness(params: {
  profile: PTProfile | null | undefined;
  settings: PTAccountSettingsDraft | null | undefined;
}): PTProfileReadiness {
  const profile = params.profile;
  const settings = params.settings;

  const checklist: PTProfileReadinessItem[] = [
    {
      key: "profile_photo",
      label: "Profile photo",
      complete: Boolean(profile?.profilePhotoUrl),
      href: "/pt-hub/profile",
      guidance: "Add a clear profile image for trust and recognition.",
    },
    {
      key: "banner",
      label: "Banner image",
      complete: Boolean(profile?.bannerImageUrl),
      href: "/pt-hub/profile",
      guidance:
        "Set a banner so the future public profile has a strong hero section.",
    },
    {
      key: "display_name",
      label: "Display name",
      complete: isPresent(profile?.displayName),
      href: "/pt-hub/profile",
      guidance: "Use the trainer or brand name clients should remember.",
    },
    {
      key: "headline",
      label: "Headline",
      complete: isPresent(profile?.headline),
      href: "/pt-hub/profile",
      guidance: "Summarize who you help and the outcome you create.",
    },
    {
      key: "bio",
      label: "Bio",
      complete: isPresent(profile?.shortBio),
      href: "/pt-hub/profile",
      guidance: "Add your coaching story, positioning, and method.",
    },
    {
      key: "specialties",
      label: "Specialties",
      complete: (profile?.specialties.length ?? 0) > 0,
      href: "/pt-hub/profile",
      guidance: "List focus areas so prospects understand your lane.",
    },
    {
      key: "certifications",
      label: "Certifications",
      complete: (profile?.certifications.length ?? 0) > 0,
      href: "/pt-hub/profile",
      guidance: "Show at least one credential to strengthen credibility.",
    },
    {
      key: "coaching_style",
      label: "Coaching style",
      complete: isPresent(profile?.coachingStyle),
      href: "/pt-hub/profile",
      guidance:
        "Explain how you coach, communicate, and keep clients accountable.",
    },
    {
      key: "social_links",
      label: "Social links",
      complete:
        (profile?.socialLinks.filter((link) => isPresent(link.url)).length ??
          0) > 0,
      href: "/pt-hub/profile",
      guidance:
        "Add at least one destination where prospects can validate your brand.",
    },
    {
      key: "cta_ready",
      label: "CTA-ready contact path",
      complete:
        isPresent(settings?.contactEmail) || isPresent(settings?.supportEmail),
      href: "/pt-hub/settings",
      guidance:
        "Add a contact or support email so future inquiry CTAs have a real destination.",
    },
  ];

  const completed = checklist.filter((item) => item.complete).length;
  const completionPercent = Math.round((completed / checklist.length) * 100);
  const missingItems = checklist
    .filter((item) => !item.complete)
    .map((item) => item.label);

  return {
    completionPercent,
    readyForPublish: missingItems.length === 0,
    statusLabel: missingItems.length === 0 ? "Ready for publish" : "Not ready",
    missingItems,
    checklist,
  };
}

export function usePtHubProfileReadiness() {
  const profileQuery = usePtHubProfile();
  const settingsQuery = usePtHubSettings();

  return useQuery({
    queryKey: [
      "pt-hub-profile-readiness",
      profileQuery.data,
      settingsQuery.data,
    ],
    enabled: profileQuery.isSuccess && settingsQuery.isSuccess,
    queryFn: async () =>
      getPtProfileReadiness({
        profile: profileQuery.data,
        settings: settingsQuery.data,
      }),
  });
}

export function getPtPublicationState(params: {
  profile: PTProfile | null | undefined;
  settings: PTAccountSettingsDraft | null | undefined;
  readiness: PTProfileReadiness | null | undefined;
}): PTPublicationState {
  const profile = params.profile;
  const settings = params.settings;
  const readiness = params.readiness;
  const blockers = [
    ...(readiness?.missingItems ?? []),
    ...(profile?.slug ? [] : ["Public URL slug"]),
    ...(settings?.profileVisibility === "listed"
      ? []
      : ["Profile visibility must be set to Ready to list"]),
  ];

  return {
    canPublish: blockers.length === 0,
    isPublished: profile?.isPublished ?? false,
    blockers,
    publicUrl: getPublicCoachUrl(profile?.slug),
    marketplaceStatus:
      profile?.isPublished && profile.marketplaceVisible
        ? "Published and discoverable"
        : profile?.isPublished
          ? "Published privately from marketplace"
          : profile?.marketplaceVisible
            ? "Ready for marketplace once published"
            : "Draft only",
  };
}

export function usePtHubPublicationState() {
  const profileQuery = usePtHubProfile();
  const settingsQuery = usePtHubSettings();
  const readinessQuery = usePtHubProfileReadiness();

  return useQuery({
    queryKey: [
      "pt-hub-publication-state",
      profileQuery.data,
      settingsQuery.data,
      readinessQuery.data,
    ],
    enabled:
      profileQuery.isSuccess &&
      settingsQuery.isSuccess &&
      readinessQuery.isSuccess,
    queryFn: async () =>
      getPtPublicationState({
        profile: profileQuery.data,
        settings: settingsQuery.data,
        readiness: readinessQuery.data,
      }),
  });
}

export function usePtHubPayments() {
  const settingsQuery = usePtHubSettings();
  const clientsQuery = usePtHubClients();

  return useQuery({
    queryKey: ["pt-hub-payments", settingsQuery.data, clientsQuery.data],
    enabled: settingsQuery.isSuccess && clientsQuery.isSuccess,
    queryFn: async () => {
      const clients = clientsQuery.data ?? [];
      const activeClients = clients.filter((client) =>
        isLifecycleCoached(client.lifecycleState),
      ).length;

      const subscription: PTSubscriptionSummary = {
        planName:
          settingsQuery.data?.subscriptionPlan ??
          DEFAULT_SETTINGS.subscriptionPlan,
        billingStatus:
          settingsQuery.data?.subscriptionStatus ??
          DEFAULT_SETTINGS.subscriptionStatus,
        renewalDate: null,
        paymentMethodLabel: null,
        packagePricingLabel: null,
        billingConnected: false,
      };

      const invoices: PTInvoiceSummary[] = [
        {
          id: "invoice-placeholder",
          label: "Invoice history will appear here",
          amountLabel: "Not connected",
          status: "Coming soon",
          issuedAt: null,
          downloadUrl: null,
          placeholder: true,
        },
      ];

      const revenue: PTRevenueSnapshot = {
        monthlyRevenueLabel: "Not connected",
        trailingRevenueLabel: "Not connected",
        activePayingClientsLabel: "Not connected",
        packagePricingLabel:
          "Add package pricing once client billing is integrated",
        revenueConnected: false,
        potentialActiveClients: activeClients,
      };

      return { subscription, invoices, revenue };
    },
  });
}

export function usePtHubAnalytics() {
  const leadsQuery = usePtHubLeads();
  const clientsQuery = usePtHubClients();
  const profileQuery = usePtHubProfile();
  const readinessQuery = usePtHubProfileReadiness();

  return useQuery({
    queryKey: [
      "pt-hub-analytics",
      leadsQuery.data,
      clientsQuery.data,
      profileQuery.data,
      readinessQuery.data,
    ],
    enabled:
      profileQuery.isSuccess &&
      leadsQuery.isSuccess &&
      clientsQuery.isSuccess &&
      readinessQuery.isSuccess,
    queryFn: async () => {
      const leads = leadsQuery.data ?? [];
      const clients = clientsQuery.data ?? [];
      const startOfWeek = getDateDaysAgo(7);
      const startOfMonth = getDateDaysAgo(30);
      const previousMonthStart = getDateDaysAgo(60);

      const applicationsThisWeek = leads.filter((lead) =>
        isLeadInDateWindow(lead.submittedAt, startOfWeek),
      ).length;
      const applicationsThisMonth = leads.filter((lead) =>
        isLeadInDateWindow(lead.submittedAt, startOfMonth),
      ).length;
      const applicationsPreviousWindow = leads.filter((lead) => {
        const parsed = new Date(lead.submittedAt);
        if (Number.isNaN(parsed.getTime())) return false;
        return parsed >= previousMonthStart && parsed < startOfMonth;
      }).length;

      const acceptedApplications = leads.filter((lead) =>
        ["accepted"].includes(lead.status),
      ).length;

      const clientsByWorkspace = clients.reduce((map, client) => {
        const existing = map.get(client.workspaceId);
        if (existing) {
          existing.clientCount += 1;
          return map;
        }
        map.set(client.workspaceId, {
          workspaceId: client.workspaceId,
          workspaceName: client.workspaceName,
          clientCount: 1,
        } satisfies PTAnalyticsWorkspaceBreakdown);
        return map;
      }, new Map<string, PTAnalyticsWorkspaceBreakdown>());

      let growthTrendLabel = "No change yet";
      if (applicationsThisMonth > applicationsPreviousWindow) {
        growthTrendLabel = "Lead flow is up vs prior 30 days";
      } else if (applicationsThisMonth < applicationsPreviousWindow) {
        growthTrendLabel = "Lead flow is down vs prior 30 days";
      }

      return {
        profileViewsLabel: "Not live yet",
        profileViewsConnected: false,
        totalApplications: leads.length,
        applicationsThisWeek,
        applicationsThisMonth,
        applicationsPreviousWindow,
        applicationConversionRate:
          leads.length > 0
            ? Math.round((acceptedApplications / leads.length) * 100)
            : 0,
        activeClients: clients.filter((client) =>
          isLifecycleCoached(client.lifecycleState),
        ).length,
        profileCompletionPercent: readinessQuery.data?.completionPercent ?? 0,
        testimonialCountLabel: String(profileQuery.data?.testimonials.length ?? 0),
        transformationsCountLabel: String(
          profileQuery.data?.transformations.length ?? 0,
        ),
        growthTrendLabel,
        clientsByWorkspace: Array.from(clientsByWorkspace.values()).sort(
          (a, b) => b.clientCount - a.clientCount,
        ),
      } satisfies PTAnalyticsSnapshot;
    },
  });
}

export function usePtHubLeads() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["pt-hub-leads", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return [] as PTLead[];

      const [
        { data: leads, error: leadsError },
        { data: notes, error: notesError },
      ] = await Promise.all([
        supabase
          .from("pt_hub_leads")
          .select(
            "id, user_id, full_name, email, phone, goal_summary, training_experience, budget_interest, package_interest, status, submitted_at, source, source_slug, converted_at, converted_workspace_id, converted_client_id, created_at, updated_at",
          )
          .eq("user_id", userId)
          .order("submitted_at", { ascending: false })
          .returns<PtHubLeadRow[]>(),
        supabase
          .from("pt_hub_lead_notes")
          .select("id, lead_id, user_id, body, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .returns<PtHubLeadNoteRow[]>(),
      ]);

      if (leadsError) throw leadsError;
      if (notesError) throw notesError;

      const notesByLead = (notes ?? []).reduce((map, row) => {
        const list = map.get(row.lead_id) ?? [];
        list.push(mapLeadNote(row));
        map.set(row.lead_id, list);
        return map;
      }, new Map<string, PTLeadNote[]>());

      return (leads ?? []).map((lead) =>
        mapLead(lead, notesByLead.get(lead.id) ?? []),
      );
    },
  });
}

export function usePtHubClients() {
  const { user } = useAuth();
  const workspacesQuery = usePtHubWorkspaces();

  return useQuery({
    queryKey: ["pt-hub-clients", user?.id, workspacesQuery.data],
    enabled: Boolean(user?.id) && workspacesQuery.isSuccess,
    queryFn: async () => {
      const workspaces = workspacesQuery.data ?? [];
      if (workspaces.length === 0) return [] as PTClientSummary[];

      const results = await Promise.all(
        workspaces.map(async (workspace) => {
          const { data, error } = await supabase.rpc("pt_clients_summary", {
            p_workspace_id: workspace.id,
            p_limit: 500,
            p_offset: 0,
          });

          if (error) throw error;

          return ((data ?? []) as PtClientsSummaryRow[]).map((row) =>
            mapPtClientSummary(row, workspace.name),
          );
        }),
      );

      return results.flat().sort((a, b) => {
        const aTime = new Date(a.createdAt ?? 0).getTime();
        const bTime = new Date(b.createdAt ?? 0).getTime();
        return bTime - aTime;
      });
    },
  });
}

export function getPtClientBaseStats(clients: PTClientSummary[]) {
  const totalClients = clients.length;
  const activeClients = clients.filter((client) =>
    isLifecycleCoached(client.lifecycleState),
  ).length;
  const pausedClients = clients.filter(
    (client) =>
      normalizeClientLifecycleState(client.lifecycleState) === "paused",
  ).length;
  const atRiskClients = clients.filter((client) =>
    matchesClientSegment(client, "at_risk"),
  ).length;
  const onboardingIncompleteClients = clients.filter((client) =>
    matchesClientSegment(client, "onboarding_incomplete"),
  ).length;
  const overdueCheckinClients = clients.filter((client) =>
    matchesClientSegment(client, "checkin_overdue"),
  ).length;

  const now = Date.now();
  const recentlyOnboardedClients = clients.filter((client) => {
    if (!client.createdAt) return false;
    const createdAt = new Date(client.createdAt).getTime();
    if (Number.isNaN(createdAt)) return false;
    return now - createdAt <= 1000 * 60 * 60 * 24 * 30;
  }).length;

  return {
    totalClients,
    activeClients,
    pausedClients,
    atRiskClients,
    onboardingIncompleteClients,
    overdueCheckinClients,
    recentlyOnboardedClients,
  };
}

export function getPtProfilePreviewData(
  profile: PTProfile | null | undefined,
): PTProfilePreviewData | null {
  if (!profile) return null;

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
    publicUrl: profile.publicUrl,
    profilePhotoUrl: profile.profilePhotoUrl,
    bannerImageUrl: profile.bannerImageUrl,
    socialLinks: profile.socialLinks,
    testimonials: profile.testimonials,
    transformations: profile.transformations,
  };
}

export async function updatePtHubLeadStatus(params: {
  leadId: string;
  status: PTLeadStatus;
  markConverted?: boolean;
}) {
  const payload: {
    status: PTLeadStatus;
    converted_at?: string | null;
  } = { status: params.status };

  if (params.markConverted) {
    payload.converted_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("pt_hub_leads")
    .update(payload)
    .eq("id", params.leadId);

  if (error) throw error;
}

export async function addPtHubLeadNote(params: {
  leadId: string;
  userId: string;
  body: string;
}) {
  const nextBody = params.body.trim();
  if (!nextBody) {
    throw new Error("Note body is required.");
  }

  const { error } = await supabase.from("pt_hub_lead_notes").insert({
    lead_id: params.leadId,
    user_id: params.userId,
    body: nextBody,
  });

  if (error) throw error;
}

export async function savePtHubProfile(params: {
  userId: string;
  workspaceId: string | null;
  profile: StoredProfileDraft;
}) {
  const normalizedSlug = slugifyValue(params.profile.slug);
  const normalizedDraft = {
    full_name: params.profile.fullName.trim() || null,
    display_name: params.profile.displayName.trim() || null,
    slug: normalizedSlug || null,
    headline: params.profile.headline.trim() || null,
    searchable_headline:
      params.profile.searchableHeadline.trim() ||
      params.profile.headline.trim() ||
      null,
    short_bio: params.profile.shortBio.trim() || null,
    specialties: normalizeTextList(params.profile.specialties),
    certifications: normalizeTextList(params.profile.certifications),
    coaching_style: params.profile.coachingStyle.trim() || null,
    coaching_modes: normalizeEnumList(
      params.profile.coachingModes,
      COACHING_MODE_VALUES,
    ),
    availability_modes: normalizeEnumList(
      params.profile.availabilityModes,
      AVAILABILITY_MODE_VALUES,
    ),
    location_label: params.profile.locationLabel.trim() || null,
    marketplace_visible: params.profile.marketplaceVisible,
    profile_photo_url: params.profile.profilePhotoUrl?.trim() || null,
    banner_image_url: params.profile.bannerImageUrl?.trim() || null,
    social_links: normalizeSocialLinks(params.profile.socialLinks),
    testimonials: params.profile.testimonials,
    transformations: params.profile.transformations
      .map((item, index) => ({
        id: item.id?.trim() || createTransformationId(item.title, index),
        title: item.title.trim(),
        summary: item.summary.trim(),
        beforeImageUrl: item.beforeImageUrl?.trim() || null,
        afterImageUrl: item.afterImageUrl?.trim() || null,
      }))
      .filter(
        (item) =>
          item.title ||
          item.summary ||
          item.beforeImageUrl ||
          item.afterImageUrl,
      ),
  };

  const { error } = await supabase.from("pt_hub_profiles").upsert(
    {
      user_id: params.userId,
      ...normalizedDraft,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export async function savePtHubSettings(params: {
  userId: string;
  settings: PTAccountSettingsDraft;
}) {
  const { error } = await supabase.from("pt_hub_settings").upsert(
    {
      user_id: params.userId,
      contact_email: params.settings.contactEmail.trim() || null,
      support_email: params.settings.supportEmail.trim() || null,
      phone: params.settings.phone.trim() || null,
      timezone: params.settings.timezone.trim() || null,
      city: params.settings.city.trim() || null,
      client_alerts: params.settings.clientAlerts,
      weekly_digest: params.settings.weeklyDigest,
      product_updates: params.settings.productUpdates,
      profile_visibility: params.settings.profileVisibility,
      subscription_plan: params.settings.subscriptionPlan.trim() || null,
      subscription_status: params.settings.subscriptionStatus.trim() || null,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export function usePublicPtProfile(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-pt-profile", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const nextSlug = slug?.trim().toLowerCase();
      if (!nextSlug) return null as PTPublicProfile | null;

      const { data, error } = await supabase
        .from("pt_hub_profiles")
        .select(
          "user_id, full_name, display_name, slug, headline, searchable_headline, short_bio, specialties, certifications, coaching_style, coaching_modes, availability_modes, location_label, marketplace_visible, is_published, published_at, profile_photo_url, banner_image_url, social_links, testimonials, transformations",
        )
        .eq("slug", nextSlug)
        .eq("is_published", true)
        .maybeSingle<PtHubProfileRow>();

      if (error) throw error;
      if (!data) return null;

      return {
        userId: data.user_id,
        fullName: data.full_name?.trim() || "",
        displayName:
          data.display_name?.trim() || data.full_name?.trim() || "Coach",
        slug: data.slug?.trim() || nextSlug,
        headline: data.headline?.trim() || "",
        searchableHeadline:
          data.searchable_headline?.trim() || data.headline?.trim() || "",
        shortBio: data.short_bio?.trim() || "",
        specialties: normalizeTextList(data.specialties),
        certifications: normalizeTextList(data.certifications),
        coachingStyle: data.coaching_style?.trim() || "",
        coachingModes: normalizeEnumList(
          data.coaching_modes,
          COACHING_MODE_VALUES,
        ),
        availabilityModes: normalizeEnumList(
          data.availability_modes,
          AVAILABILITY_MODE_VALUES,
        ),
        locationLabel: data.location_label?.trim() || "",
        marketplaceVisible: data.marketplace_visible ?? false,
        publishedAt: data.published_at ?? null,
        profilePhotoUrl: data.profile_photo_url ?? null,
        bannerImageUrl: data.banner_image_url ?? null,
        socialLinks: normalizeSocialLinks(data.social_links).filter((link) =>
          isPresent(link.url),
        ),
        testimonials: normalizeTestimonials(data.testimonials),
        transformations: normalizeTransformations(data.transformations),
        publicUrl:
          getPublicCoachUrl(data.slug?.trim() || nextSlug) ??
          `/coach/${nextSlug}`,
      } satisfies PTPublicProfile;
    },
  });
}

export async function setPtHubProfilePublication(publish: boolean) {
  const { error } = await supabase.rpc("set_pt_profile_publication", {
    p_publish: publish,
  });

  if (error) throw error;
}

export async function submitPublicPtApplication(input: PTPublicLeadInput) {
  const nextInput = {
    p_slug: slugifyValue(input.slug),
    p_full_name: input.fullName.trim(),
    p_email: input.email.trim(),
    p_phone: input.phone.trim(),
    p_goal_summary: input.goalSummary.trim(),
    p_training_experience: input.trainingExperience.trim(),
    p_budget_interest: input.budgetInterest.trim(),
    p_package_interest: input.packageInterest.trim(),
  };

  const { data, error } = await supabase.rpc(
    "submit_public_pt_application",
    nextInput,
  );

  if (error) throw error;

  return data as string | null;
}

export async function createPtWorkspace(workspaceName: string) {
  const nextName = workspaceName.trim();
  if (!nextName) {
    throw new Error("Workspace name is required.");
  }

  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: nextName,
  });
  if (error) throw error;

  const createdWorkspaceId = Array.isArray(data)
    ? ((data[0] as { workspace_id?: string } | undefined)?.workspace_id ?? null)
    : ((data as { workspace_id?: string } | null)?.workspace_id ?? null);

  if (!createdWorkspaceId) {
    throw new Error("Workspace was created, but no workspace ID was returned.");
  }

  return createdWorkspaceId;
}

export type StoredProfileDraft = Omit<
  PTProfile,
  "id" | "workspaceId" | "completionPercent" | "updatedAt" | "publicUrl"
>;
