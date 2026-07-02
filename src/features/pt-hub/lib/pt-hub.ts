import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSessionAuth } from "../../../lib/auth";
import {
  isClientAtRisk,
  matchesClientSegment,
  normalizeClientLifecycleState,
  type ClientSegmentKey,
} from "../../../lib/client-lifecycle";
import { formatRelativeTime } from "../../../lib/relative-time";
import { runClientGuardedAction } from "../../../lib/request-guard";
import { routes } from "../../../lib/routes";
import { supabase } from "../../../lib/supabase";
import { useWorkspace } from "../../../lib/use-workspace";
import { traceAsync, traceEnd, traceStart } from "../../../lib/perf-trace";
import { syncPtAccountIdentity } from "../../../lib/account-profiles";
import { getWorkspaceRouteSlug } from "../../../lib/workspace-route-resolution";
import {
  buildPublicPtApplicationRpcInput,
  normalizePtLeadStatus,
} from "./pt-hub-leads";
import { normalizePackageStateForPersistence } from "./pt-hub-package-state";
import type {
  PTAvailabilityMode,
  PTAccountSettingsDraft,
  PTActivationSummary,
  PTAnalyticsSnapshot,
  PTAnalyticsWorkspaceBreakdown,
  PTClientDirectoryPage,
  PTClientStatsSnapshot,
  PTClientSummary,
  PTCoachingMode,
  PTLead,
  PTLeadNote,
  PTLeadStatus,
  PTPackage,
  PTPackageStatus,
  PTInvoiceSummary,
  PTOverviewStats,
  PTPublicPackageOption,
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
  fullName: "",
  contactEmail: "",
  supportEmail: "",
  phone: "",
  country: "",
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
  full_name: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type PtHubSettingsRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  contact_email: string | null;
  support_email: string | null;
  phone: string | null;
  country: string | null;
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
  id?: string | null;
  workspace_id: string | null;
  user_id?: string | null;
  role: string | null;
  status: string | null;
  client_access_mode?: string | null;
  joined_at?: string | null;
  created_at: string | null;
};

type WorkspaceRow = {
  id: string;
  slug: string | null;
  name: string | null;
  owner_user_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type WorkspaceClientCountRow = {
  workspace_id: string | null;
  lifecycle_state: string | null;
};

type PtProfileNameRow = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
};

