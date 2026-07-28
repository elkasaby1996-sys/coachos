import {
  clientLifecycleStates,
  type ClientLifecycleState,
} from "./client-lifecycle";
import {
  marketingFeatureAvailability,
  type MarketingFeatureKey,
} from "./marketing-public";

export const productPageRoutes = {
  trial: "/start-trial",
  forCoaches: "/for-coaches",
  product: "/product",
} as const;

export const productMediaIds = [
  "UI-02-public-profile",
  "UI-03-lead-pipeline",
  "UI-onboarding",
  "UI-05-program-assignment",
  "UI-06-nutrition",
  "UI-habits",
  "UI-lead-chat",
  "UI-client-messaging",
  "UI-07-checkin",
  "UI-04-client-attention",
  "UI-01-pt-hub",
  "UI-08-client-home",
  "UI-10-team-access",
  "UI-integrations",
] as const;

export type ProductMediaId = (typeof productMediaIds)[number];

export type ProductMediaAsset = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

export const productMediaAssets: Partial<
  Record<ProductMediaId, ProductMediaAsset>
> = {
  "UI-03-lead-pipeline": {
    src: "/media/repsync-workflow-poster.png",
    width: 960,
    height: 660,
    alt: "RepSync light-mode workflow showing a prospect moving through lead review, onboarding, coaching delivery, and client attention.",
  },
  "UI-08-client-home": {
    src: "/media/repsync-client-experience-poster.png",
    width: 960,
    height: 660,
    alt: "RepSync mobile client home showing today's workout, nutrition guidance, habits, check-in, messages, progress, and an active workout timer.",
  },
};

export type ProductChapterId =
  | "acquire"
  | "onboard"
  | "training"
  | "nutrition-habits"
  | "messaging"
  | "check-ins"
  | "client-attention"
  | "operations-analytics"
  | "client-experience"
  | "team-access"
  | "integrations";

export type ProductChapterVariant =
  | "acquire"
  | "onboarding"
  | "training"
  | "nutrition_habits"
  | "messaging"
  | "checkins"
  | "attention"
  | "operations"
  | "client_home"
  | "team"
  | "integrations";

export type ProductChapterContent = {
  id: ProductChapterId;
  number: string;
  navLabel: string;
  eyebrow: string;
  heading: string;
  body: string;
  supportingCopy: string;
  mediaId: ProductMediaId;
  mediaPosition: "left" | "right" | "center";
  availabilityRequirements: MarketingFeatureKey[];
  featureList?: string[];
  componentVariant: ProductChapterVariant;
};

export type MarketingIntegrationStatus =
  | "available"
  | "beta"
  | "coming_soon"
  | "hidden";

export type MarketingIntegration = {
  id: string;
  name: string;
  category: "wearable" | "calendar" | "business" | "storage" | "developer";
  status: MarketingIntegrationStatus;
  publicDescription: string;
  public: boolean;
};

export const marketingIntegrations: MarketingIntegration[] = [
  {
    id: "whoop",
    name: "WHOOP",
    category: "wearable",
    status: "hidden",
    publicDescription:
      "Selected wearable context alongside client coaching data.",
    public: false,
  },
  {
    id: "garmin",
    name: "Garmin",
    category: "wearable",
    status: "hidden",
    publicDescription:
      "Selected wearable context alongside client coaching data.",
    public: false,
  },
  {
    id: "calendar",
    name: "Calendar connection",
    category: "calendar",
    status: "hidden",
    publicDescription: "Schedule context for coaching appointments.",
    public: false,
  },
  {
    id: "payments",
    name: "Payment provider",
    category: "business",
    status: "hidden",
    publicDescription: "Business payment connection.",
    public: false,
  },
];

export function getPublicMarketingIntegrations(
  integrations: MarketingIntegration[] = marketingIntegrations,
) {
  return integrations.filter(
    (integration) => integration.public && integration.status !== "hidden",
  );
}

export const productLifecycleValues: Array<{
  value: ClientLifecycleState;
  label: string;
}> = clientLifecycleStates.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

export const productRoleLabels = [
  "Owner",
  "Admin",
  "Coach",
  "Assistant coach",
  "Viewer",
] as const;

