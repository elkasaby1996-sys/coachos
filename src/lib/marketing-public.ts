export type MarketingFeatureAvailability =
  | "available"
  | "beta"
  | "coming_soon"
  | "not_available";

export type MarketingSignupMode = "request_access" | "direct_signup";

export const marketingSignupMode: MarketingSignupMode = "request_access";

export type MarketingFeatureKey =
  | "coachClientAccounts"
  | "coachingWorkspaces"
  | "publicCoachProfiles"
  | "publicApplications"
  | "leadWorkflow"
  | "programs"
  | "nutritionAssignments"
  | "habits"
  | "recurringCheckins"
  | "messaging"
  | "lifecycle"
  | "clientAttentionSignals"
  | "ptHubAnalytics"
  | "teamRolesPermissions"
  | "whoopData"
  | "nativeMobileApps"
  | "automatedBilling"
  | "automatedMigration"
  | "garmin"
  | "messageAttachments"
  | "publicMarketplace";

export type MarketingFeatureConfig = {
  key: MarketingFeatureKey;
  label: string;
  status: MarketingFeatureAvailability;
};

export const marketingFeatureAvailability: Record<
  MarketingFeatureKey,
  MarketingFeatureConfig
> = {
  coachClientAccounts: {
    key: "coachClientAccounts",
    label: "Coach and client accounts",
    status: "available",
  },
  coachingWorkspaces: {
    key: "coachingWorkspaces",
    label: "Coaching workspaces",
    status: "available",
  },
  publicCoachProfiles: {
    key: "publicCoachProfiles",
    label: "Public coach profiles",
    status: "available",
  },
  publicApplications: {
    key: "publicApplications",
    label: "Public applications",
    status: "available",
  },
  leadWorkflow: {
    key: "leadWorkflow",
    label: "Lead workflow",
    status: "available",
  },
  programs: {
    key: "programs",
    label: "Programs",
    status: "available",
  },
  nutritionAssignments: {
    key: "nutritionAssignments",
    label: "Nutrition assignments",
    status: "available",
  },
  habits: {
    key: "habits",
    label: "Habits",
    status: "available",
  },
  recurringCheckins: {
    key: "recurringCheckins",
    label: "Recurring check-ins",
    status: "available",
  },
  messaging: {
    key: "messaging",
    label: "Messaging",
    status: "available",
  },
  lifecycle: {
    key: "lifecycle",
    label: "Lifecycle",
    status: "available",
  },
  clientAttentionSignals: {
    key: "clientAttentionSignals",
    label: "Client attention signals",
    status: "available",
  },
  ptHubAnalytics: {
    key: "ptHubAnalytics",
    label: "PT Hub analytics",
    status: "available",
  },
  teamRolesPermissions: {
    key: "teamRolesPermissions",
    label: "Team roles and permissions",
    status: "available",
  },
  whoopData: {
    key: "whoopData",
    label: "WHOOP data",
    status: "coming_soon",
  },
  nativeMobileApps: {
    key: "nativeMobileApps",
    label: "Native mobile apps",
    status: "not_available",
  },
  automatedBilling: {
    key: "automatedBilling",
    label: "Automated billing",
    status: "not_available",
  },
  automatedMigration: {
    key: "automatedMigration",
    label: "Full automated migration",
    status: "not_available",
  },
  garmin: {
    key: "garmin",
    label: "Garmin",
    status: "not_available",
  },
  messageAttachments: {
    key: "messageAttachments",
    label: "Message attachments",
    status: "not_available",
  },
  publicMarketplace: {
    key: "publicMarketplace",
    label: "Public marketplace",
    status: "beta",
  },
};

export function getActiveMarketingFeatures() {
  return Object.values(marketingFeatureAvailability).filter(
    (feature) => feature.status !== "not_available",
  );
}

export function getMarketingCtaDestination(
  intent: "primary" | "switch" | "product" | "login",
) {
  if (intent === "primary") {
    return marketingSignupMode === "direct_signup"
      ? "/signup/pt"
      : "/request-access";
  }
  if (intent === "switch") return "/switch";
  if (intent === "product") return "/product";
  return "/login";
}

export type ProductPreviewGroup = {
  key: "acquire" | "coach" | "retain";
  title: string;
  caption: string;
  screenTitle: string;
  screenSubtitle: string;
  facts: string[];
  metrics: Array<{
    label: string;
    value: string;
  }>;
  timeline: Array<{
    label: string;
    detail: string;
    tone?: "clear" | "warning" | "action";
  }>;
};