type PtClientsSummaryRow = {
  id: string;
  url_key?: string | null;
  workspace_id: string | null;
  workspace_slug?: string | null;
  user_id: string | null;
  status: string | null;
  lifecycle_state: string | null;
  manual_risk_flag: boolean | null;
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

type PtHubClientStatsRow = {
  total_clients: number | null;
  active_clients: number | null;
  paused_clients: number | null;
  at_risk_clients: number | null;
  onboarding_incomplete_clients: number | null;
  overdue_checkin_clients: number | null;
};

type PtHubActivationSummaryRow = {
  workspace_exists: boolean | null;
  activation_workspace_id: string | null;
  activation_workspace_slug: string | null;
  has_first_client: boolean | null;
  first_client_id: string | null;
  has_workout_assigned: boolean | null;
  has_nutrition_assigned: boolean | null;
  has_checkin_assigned: boolean | null;
  has_co_coach_invited_or_active: boolean | null;
  client_count: number | null;
};

type PtHubClientsPageRow = PtClientsSummaryRow & {
  workspace_name: string | null;
  total_count: number | null;
};

type PtHubClientsRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type PtHubActivationRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type PtHubLeadRow = {
  id: string;
  user_id: string;
  applicant_user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  goal_summary: string;
  training_experience: string | null;
  budget_interest: string | null;
  package_interest: string | null;
  package_interest_id: string | null;
  package_interest_label_snapshot: string | null;
  status: string | null;
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

type PtHubLeadChatSummaryRow = {
  lead_id: string;
  conversation_id: string | null;
  conversation_status: string | null;
  archived_reason: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | null;
};

type PtPackageRow = {
  id: string;
  pt_user_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  price_label: string | null;
  billing_cadence_label: string | null;
  cta_label: string | null;
  features: unknown;
  status: string;
  is_public: boolean;
  sort_order: number | null;
  currency_code: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type PtPackageLeadReferenceRow = {
  package_interest_id: string | null;
};

async function tracePtHubQuery<TData>(
  label: string,
  operation: () => PromiseLike<{ data: TData[] | null; error: unknown }>,
  details?: Record<string, unknown>,
) {
  const startedAt = traceStart(label, details);
  try {
    const result = await Promise.resolve(operation());
    traceEnd(label, startedAt, {
      ...details,
      resultCount: result.data?.length ?? 0,
      hasError: Boolean(result.error),
    });
    return result;
  } catch (error) {
    traceEnd(label, startedAt, {
      ...details,
      hasError: true,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

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

  return normalizedSeed
    ? `${normalizedSeed}-${index + 1}`
    : `transformation-${index + 1}`;
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
        item.title || item.summary || item.beforeImageUrl || item.afterImageUrl,
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
  const path = routes.publicProfile(slug);
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
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

function isWorkspaceActiveClient(lifecycleState: string | null | undefined) {
  const lifecycle = normalizeClientLifecycleState(lifecycleState);
  return ["invited", "onboarding", "active"].includes(lifecycle);
}

function isLifecycleCoached(lifecycleState: string | null | undefined) {
  const lifecycle = normalizeClientLifecycleState(lifecycleState);
  return lifecycle === "active";
}

function mapPtClientSummary(
  row: PtClientsSummaryRow,
  workspaceName: string,
  workspaceSlug = "",
): PTClientSummary {
  const recentActivityAt =
    row.last_activity_at ??
    row.updated_at ??
    row.created_at ??
    row.last_message_at ??
    row.last_checkin_at;

  return {
    id: row.id,
    urlKey:
      row.url_key?.trim() ||
      `c-${row.id.split("-").join("").slice(0, 8).toLowerCase()}`,
    workspaceId: row.workspace_id ?? "",
    workspaceSlug: row.workspace_slug?.trim() || workspaceSlug,
    workspaceName,
    displayName: row.display_name?.trim() || "Client",
    status: row.status?.trim() || "active",
    lifecycleState: row.lifecycle_state?.trim() || "unknown",
    manualRiskFlag: Boolean(row.manual_risk_flag),
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

function normalizeWorkspaceRole(
  role: string | null | undefined,
): PTWorkspaceSummary["role"] {
  if (role === "pt_owner") return "owner";
  if (role === "pt_coach") return "coach";
  if (
    role === "owner" ||
    role === "admin" ||
    role === "coach" ||
    role === "assistant_coach" ||
    role === "viewer"
  ) {
    return role;
  }
  return "viewer";
}

function normalizeClientAccessMode(
  mode: string | null | undefined,
): PTWorkspaceSummary["clientAccessMode"] {
  return mode === "assigned_clients_only" ? mode : "all_clients";
}

export function usePtHubWorkspaces() {
  const { user } = useSessionAuth();
  const { workspaceId: activeWorkspaceId } = useWorkspace();

  return useQuery({
    queryKey: ["pt-hub-workspaces", user?.id, activeWorkspaceId],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      return await traceAsync("PtHub.usePtHubWorkspaces", async () => {
      const userId = user?.id;
      if (!userId) return [] as PTWorkspaceSummary[];

      const [{ data: memberData, error: memberError }, { data, error }] =
        await Promise.all([
          tracePtHubQuery(
            "PtHub.usePtHubWorkspaces.workspace_members",
            () =>
              supabase
                .from("workspace_members")
                .select(
                  "id, workspace_id, user_id, role, status, client_access_mode, joined_at, created_at",
                )
                .eq("user_id", userId)
                .eq("status", "active")
                .returns<WorkspaceMemberRow[]>(),
            { userId },
          ),
          tracePtHubQuery(
            "PtHub.usePtHubWorkspaces.owned_workspaces",
            () =>
              supabase
                .from("workspaces")
                .select("id, slug, name, owner_user_id, updated_at, created_at")
                .eq("owner_user_id", userId)
                .order("updated_at", { ascending: false })
                .returns<WorkspaceRow[]>(),
            { userId },
          ),
        ]);

      if (memberError) throw memberError;
      if (error) throw error;

      const ownedWorkspaceRows = data ?? [];
      const memberMap = new Map(
        (memberData ?? [])
          .filter(
            (row) =>
              Boolean(row.workspace_id) &&
              row.status === "active" &&
              normalizeWorkspaceRole(row.role) !== "owner",
          )
          .map((row) => [row.workspace_id as string, row]),
      );
      const ownedWorkspaceIds = ownedWorkspaceRows.map((row) => row.id);
      const memberWorkspaceIds = Array.from(memberMap.keys());
      const workspaceIds = Array.from(
        new Set([...ownedWorkspaceIds, ...memberWorkspaceIds]),
      );

      let workspaceRows = ownedWorkspaceRows;
      if (workspaceIds.length > 0) {
        const { data: resolvedWorkspaces, error: resolvedWorkspacesError } =
          await tracePtHubQuery(
            "PtHub.usePtHubWorkspaces.resolved_workspaces",
            () =>
              supabase
                .from("workspaces")
                .select("id, slug, name, owner_user_id, updated_at, created_at")
                .in("id", workspaceIds)
                .order("updated_at", { ascending: false })
                .returns<WorkspaceRow[]>(),
            { workspaceCount: workspaceIds.length },
          );

        if (resolvedWorkspacesError) throw resolvedWorkspacesError;
        workspaceRows = resolvedWorkspaces ?? [];
      }

      let clientCountMap = new Map<string, number>();
      let assignedClientCountMap = new Map<string, number>();
      let ownerNameMap = new Map<string, string>();
      if (workspaceIds.length > 0) {
        const memberIds = Array.from(memberMap.values())
          .map((member) => member.id)
          .filter((id): id is string => Boolean(id));
        const ownerUserIds = Array.from(
          new Set(
            workspaceRows
              .map((workspace) => workspace.owner_user_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        const [
          { data: clients, error: clientsError },
          { data: assignments, error: assignmentsError },
          { data: ownerProfiles, error: ownerProfilesError },
        ] = await Promise.all([
          tracePtHubQuery(
            "PtHub.usePtHubWorkspaces.active_client_counts",
            () =>
              supabase
                .from("clients")
                .select("workspace_id, lifecycle_state")
                .in("workspace_id", workspaceIds)
                .in("lifecycle_state", ["invited", "onboarding", "active"])
                .returns<WorkspaceClientCountRow[]>(),
            { workspaceCount: workspaceIds.length },
          ),
          memberIds.length > 0
            ? tracePtHubQuery(
                "PtHub.usePtHubWorkspaces.member_client_assignments",
                () =>
                  supabase
                    .from("workspace_member_client_assignments")
                    .select("workspace_id, member_id, client_id")
                    .in("member_id", memberIds)
                    .returns<
                      Array<{
                        workspace_id: string | null;
                        member_id: string | null;
                        client_id: string | null;
                      }>
                    >(),
                { memberCount: memberIds.length },
              )
            : Promise.resolve({ data: [], error: null }),
          ownerUserIds.length > 0
            ? tracePtHubQuery(
                "PtHub.usePtHubWorkspaces.owner_profiles",
                () =>
                  supabase
                    .from("pt_profiles")
                    .select("user_id, display_name, full_name")
                    .in("user_id", ownerUserIds)
                    .returns<PtProfileNameRow[]>(),
                { ownerCount: ownerUserIds.length },
              )
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (clientsError) throw clientsError;
        if (assignmentsError) throw assignmentsError;
        if (ownerProfilesError) throw ownerProfilesError;

        clientCountMap = (clients ?? []).reduce((map, client) => {
          if (
            !client.workspace_id ||
            !isWorkspaceActiveClient(client.lifecycle_state)
          )
            return map;
          map.set(client.workspace_id, (map.get(client.workspace_id) ?? 0) + 1);
          return map;
        }, new Map<string, number>());

        assignedClientCountMap = (assignments ?? []).reduce(
          (map, assignment) => {
            if (!assignment.workspace_id || !assignment.client_id) return map;
            map.set(
              assignment.workspace_id,
              (map.get(assignment.workspace_id) ?? 0) + 1,
            );
            return map;
          },
          new Map<string, number>(),
        );
        ownerNameMap = (ownerProfiles ?? []).reduce((map, profile) => {
          map.set(
            profile.user_id,
            profile.display_name?.trim() || profile.full_name?.trim() || "",
          );
          return map;
        }, new Map<string, string>());
      }

      return workspaceRows.map((workspace) => {
        const clientCount = clientCountMap.get(workspace.id) ?? 0;
        const isOwned = workspace.owner_user_id === userId;
        const member = memberMap.get(workspace.id);
        const role = isOwned ? "owner" : normalizeWorkspaceRole(member?.role);
        const relation = isOwned ? "owned" : "shared";
        return {
          id: workspace.id,
          slug: getWorkspaceRouteSlug(workspace),
          name: workspace.name?.trim() || "Untitled workspace",
          status: getWorkspaceStatus(
            workspace.id,
            activeWorkspaceId,
            clientCount,
          ),
          clientCount,
          lastUpdated: workspace.updated_at ?? workspace.created_at ?? null,
          ownerUserId: workspace.owner_user_id,
          role,
          relation,
          memberStatus: "active",
          ownerName: workspace.owner_user_id
            ? ownerNameMap.get(workspace.owner_user_id)?.trim() || null
            : null,
          clientAccessMode: isOwned
            ? "all_clients"
            : normalizeClientAccessMode(member?.client_access_mode),
          assignedClientCount: isOwned
            ? null
            : (assignedClientCountMap.get(workspace.id) ?? 0),
          createdAt: workspace.created_at ?? null,
          joinedAt: isOwned
            ? (workspace.created_at ?? null)
            : (member?.joined_at ?? member?.created_at ?? null),
        } satisfies PTWorkspaceSummary;
      });
      }, { userId: user?.id ?? null, activeWorkspaceId });
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

function mapLead(
  row: PtHubLeadRow,
  notes: PTLeadNote[],
  chatSummary: PtHubLeadChatSummaryRow | null,
): PTLead {
  const source = row.source?.trim() || "manual";
  const conversationStatus =
    chatSummary?.conversation_status === "archived" ? "archived" : "open";

  return {
    id: row.id,
    applicantUserId: row.applicant_user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    goalSummary: row.goal_summary,
    trainingExperience: row.training_experience,
    budgetInterest: row.budget_interest,
    packageInterest: row.package_interest,
    packageInterestId: row.package_interest_id,
    packageInterestLabelSnapshot: row.package_interest_label_snapshot,
    status: normalizePtLeadStatus(row.status),
    submittedAt: row.submitted_at,
    notesPreview: notes[0]?.body ?? null,
    leadConversationId: chatSummary?.conversation_id ?? null,
    leadConversationStatus: chatSummary?.conversation_id
      ? conversationStatus
      : null,
    leadConversationArchivedReason:
      chatSummary?.archived_reason === "converted" ||
      chatSummary?.archived_reason === "declined" ||
      chatSummary?.archived_reason === "manual"
        ? chatSummary.archived_reason
        : null,
    leadLastMessagePreview: chatSummary?.last_message_preview ?? null,
    leadLastMessageAt: chatSummary?.last_message_at ?? null,
    leadUnreadCount: chatSummary?.unread_count ?? 0,
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
  const { user } = useSessionAuth();
  const { workspaceId } = useWorkspace();

  return useQuery({
    queryKey: ["pt-hub-profile", user?.id, workspaceId],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      return await traceAsync("PtHub.usePtHubProfile", async () => {
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
          .select("display_name, full_name, updated_at, created_at")
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
        legacyProfile?.full_name?.trim() ||
        hubProfile?.display_name?.trim() ||
        legacyProfile?.display_name?.trim() ||
        "";
      const displayName =
        hubProfile?.display_name?.trim() ||
        legacyProfile?.display_name?.trim() ||
        legacyProfile?.full_name?.trim() ||
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
      }, { userId: user?.id ?? null, workspaceId });
    },
  });
}

export function usePtHubSettings() {
  const { user } = useSessionAuth();

  return useQuery({
    queryKey: ["pt-hub-settings", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      return await traceAsync("PtHub.usePtHubSettings", async () => {
      const userId = user?.id;
      if (!userId) return null;

      const [
        { data, error },
        { data: hubProfile, error: hubProfileError },
        { data: legacyRows, error: legacyError },
      ] = await Promise.all([
        supabase
          .from("pt_hub_settings")
          .select(
            "id, user_id, full_name, contact_email, support_email, phone, country, timezone, city, client_alerts, weekly_digest, product_updates, profile_visibility, subscription_plan, subscription_status, updated_at, created_at",
          )
          .eq("user_id", userId)
          .maybeSingle<PtHubSettingsRow>(),
        supabase
          .from("pt_hub_profiles")
          .select("full_name, display_name")
          .eq("user_id", userId)
          .maybeSingle<{
            full_name: string | null;
            display_name: string | null;
          }>(),
        supabase
          .from("pt_profiles")
          .select("full_name, display_name, updated_at, created_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .returns<LegacyPtProfileRow[]>(),
      ]);

      if (error) throw error;
      if (hubProfileError) throw hubProfileError;
      if (legacyError) throw legacyError;

      const legacyProfile = legacyRows?.[0] ?? null;
      const authFullName =
        typeof user?.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : "";

      return {
        ...DEFAULT_SETTINGS,
        fullName:
          data?.full_name?.trim() ||
          hubProfile?.full_name?.trim() ||
          legacyProfile?.full_name?.trim() ||
          hubProfile?.display_name?.trim() ||
          legacyProfile?.display_name?.trim() ||
          authFullName.trim() ||
          "",
        contactEmail: data?.contact_email ?? user?.email ?? "",
        supportEmail: data?.support_email ?? user?.email ?? "",
        phone: data?.phone ?? "",
        country: data?.country ?? "",
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
      }, { userId: user?.id ?? null });
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
      workspacesQuery.dataUpdatedAt,
      profileQuery.dataUpdatedAt,
      settingsQuery.dataUpdatedAt,
      leadsQuery.dataUpdatedAt,
      clientsQuery.dataUpdatedAt,
      readinessQuery.dataUpdatedAt,
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
      complete: isPresent(settings?.contactEmail),
      href: "/pt-hub/settings",
      guidance:
        "Add a contact email so future inquiry CTAs have a real destination.",
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
      profileQuery.dataUpdatedAt,
      settingsQuery.dataUpdatedAt,
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
      profileQuery.dataUpdatedAt,
      settingsQuery.dataUpdatedAt,
      readinessQuery.dataUpdatedAt,
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
    queryKey: [
      "pt-hub-payments",
      settingsQuery.dataUpdatedAt,
      clientsQuery.dataUpdatedAt,
    ],
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
      leadsQuery.dataUpdatedAt,
      clientsQuery.dataUpdatedAt,
      profileQuery.dataUpdatedAt,
      readinessQuery.dataUpdatedAt,
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

      const convertedApplications = leads.filter(
        (lead) => lead.status === "converted",
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
            ? Math.round((convertedApplications / leads.length) * 100)
            : 0,
        activeClients: clients.filter((client) =>
          isLifecycleCoached(client.lifecycleState),
        ).length,
        profileCompletionPercent: readinessQuery.data?.completionPercent ?? 0,
        testimonialCountLabel: String(
          profileQuery.data?.testimonials.length ?? 0,
        ),
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
  const { user } = useSessionAuth();

  return useQuery({
    queryKey: ["pt-hub-leads", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      return await traceAsync("PtHub.usePtHubLeads", async () => {
      const userId = user?.id;
      if (!userId) return [] as PTLead[];

      const [
        { data: leads, error: leadsError },
        { data: notes, error: notesError },
        { data: chatSummaries, error: chatSummariesError },
      ] = await Promise.all([
        supabase
          .from("pt_hub_leads")
          .select(
            "id, user_id, applicant_user_id, full_name, email, phone, goal_summary, training_experience, budget_interest, package_interest, package_interest_id, package_interest_label_snapshot, status, submitted_at, source, source_slug, converted_at, converted_workspace_id, converted_client_id, created_at, updated_at",
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
        supabase.rpc("pt_hub_lead_chat_summaries"),
      ]);

      if (leadsError) throw leadsError;
      if (notesError) throw notesError;
      if (chatSummariesError) {
        const code = (chatSummariesError as { code?: string }).code ?? "";
        const message = (
          (chatSummariesError as { message?: string }).message ?? ""
        ).toLowerCase();
        if (
          code !== "PGRST202" &&
          code !== "PGRST116" &&
          !message.includes("function") &&
          !message.includes("does not exist")
        ) {
          throw chatSummariesError;
        }
      }

      const notesByLead = (notes ?? []).reduce((map, row) => {
        const list = map.get(row.lead_id) ?? [];
        list.push(mapLeadNote(row));
        map.set(row.lead_id, list);
        return map;
      }, new Map<string, PTLeadNote[]>());

      const chatSummaryByLead = (
        (chatSummaries ?? []) as PtHubLeadChatSummaryRow[]
      ).reduce((map, row) => {
        map.set(row.lead_id, row);
        return map;
      }, new Map<string, PtHubLeadChatSummaryRow>());

      return (leads ?? []).map((lead) =>
        mapLead(
          lead,
          notesByLead.get(lead.id) ?? [],
          chatSummaryByLead.get(lead.id) ?? null,
        ),
      );
      }, { userId: user?.id ?? null });
    },
  });
}

export async function fetchPtHubClientSummaries(
  client: PtHubClientsRpcClient,
  workspaces: Array<Pick<PTWorkspaceSummary, "id" | "name" | "slug">>,
) {
  return await traceAsync("PtHub.fetchPtHubClientSummaries", async () => {
  if (workspaces.length === 0) return [] as PTClientSummary[];

  const { data, error } = await client.rpc("pt_hub_clients_page", {
    p_limit: 1000,
    p_offset: 0,
    p_workspace_id: null,
    p_lifecycle: null,
    p_search: null,
    p_segment: null,
  });

  if (error) throw error;

  const workspaceNameById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace.name]),
  );
  const workspaceSlugById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace.slug]),
  );

  return ((data ?? []) as PtHubClientsPageRow[])
    .map((row) =>
      mapPtClientSummary(
        row,
        row.workspace_name?.trim() ||
          workspaceNameById.get(row.workspace_id ?? "") ||
          "Workspace",
        workspaceSlugById.get(row.workspace_id ?? "") ?? "",
      ),
    )
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });
  }, { workspaceCount: workspaces.length });
}

export function usePtHubClients() {
  const { user } = useSessionAuth();
  const workspacesQuery = usePtHubWorkspaces();
  const workspaceIdsKey = useMemo(
    () =>
      (workspacesQuery.data ?? []).map((workspace) => workspace.id).join("|"),
    [workspacesQuery.data],
  );

  return useQuery({
    queryKey: ["pt-hub-clients", user?.id, workspaceIdsKey],
    enabled: Boolean(user?.id) && workspacesQuery.isSuccess,
    queryFn: async () => {
      const workspaces = workspacesQuery.data ?? [];
      return fetchPtHubClientSummaries(supabase, workspaces);
    },
  });
}

function normalizePtHubClientSearch(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function usePtHubClientStats() {
  const { user } = useSessionAuth();

  return useQuery({
    queryKey: ["pt-hub-client-stats", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pt_hub_client_stats");

      if (error) throw error;

      const row = ((data ?? [])[0] ?? null) as PtHubClientStatsRow | null;

      return {
        totalClients: row?.total_clients ?? 0,
        activeClients: row?.active_clients ?? 0,
        pausedClients: row?.paused_clients ?? 0,
        atRiskClients: row?.at_risk_clients ?? 0,
        onboardingIncompleteClients: row?.onboarding_incomplete_clients ?? 0,
        overdueCheckinClients: row?.overdue_checkin_clients ?? 0,
      } satisfies PTClientStatsSnapshot;
    },
  });
}

function mapPtHubActivationSummary(params: {
  row: PtHubActivationSummaryRow | null;
  profileComplete: boolean;
  profilePublished: boolean;
}): PTActivationSummary {
  const row = params.row;
  const workspaceExists = row?.workspace_exists ?? false;
  const milestones = [
    workspaceExists,
    params.profileComplete,
    params.profilePublished,
    row?.has_first_client ?? false,
    row?.has_workout_assigned ?? false,
    row?.has_nutrition_assigned ?? false,
    row?.has_checkin_assigned ?? false,
  ];

  return {
    workspaceExists,
    activationWorkspaceId: row?.activation_workspace_id ?? null,
    activationWorkspaceSlug: row?.activation_workspace_slug ?? null,
    profileComplete: params.profileComplete,
    profilePublished: params.profilePublished,
    hasFirstClient: row?.has_first_client ?? false,
    firstClientId: row?.first_client_id ?? null,
    hasWorkoutAssigned: row?.has_workout_assigned ?? false,
    hasNutritionAssigned: row?.has_nutrition_assigned ?? false,
    hasCheckInAssigned: row?.has_checkin_assigned ?? false,
    hasCoCoachInvitedOrActive:
      row?.has_co_coach_invited_or_active ?? false,
    clientCount: row?.client_count ?? 0,
    coreCompletedCount: milestones.filter(Boolean).length,
    coreTotalCount: milestones.length,
  };
}

export async function fetchPtHubActivationSummary(
  client: PtHubActivationRpcClient,
  params: {
    workspaceId?: string | null;
    profileComplete?: boolean;
    profilePublished?: boolean;
  } = {},
) {
  const { data, error } = await client.rpc("pt_hub_activation_summary", {
    p_workspace_id: params.workspaceId ?? null,
  });

  if (error) throw error;

  const row = ((data ?? []) as PtHubActivationSummaryRow[])[0] ?? null;
  return mapPtHubActivationSummary({
    row,
    profileComplete: params.profileComplete ?? false,
    profilePublished: params.profilePublished ?? false,
  });
}

export function usePtHubActivationSummary() {
  const { user } = useSessionAuth();
  const { workspaceId } = useWorkspace();
  const readinessQuery = usePtHubProfileReadiness();
  const publicationQuery = usePtHubPublicationState();

  return useQuery({
    queryKey: [
      "pt-hub-activation-summary",
      user?.id,
      workspaceId ?? null,
      readinessQuery.dataUpdatedAt,
      publicationQuery.dataUpdatedAt,
    ],
    enabled:
      Boolean(user?.id) &&
      readinessQuery.isSuccess &&
      publicationQuery.isSuccess,
    queryFn: async () =>
      fetchPtHubActivationSummary(supabase, {
        workspaceId,
        profileComplete: readinessQuery.data?.readyForPublish ?? false,
        profilePublished: publicationQuery.data?.isPublished ?? false,
      }),
  });
}

export function usePtHubClientsPage(params: {
  page: number;
  pageSize?: number;
  workspaceId?: string;
  lifecycle?: string;
  segment?: ClientSegmentKey;
  search?: string;
  enabled?: boolean;
}) {
  const { user } = useSessionAuth();
  const page = Math.max(0, params.page);
  const pageSize = params.pageSize ?? 25;
  const workspaceId =
    params.workspaceId && params.workspaceId !== "all"
      ? params.workspaceId
      : null;
  const lifecycle =
    params.lifecycle && params.lifecycle !== "all" ? params.lifecycle : null;
  const segment =
    params.segment && params.segment !== "all" ? params.segment : null;
  const search = normalizePtHubClientSearch(params.search);
  const enabled = params.enabled ?? true;

  return useQuery({
    queryKey: [
      "pt-hub-clients-page",
      user?.id,
      page,
      pageSize,
      workspaceId ?? "all",
      lifecycle ?? "all",
      segment ?? "all",
      search ?? "",
    ],
    enabled: Boolean(user?.id) && enabled,
    staleTime: 1000 * 30,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pt_hub_clients_page", {
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_workspace_id: workspaceId,
        p_lifecycle: lifecycle,
        p_search: search,
        p_segment: segment,
      });

      if (error) throw error;

      const rows = (data ?? []) as PtHubClientsPageRow[];
      const workspaceIds = Array.from(
        new Set(rows.map((row) => row.workspace_id).filter(Boolean)),
      ) as string[];
      const clientIds = rows.map((row) => row.id).filter(Boolean);
      const [workspaceSlugResult, clientKeyResult] = await Promise.all([
        workspaceIds.length > 0
          ? supabase
              .from("workspaces")
              .select("id, slug")
              .in("id", workspaceIds)
          : Promise.resolve({ data: [], error: null }),
        clientIds.length > 0
          ? supabase.from("clients").select("id, url_key").in("id", clientIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (workspaceSlugResult.error) throw workspaceSlugResult.error;
      if (clientKeyResult.error) throw clientKeyResult.error;
      const workspaceSlugById = new Map(
        (
          (workspaceSlugResult.data ?? []) as Array<{
            id: string;
            slug: string | null;
          }>
        ).map((workspace) => [workspace.id, workspace.slug ?? ""]),
      );
      const clientUrlKeyById = new Map(
        (
          (clientKeyResult.data ?? []) as Array<{
            id: string;
            url_key: string | null;
          }>
        ).map((clientRow) => [clientRow.id, clientRow.url_key ?? ""]),
      );
      const clients = rows.map((row) =>
        mapPtClientSummary(
          {
            ...row,
            url_key: row.url_key ?? clientUrlKeyById.get(row.id),
            workspace_slug:
              row.workspace_slug ??
              workspaceSlugById.get(row.workspace_id ?? ""),
          },
          row.workspace_name?.trim() || "Workspace",
        ),
      );
      const totalCount = rows[0]?.total_count ?? 0;

      return {
        clients,
        totalCount,
        hasMore: page * pageSize + clients.length < totalCount,
        page,
        pageSize,
      } satisfies PTClientDirectoryPage;
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
    isClientAtRisk(client),
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
}) {
  const { error } = await supabase
    .from("pt_hub_leads")
    .update({ status: params.status })
    .eq("id", params.leadId);

  if (error) throw error;
}

export type PtHubLeadApprovalResult = {
  lead_id: string;
  status: PTLeadStatus;
  workspace_id: string | null;
  client_id: string | null;
};

export const PT_HUB_LEAD_APPROVE_ERROR_TRANSFER_REQUIRED =
  "LEAD_TRANSFER_REQUIRES_CONFIRMATION";

export function getPtHubLeadApproveErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const details =
    "details" in error && typeof error.details === "string"
      ? error.details.trim()
      : "";
  if (details === PT_HUB_LEAD_APPROVE_ERROR_TRANSFER_REQUIRED) return details;
  return null;
}

export async function approvePtHubLead(params: {
  leadId: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  allowTransfer?: boolean;
}) {
  const { data, error } = await supabase.rpc("pt_hub_approve_lead", {
    p_lead_id: params.leadId,
    p_workspace_id: params.workspaceId ?? null,
    p_workspace_name: params.workspaceName?.trim() || null,
    p_allow_transfer: params.allowTransfer ?? false,
  });

  if (error) throw error;

  const row = (
    Array.isArray(data) ? (data[0] ?? null) : data
  ) as PtHubLeadApprovalResult | null;

  return row
    ? {
        ...row,
        status: normalizePtLeadStatus(row.status),
      }
    : null;
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

  await syncPtAccountIdentity({
    userId: params.userId,
    fullName: params.profile.fullName,
    updateAuthMetadata: true,
  });
}

export async function savePtHubSettings(params: {
  userId: string;
  settings: PTAccountSettingsDraft;
}) {
  const { error } = await supabase.from("pt_hub_settings").upsert(
    {
      user_id: params.userId,
      full_name: params.settings.fullName.trim() || null,
      contact_email: params.settings.contactEmail.trim() || null,
      support_email: params.settings.supportEmail.trim() || null,
      phone: params.settings.phone.trim() || null,
      country: params.settings.country.trim() || null,
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

  await syncPtAccountIdentity({
    userId: params.userId,
    fullName: params.settings.fullName,
    contactEmail: params.settings.contactEmail,
    supportEmail: params.settings.supportEmail,
    phone: params.settings.phone,
    country: params.settings.country,
    city: params.settings.city,
    updateAuthMetadata: true,
  });
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
          routes.publicProfile(nextSlug),
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

function normalizePtPackageStatus(value: unknown): PTPackageStatus {
  if (value === "active" || value === "archived" || value === "draft") {
    return value;
  }
  return "draft";
}

function normalizePtPackageFeatures(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const nextFeatures = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return nextFeatures.length > 0 ? nextFeatures : null;
}

function mapPtPackage(row: PtPackageRow): PTPackage {
  return {
    id: row.id,
    ptUserId: row.pt_user_id,
    title: row.title.trim(),
    subtitle: row.subtitle?.trim() || null,
    description: row.description?.trim() || null,
    priceLabel: row.price_label?.trim() || null,
    billingCadenceLabel: row.billing_cadence_label?.trim() || null,
    ctaLabel: row.cta_label?.trim() || null,
    features: normalizePtPackageFeatures(row.features),
    status: normalizePtPackageStatus(row.status),
    isPublic: Boolean(row.is_public),
    sortOrder: Number.isFinite(row.sort_order) ? Number(row.sort_order) : 0,
    currencyCode: row.currency_code?.trim() || null,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type PtPackageMutationInput = {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  priceLabel?: string | null;
  billingCadenceLabel?: string | null;
  ctaLabel?: string | null;
  features?: string[] | null;
  status: PTPackageStatus;
  isPublic: boolean;
  sortOrder: number;
  currencyCode?: string | null;
};

function toPtPackageMutationPayload(input: PtPackageMutationInput) {
  const normalizedState = normalizePackageStateForPersistence(input);
  const normalizedFeatures =
    normalizedState.features?.map((item) => item.trim()).filter(Boolean) ??
    null;

  return {
    title: normalizedState.title.trim(),
    subtitle: normalizedState.subtitle?.trim() || null,
    description: normalizedState.description?.trim() || null,
    price_label: normalizedState.priceLabel?.trim() || null,
    billing_cadence_label: normalizedState.billingCadenceLabel?.trim() || null,
    cta_label: normalizedState.ctaLabel?.trim() || null,
    features:
      normalizedFeatures && normalizedFeatures.length > 0
        ? normalizedFeatures
        : null,
    status: normalizedState.status,
    is_public: normalizedState.isPublic,
    sort_order: Number.isFinite(normalizedState.sortOrder)
      ? Math.max(0, Math.trunc(normalizedState.sortOrder))
      : 0,
    currency_code: normalizedState.currencyCode?.trim() || null,
  };
}

export function mapPublicPtPackageOptions(
  rows: Array<Record<string, unknown>>,
): PTPublicPackageOption[] {
  return finalizePublicPtPackageOptions(
    rows.map((row) => ({
      id: typeof row.id === "string" ? row.id.trim() : "",
      label: typeof row.title === "string" ? row.title.trim() : "",
      subtitle:
        typeof row.subtitle === "string" ? row.subtitle.trim() || null : null,
      description:
        typeof row.description === "string"
          ? row.description.trim() || null
          : null,
      priceLabel:
        typeof row.price_label === "string"
          ? row.price_label.trim() || null
          : null,
      billingCadenceLabel:
        typeof row.billing_cadence_label === "string"
          ? row.billing_cadence_label.trim() || null
          : null,
      ctaLabel:
        typeof row.cta_label === "string" ? row.cta_label.trim() || null : null,
      features: normalizePtPackageFeatures(row.features),
      status: normalizePtPackageStatus(row.status),
      isPublic: row.is_public === true,
      sortOrder:
        typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
          ? Math.trunc(row.sort_order)
          : Number.MAX_SAFE_INTEGER,
      createdAt:
        typeof row.created_at === "string" ? row.created_at.trim() : "",
    })),
  );
}

export function mapPublicPtPackageOptionsFromPackages(
  packages: PTPackage[],
): PTPublicPackageOption[] {
  return finalizePublicPtPackageOptions(
    packages.map((pkg) => ({
      id: pkg.id.trim(),
      label: pkg.title.trim(),
      subtitle: pkg.subtitle,
      description: pkg.description,
      priceLabel: pkg.priceLabel,
      billingCadenceLabel: pkg.billingCadenceLabel,
      ctaLabel: pkg.ctaLabel,
      features: pkg.features,
      status: pkg.status,
      isPublic: pkg.isPublic,
      sortOrder: Number.isFinite(pkg.sortOrder)
        ? Math.trunc(pkg.sortOrder)
        : Number.MAX_SAFE_INTEGER,
      createdAt: pkg.createdAt,
    })),
  );
}

function finalizePublicPtPackageOptions(
  options: Array<{
    id: string;
    label: string;
    subtitle: string | null;
    description: string | null;
    priceLabel: string | null;
    billingCadenceLabel: string | null;
    ctaLabel: string | null;
    features: string[] | null;
    status: PTPackageStatus;
    isPublic: boolean;
    sortOrder: number;
    createdAt: string;
  }>,
): PTPublicPackageOption[] {
  return options
    .filter(
      (option) =>
        option.id.length > 0 &&
        option.label.length > 0 &&
        option.status === "active" &&
        option.isPublic,
    )
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      if (a.createdAt !== b.createdAt) {
        return a.createdAt.localeCompare(b.createdAt);
      }
      return a.id.localeCompare(b.id);
    })
    .map((option) => ({
      id: option.id,
      label: option.label,
      subtitle: option.subtitle,
      description: option.description,
      priceLabel: option.priceLabel,
      billingCadenceLabel: option.billingCadenceLabel,
      features: option.features,
      ctaLabel: option.ctaLabel,
    }));
}

export function usePtPackages() {
  const { user } = useSessionAuth();

  return useQuery({
    queryKey: ["pt-packages", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return [] as PTPackage[];

      const { data, error } = await supabase
        .from("pt_packages")
        .select(
          "id, pt_user_id, title, subtitle, description, price_label, billing_cadence_label, cta_label, features, status, is_public, sort_order, currency_code, archived_at, created_at, updated_at",
        )
        .eq("pt_user_id", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .returns<PtPackageRow[]>();

      if (error) throw error;

      return (data ?? []).map((row) => mapPtPackage(row));
    },
  });
}

export function usePtPackageLeadReferenceCounts() {
  const { user } = useSessionAuth();

  return useQuery({
    queryKey: ["pt-package-lead-reference-counts", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return {} as Record<string, number>;

      const { data, error } = await supabase
        .from("pt_hub_leads")
        .select("package_interest_id")
        .eq("user_id", userId)
        .not("package_interest_id", "is", null)
        .returns<PtPackageLeadReferenceRow[]>();

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const packageId = row.package_interest_id?.trim();
        if (!packageId) continue;
        counts[packageId] = (counts[packageId] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export const PT_PACKAGE_DELETE_ERROR_REFERENCED =
  "PACKAGE_DELETE_BLOCKED_REFERENCED";
export const PT_PACKAGE_DELETE_ERROR_FORBIDDEN = "FORBIDDEN";

export function getPtPackageDeleteErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const details =
    "details" in error && typeof error.details === "string"
      ? error.details.trim()
      : "";
  if (details === PT_PACKAGE_DELETE_ERROR_REFERENCED) return details;
  if (details === PT_PACKAGE_DELETE_ERROR_FORBIDDEN) return details;
  return null;
}

export async function createPtPackage(params: {
  ptUserId: string;
  input: PtPackageMutationInput;
}) {
  const normalizedState = normalizePackageStateForPersistence(params.input);
  const payload = toPtPackageMutationPayload(normalizedState);

  const { error } = await supabase.from("pt_packages").insert({
    pt_user_id: params.ptUserId,
    ...payload,
    archived_at:
      normalizedState.status === "archived" ? new Date().toISOString() : null,
  });

  if (error) throw error;
}

export async function updatePtPackage(params: {
  ptUserId: string;
  packageId: string;
  input: PtPackageMutationInput;
}) {
  const normalizedState = normalizePackageStateForPersistence(params.input);
  const payload = toPtPackageMutationPayload(normalizedState);

  const { error } = await supabase
    .from("pt_packages")
    .update({
      ...payload,
      archived_at:
        normalizedState.status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", params.packageId)
    .eq("pt_user_id", params.ptUserId);

  if (error) throw error;
}

export async function archivePtPackage(params: {
  ptUserId: string;
  packageId: string;
}) {
  const { error } = await supabase
    .from("pt_packages")
    .update({
      status: "archived",
      is_public: false,
      archived_at: new Date().toISOString(),
    })
    .eq("id", params.packageId)
    .eq("pt_user_id", params.ptUserId);

  if (error) throw error;
}

export async function reorderPtPackages(params: {
  ptUserId: string;
  orderedIds: string[];
}) {
  const orderedIds = params.orderedIds.filter((id) => id.trim().length > 0);
  if (orderedIds.length === 0) return;

  await Promise.all(
    orderedIds.map(async (packageId, index) => {
      const { error } = await supabase
        .from("pt_packages")
        .update({ sort_order: index * 10 })
        .eq("id", packageId)
        .eq("pt_user_id", params.ptUserId);

      if (error) throw error;
    }),
  );
}

export async function deletePtPackage(params: { packageId: string }) {
  const packageId = params.packageId.trim();
  if (!packageId) {
    throw new Error("Package ID is required.");
  }

  const { error } = await supabase.rpc("delete_pt_package_guarded", {
    p_package_id: packageId,
  });

  if (error) throw error;
}

export function usePublicPtPackageOptions(
  coachUserId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["public-pt-package-options", coachUserId],
    enabled: Boolean(coachUserId),
    // Public packages should reflect PT publish/hide/archive changes immediately.
    staleTime: 0,
    queryFn: async () => {
      if (!coachUserId) return [] as PTPublicPackageOption[];

      const { data, error } = await supabase
        .from("pt_packages")
        .select(
          "id, title, subtitle, description, price_label, currency_code, billing_cadence_label, cta_label, features, status, is_public, sort_order, created_at",
        )
        .eq("pt_user_id", coachUserId);

      if (error) throw error;

      return mapPublicPtPackageOptions(
        (data ?? []) as Array<Record<string, unknown>>,
      );
    },
  });
}

function getAuthUserFullName(user: {
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata ?? {};
  const fullName = metadata.full_name;
  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  const fallbackName = metadata.name;
  if (typeof fallbackName === "string" && fallbackName.trim()) {
    return fallbackName.trim();
  }

  return "";
}

export async function submitPublicPtApplication(input: PTPublicLeadInput) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const user = authData.user;
  if (!user) {
    throw new Error("Sign in to apply to this coach.");
  }

  const authenticatedEmail = user.email?.trim().toLowerCase() ?? "";
  const authenticatedFullName = getAuthUserFullName(user);
  const nextInput = buildPublicPtApplicationRpcInput({
    input,
    authenticatedEmail,
    authenticatedFullName,
  });

  if (!authenticatedFullName && nextInput.p_full_name) {
    try {
      const userMetadata = (user.user_metadata ?? {}) as Record<
        string,
        unknown
      >;
      await supabase.auth.updateUser({
        data: {
          ...userMetadata,
          full_name: nextInput.p_full_name,
        },
      });
    } catch {
      // Best effort only.
    }
  }

  if (nextInput.p_phone) {
    try {
      await supabase
        .from("clients")
        .update({ phone: nextInput.p_phone })
        .eq("user_id", user.id)
        .is("workspace_id", null);
    } catch {
      // Best effort only.
    }
  }

  const { data, error } = await runClientGuardedAction({
    action: "public-pt-application",
    scope: `${nextInput.p_slug}:${user.id}`,
    cooldownMs: 60_000,
    message:
      "Please wait a minute before submitting another application for this coach.",
    run: async () =>
      await supabase.rpc("submit_public_pt_application", nextInput),
  });

  if (error) throw error;

  return data as string | null;
}

export async function createPtWorkspace(workspaceName: string) {
  const nextName = workspaceName.trim();
  if (!nextName) {
    throw new Error("Workspace name is required.");
  }

  const { data, error } = await runClientGuardedAction({
    action: "workspace-create",
    scope: "current-user",
    cooldownMs: 15_000,
    message: "Please wait a few seconds before creating another workspace.",
    run: async () =>
      await supabase.rpc("create_workspace", {
        p_name: nextName,
      }),
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