export const productPageContent = {
  metadata: {
    title: "RepSync Product | The Whole Coaching Relationship",
    description:
      "Explore how RepSync connects public profiles, leads, onboarding, training, nutrition, habits, messaging, check-ins, client attention, operations, team access, integrations, and the client experience.",
    canonicalPath: productPageRoutes.product,
    openGraphTitle: "The Whole Coaching Relationship, Connected | RepSync",
    openGraphDescription:
      "Follow the RepSync product from first inquiry through coaching delivery, check-ins, communication, client attention, team access, and supported integrations.",
  },
  hero: {
    eyebrow: "The product",
    heading: "The Whole Coaching Relationship, Connected.",
    emphasizedText: "Coaching Relationship",
    body: "RepSync connects acquisition, onboarding, training, nutrition, habits, messaging, check-ins, client attention, operations, team access, integrations, and the client experience.",
    supportingCopy:
      "One operating model from first inquiry to ongoing coaching.",
  },
  sidebarCta: {
    body: "Explore the complete RepSync workflow for seven days.",
    label: "Start 7-day trial",
    destination: productPageRoutes.trial,
    microcopy: "No card required. Start with Growth access.",
  },
  chapters: [
    {
      id: "acquire",
      number: "01",
      navLabel: "Acquire",
      eyebrow: "01 Acquire",
      heading: "Turn Interest into a Coaching Relationship.",
      body: "Publish a professional coach profile, collect applications, keep the conversation attached to the lead, and decide who moves forward.",
      supportingCopy:
        "Keep the application, conversation, and decision attached to the coaching relationship that follows.",
      mediaId: "UI-03-lead-pipeline",
      mediaPosition: "right",
      availabilityRequirements: [
        "publicCoachProfiles",
        "publicApplications",
        "leadWorkflow",
      ],
      featureList: [
        "Public coach profile",
        "Public application form",
        "Lead record",
        "Lead conversation",
        "Approval or decline",
        "Handoff toward onboarding",
      ],
      componentVariant: "acquire",
    },
    {
      id: "onboard",
      number: "02",
      navLabel: "Onboard",
      eyebrow: "02 Onboard",
      heading: "Start Each Client with the Right Context.",
      body: "Move an approved lead into the appropriate workspace, invite the client, and configure the starting coaching relationship.",
      supportingCopy:
        "The original lead context remains available as active coaching begins.",
      mediaId: "UI-onboarding",
      mediaPosition: "center",
      availabilityRequirements: ["coachingWorkspaces", "coachClientAccounts"],
      componentVariant: "onboarding",
    },
    {
      id: "training",
      number: "03",
      navLabel: "Training",
      eyebrow: "03 Training",
      heading: "Deliver the Training Plan Without Losing the Client Context.",
      body: "Build reusable training material, assign the appropriate program, and keep each client's delivered schedule clear as coaching continues.",
      supportingCopy:
        "Reusable material helps the coach work efficiently. Assigned content keeps the client's actual plan stable and clear.",
      mediaId: "UI-05-program-assignment",
      mediaPosition: "right",
      availabilityRequirements: ["programs"],
      featureList: [
        "Reusable program templates",
        "Assigned client program",
        "Weeks or phases",
        "Scheduled sessions",
        "Exercise details",
        "Completion state",
        "Client-specific assigned version",
      ],
      componentVariant: "training",
    },
    {
      id: "nutrition-habits",
      number: "04",
      navLabel: "Nutrition & Habits",
      eyebrow: "04 Nutrition & Habits",
      heading: "Coach the Work That Happens Outside the Workout.",
      body: "Keep nutrition guidance, daily targets, and repeatable habits connected to the same coaching relationship as the training plan.",
      supportingCopy:
        "The coach can see the plan, the daily actions supporting it, and the client's recent context without moving between separate tools.",
      mediaId: "UI-06-nutrition",
      mediaPosition: "left",
      availabilityRequirements: ["nutritionAssignments", "habits"],
      componentVariant: "nutrition_habits",
    },
    {
      id: "messaging",
      number: "05",
      navLabel: "Messaging",
      eyebrow: "05 Messaging",
      heading: "Keep Every Conversation Attached to the Right Relationship.",
      body: "Speak with prospects before approval and communicate with clients after coaching begins, without mixing lead conversations with workspace coaching messages.",
      supportingCopy:
        "The prospect conversation remains part of the lead record. The coaching conversation remains part of the client relationship.",
      mediaId: "UI-client-messaging",
      mediaPosition: "right",
      availabilityRequirements: ["leadWorkflow", "messaging"],
      componentVariant: "messaging",
    },
    {
      id: "check-ins",
      number: "06",
      navLabel: "Check-ins",
      eyebrow: "06 Check-ins",
      heading: "Structured Check-ins. Clear Review. Defined Follow-up.",
      body: "Run recurring check-ins, collect the client's response, review what has changed, add coaching feedback, and see what still needs action.",
      supportingCopy:
        "Cadence, client response, coach review, and follow-up remain part of the same coaching record.",
      mediaId: "UI-07-checkin",
      mediaPosition: "center",
      availabilityRequirements: ["recurringCheckins"],
      componentVariant: "checkins",
    },
    {
      id: "client-attention",
      number: "07",
      navLabel: "Client Attention",
      eyebrow: "07 Client Attention",
      heading: "See Who Needs Attention, and Why.",
      body: "RepSync separates lifecycle from attention, so an active client can still require review when a specific signal changes.",
      supportingCopy:
        "RepSync surfaces the reason. The coach decides what happens next.",
      mediaId: "UI-04-client-attention",
      mediaPosition: "right",
      availabilityRequirements: ["lifecycle", "clientAttentionSignals"],
      componentVariant: "attention",
    },
    {
      id: "operations-analytics",
      number: "08",
      navLabel: "Operations & Analytics",
      eyebrow: "08 Operations & Analytics",
      heading: "See the Coaching Work and the Business Around It.",
      body: "Review leads, client activity, overdue check-ins, lifecycle, client-attention signals, and workspace performance from PT Hub.",
      supportingCopy:
        "The purpose is not another dashboard. It is a clearer starting point for the next decision.",
      mediaId: "UI-01-pt-hub",
      mediaPosition: "left",
      availabilityRequirements: ["ptHubAnalytics", "leadWorkflow"],
      featureList: [
        "New leads and applications",
        "Active clients",
        "Overdue check-ins",
        "Clients requiring attention",
        "Lifecycle distribution",
        "Workspace activity",
      ],
      componentVariant: "operations",
    },
    {
      id: "client-experience",
      number: "09",
      navLabel: "Client Experience",
      eyebrow: "09 Client Experience",
      heading: "A Client Home Built Around What Comes Next.",
      body: "Clients see their assigned training, nutrition guidance, habits, next check-in, messages, and progress without seeing the operational layer behind the coaching.",
      supportingCopy:
        "The coach keeps the operational context. The client gets a clear next action.",
      mediaId: "UI-08-client-home",
      mediaPosition: "left",
      availabilityRequirements: ["coachClientAccounts"],
      featureList: [
        "Today's workout",
        "Nutrition target or guidance",
        "Active habits",
        "Next check-in",
        "Latest coach message",
        "Progress context",
      ],
      componentVariant: "client_home",
    },
    {
      id: "team-access",
      number: "10",
      navLabel: "Team Access",
      eyebrow: "10 Team Access",
      heading: "Bring in Support Without Giving Away Control.",
      body: "Organize workspace members, assign client responsibility, and keep access connected to each person's role.",
      supportingCopy:
        "PT Hub controls the coach's business account and cross-workspace view. Each workspace controls its own team, clients, delivery defaults, and client-facing experience.",
      mediaId: "UI-10-team-access",
      mediaPosition: "right",
      availabilityRequirements: ["teamRolesPermissions"],
      componentVariant: "team",
    },
    {
      id: "integrations",
      number: "11",
      navLabel: "Integrations",
      eyebrow: "11 Integrations",
      heading: "Bring Supported Data Into the Coaching Context.",
      body: "Connect supported services so relevant client information can sit alongside the coaching plan, check-ins, messages, and progress.",
      supportingCopy:
        "Supported integrations add context. They do not replace the coach's professional judgment.",
      mediaId: "UI-integrations",
      mediaPosition: "left",
      availabilityRequirements: [],
      componentVariant: "integrations",
    },
  ] satisfies ProductChapterContent[],
  finalCta: {
    eyebrow: "7-day Growth trial",
    heading: "Explore the Whole Coaching Relationship for 7 Days.",
    body: "Use acquisition, onboarding, training, nutrition, habits, messaging, check-ins, client attention, operations, team access, supported integrations, and the client experience.",
    primaryLabel: "Start 7-day trial",
    primaryDestination: productPageRoutes.trial,
    secondaryLabel: "Explore for coaches",
    secondaryDestination: productPageRoutes.forCoaches,
    microcopy: "No card required. Begin with Growth access.",
  },
} as const;

export function isProductChapterAvailable(chapter: ProductChapterContent) {
  return chapter.availabilityRequirements.every(
    (requirement) =>
      marketingFeatureAvailability[requirement].status === "available" ||
      marketingFeatureAvailability[requirement].status === "beta",
  );
}

export const visibleProductChapters = productPageContent.chapters.filter(
  isProductChapterAvailable,
);