export const productPreviewGroups: ProductPreviewGroup[] = [
  {
    key: "acquire",
    title: "Acquire",
    caption: "Public profile, application, lead conversation, and approval.",
    screenTitle: "Published profile to lead approval",
    screenSubtitle: "Seeded public profile and application workflow",
    facts: [
      "Profile: Published",
      "Application: Submitted",
      "Conversation: Open",
      "Approval: Ready for workspace",
    ],
    metrics: [
      { label: "Applications", value: "4" },
      { label: "Awaiting reply", value: "2" },
      { label: "Ready to approve", value: "1" },
    ],
    timeline: [
      {
        label: "Public profile",
        detail: "Strength coaching application is live",
        tone: "clear",
      },
      {
        label: "Lead conversation",
        detail: "Coach asked about equipment and schedule",
        tone: "action",
      },
      {
        label: "Approval",
        detail: "Assign to Hybrid Strength workspace",
        tone: "warning",
      },
    ],
  },
  {
    key: "coach",
    title: "Coach",
    caption: "Programs, nutrition, habits, messaging, and recurring check-ins.",
    screenTitle: "PT Hub weekly coaching overview",
    screenSubtitle: "Seeded clients, delivery queue, and check-in workload",
    facts: [
      "Program: Strength base",
      "Nutrition: Assigned",
      "Habits: 4 active",
      "Check-in: Friday recurring",
    ],
    metrics: [
      { label: "Active clients", value: "18" },
      { label: "Check-ins due", value: "6" },
      { label: "Unread replies", value: "3" },
    ],
    timeline: [
      {
        label: "Maya Chen",
        detail: "Program block 2, nutrition assigned, Friday check-in",
        tone: "clear",
      },
      {
        label: "Omar Patel",
        detail: "No reply after coach message",
        tone: "action",
      },
      {
        label: "Nina Brooks",
        detail: "Habit adherence dropped this week",
        tone: "warning",
      },
    ],
  },
  {
    key: "retain",
    title: "Retain",
    caption: "Client attention, lifecycle, overdue actions, and analytics.",
    screenTitle: "Client attention without lifecycle confusion",
    screenSubtitle: "Seeded retention signals and next coach actions",
    facts: [
      "Lifecycle: Active",
      "Attention: At risk",
      "Reason: Missed latest check-in",
      "Next step: Coach follow-up",
    ],
    metrics: [
      { label: "Clear", value: "12" },
      { label: "Needs attention", value: "4" },
      { label: "Manual flags", value: "2" },
    ],
    timeline: [
      {
        label: "Lifecycle: Active",
        detail: "Attention: At risk. Reason: Missed latest check-in",
        tone: "warning",
      },
      {
        label: "Lifecycle: Onboarding",
        detail: "Attention: Clear. Next step: Complete intake",
        tone: "clear",
      },
      {
        label: "Lifecycle: Active",
        detail: "Attention: Coach flag. Reason: Overdue work",
        tone: "action",
      },
    ],
  },
];

export type ComparisonCompetitor = "truecoach" | "fitr";

export type ComparisonRow = {
  topic: string;
  competitor: string;
  repsync: string;
};

export type ComparisonPageData = {
  competitorName: string;
  canonicalPath: string;
  lastReviewed: string;
  rows: ComparisonRow[];
  trademarkDisclaimer: string;
};

export const comparisonPages: Record<ComparisonCompetitor, ComparisonPageData> =
  {
    truecoach: {
      competitorName: "TrueCoach",
      canonicalPath: "/compare/truecoach",
      lastReviewed: "2026-07-11",
      trademarkDisclaimer:
        "TrueCoach and related names are trademarks of their respective owners. This page is not affiliated with or endorsed by TrueCoach.",
      rows: [
        {
          topic: "Operating model",
          competitor:
            "Often evaluated for coaching delivery and client management workflows.",
          repsync:
            "Connects the public profile, application, lead workflow, delivery, and attention signals.",
        },
        {
          topic: "Lead continuity",
          competitor: "Use your own current lead capture and sales process.",
          repsync:
            "Keeps application, conversation, approval, onboarding, and client assignment connected.",
        },
        {
          topic: "Client attention",
          competitor:
            "Assess the platform against your current follow-up workflow.",
          repsync:
            "Separates lifecycle from attention reasons like missed check-in, no reply, inactivity, or coach flag.",
        },
        {
          topic: "Workspace control",
          competitor:
            "Review available team controls against your operating needs.",
          repsync:
            "Supports owner, assistant coach, and viewer access patterns for controlled workspaces.",
        },
      ],
    },
    fitr: {
      competitorName: "FITR",
      canonicalPath: "/compare/fitr",
      lastReviewed: "2026-07-11",
      trademarkDisclaimer:
        "FITR and related names are trademarks of their respective owners. This page is not affiliated with or endorsed by FITR.",
      rows: [
        {
          topic: "Operating model",
          competitor:
            "Often evaluated for online coaching products and program delivery workflows.",
          repsync:
            "Connects acquisition, onboarding, client delivery, attention, and workspace visibility.",
        },
        {
          topic: "Public front door",
          competitor: "Review available public-facing options in FITR.",
          repsync:
            "Includes public coach profiles and applications tied to PT Hub lead workflow.",
        },
        {
          topic: "Check-in rhythm",
          competitor:
            "Assess check-in behavior against the cadence your business needs.",
          repsync:
            "Supports recurring check-ins as part of the client relationship timeline.",
        },
        {
          topic: "Team operations",
          competitor: "Review team and account controls for your setup.",
          repsync:
            "Surfaces team roles, assigned clients, and workspace performance in the same operating layer.",
        },
      ],
    },
  };

export function getComparisonPageData(competitor: ComparisonCompetitor) {
  return comparisonPages[competitor];
}

export type MarketingRouteMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
};

export const marketingRouteMetadata: Record<string, MarketingRouteMetadata> = {
  "/": {
    title: "RepSync | Run the whole coaching business",
    description:
      "RepSync is a coaching operating system for public profiles, applications, client delivery, attention cues, and workspace visibility.",
    canonicalPath: "/",
  },
  "/product": {
    title: "Product | RepSync",
    description:
      "See how RepSync connects coach profiles, applications, PT Hub delivery, client workspaces, and retention attention cues.",
    canonicalPath: "/product",
  },
  "/for-coaches": {
    title: "For Coaches | RepSync",
    description:
      "RepSync helps coaches publish profiles, manage applications, deliver coaching, and keep client attention organized.",
    canonicalPath: "/for-coaches",
  },
  "/for-clients": {
    title: "For Clients | RepSync",
    description:
      "RepSync helps coaching clients find coaches, apply from public profiles, and understand the next action once coaching starts.",
    canonicalPath: "/for-clients",
  },
  "/switch": {
    title: "Switch to RepSync",
    description:
      "Tell RepSync what you are switching from and what workflows matter most so the early access team can help you evaluate fit.",
    canonicalPath: "/switch",
  },
  "/compare/truecoach": {
    title: "RepSync vs TrueCoach",
    description:
      "Compare RepSync's connected coaching workflow with TrueCoach when planning a platform switch.",
    canonicalPath: "/compare/truecoach",
  },
  "/compare/fitr": {
    title: "RepSync vs FITR",
    description:
      "Compare RepSync's connected coaching workflow with FITR when planning a platform switch.",
    canonicalPath: "/compare/fitr",
  },
  "/faq": {
    title: "FAQ | RepSync",
    description:
      "Answers about RepSync early access, coach marketplace profiles, switching tools, pricing, and product status.",
    canonicalPath: "/faq",
  },
  "/security": {
    title: "Security | RepSync",
    description:
      "RepSync security notes for early access: account-based access, Supabase-backed data, and no unsupported compliance claims.",
    canonicalPath: "/security",
  },
  "/request-access": {
    title: "Request Early Access | RepSync",
    description:
      "Request early access to RepSync for your coaching business or small coaching team.",
    canonicalPath: "/request-access",
  },
  "/privacy": {
    title: "Privacy | RepSync",
    description: "RepSync privacy notice for public and app users.",
    canonicalPath: "/privacy",
  },
  "/terms": {
    title: "Terms | RepSync",
    description: "RepSync terms for public and app users.",
    canonicalPath: "/terms",
  },
  "/cookies": {
    title: "Cookies | RepSync",
    description:
      "RepSync cookie notice for the public marketing website and application.",
    canonicalPath: "/cookies",
  },
};
