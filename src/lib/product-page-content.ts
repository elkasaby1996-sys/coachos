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
  kind?: "image" | "video";
  src: string;
  width: number;
  height: number;
  alt: string;
  poster?: string;
};

export const productMediaAssets: Partial<
  Record<ProductMediaId, ProductMediaAsset>
> = {
  "UI-03-lead-pipeline": {
    kind: "video",
    src: "/media/repsync-public-coach-profiles.webm",
    poster: "/media/repsync-public-coach-profiles-poster.png",
    width: 960,
    height: 660,
    alt: "A RepSync product walkthrough: browse published coach profiles, review a profile, choose a coaching option, and start an application.",
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
    publicDescription: "Selected wearable data shown with the client account.",
    public: false,
  },
  {
    id: "garmin",
    name: "Garmin",
    category: "wearable",
    status: "hidden",
    publicDescription: "Selected wearable data shown with the client account.",
    public: false,
  },
  {
    id: "calendar",
    name: "Calendar connection",
    category: "calendar",
    status: "hidden",
    publicDescription: "Appointment scheduling data for coaches and clients.",
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
    title: "RepSync product | Coaching software for trainers",
    description:
      "Review how RepSync handles applications, onboarding, training, nutrition, habits, messages, check-ins, client follow-up, operations, and team access.",
    canonicalPath: productPageRoutes.product,
    openGraphTitle: "Run your client workflow in RepSync",
    openGraphDescription:
      "See how RepSync manages applications, client setup, coaching delivery, check-ins, messages, follow-up, and workspace access.",
  },
  hero: {
    eyebrow: "The product",
    heading: "Run your client workflow in RepSync.",
    emphasizedText: "client workflow",
    body: "Publish your profile, review applicants, onboard clients, assign plans, run check-ins, send messages, and manage team access from the same account.",
    supportingCopy:
      "Client details remain available as the work moves from one stage to the next.",
  },
  chapters: [
    {
      id: "acquire",
      number: "01",
      navLabel: "Acquire",
      eyebrow: "01 Acquire",
      heading: "Manage applications and approvals.",
      body: "Publish your coach profile, collect applications, review prospect messages, and approve the people you want to coach.",
      supportingCopy:
        "Application answers, messages, and the decision remain on the lead record during onboarding.",
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
      heading: "Set up the client account.",
      body: "Move an approved lead into a workspace, invite the client, and add their starting plan, habits, and check-in schedule.",
      supportingCopy:
        "Application answers and lead messages remain available after onboarding begins.",
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
      heading: "Build programs and assign the client's schedule.",
      body: "Create reusable program templates, assign the appropriate version, and manage each client's scheduled sessions.",
      supportingCopy:
        "Templates support repeatable programming, while the assigned version records what the client received.",
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
      heading: "Manage nutrition guidance and habits.",
      body: "Set nutrition guidance, daily targets, and recurring habits beside the client's training plan.",
      supportingCopy:
        "Coaches can review assigned work and recent completion from the client workspace.",
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
      heading: "Keep lead and client conversations organized.",
      body: "Use lead conversations before approval and workspace messages after the client begins coaching.",
      supportingCopy:
        "Each thread stays with the appropriate lead or client account.",
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
      heading: "Run recurring check-ins and track each review.",
      body: "Schedule check-ins, collect responses, add coach feedback, and mark any required follow-up.",
      supportingCopy:
        "Due dates, responses, review status, and follow-up remain on the check-in record.",
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
      heading: "See which clients need follow-up.",
      body: "Attention status can flag an active client when a check-in is missed, a reply is overdue, or recent activity changes.",
      supportingCopy: "Each alert includes the reason for the coach to review.",
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
      heading: "Start with the work that needs attention.",
      body: "PT Hub shows new leads, client activity, overdue check-ins, lifecycle, attention status, and workspace performance.",
      supportingCopy:
        "Current priorities appear together in one starting view.",
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
      heading: "Show clients today's plan.",
      body: "The client home shows assigned training, nutrition guidance, habits, the next check-in, messages, and progress.",
      supportingCopy:
        "Clients see assigned work and progress. Coaches manage scheduling, history, and follow-up in the workspace.",
      mediaId: "UI-08-client-home",
      mediaPosition: "left",
      availabilityRequirements: ["coachClientAccounts"],
      featureList: [
        "Today's workout",
        "Nutrition target or guidance",
        "Active habits",
        "Next check-in",
        "Latest coach message",
        "Progress history",
      ],
      componentVariant: "client_home",
    },
    {
      id: "team-access",
      number: "10",
      navLabel: "Team Access",
      eyebrow: "10 Team Access",
      heading: "Set access for every workspace role.",
      body: "Add team members, assign client visibility by responsibility, and reserve owner actions for the account owner.",
      supportingCopy:
        "PT Hub provides the account-wide view. Each workspace has its own team, clients, delivery defaults, and client settings.",
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
      heading: "Add verified integrations as they become available.",
      body: "Supported services can add selected client data to the workspace.",
      supportingCopy:
        "Only integrations with a verified public availability status appear here.",
      mediaId: "UI-integrations",
      mediaPosition: "left",
      availabilityRequirements: [],
      componentVariant: "integrations",
    },
  ] satisfies ProductChapterContent[],
  finalCta: {
    eyebrow: "7-day trial",
    heading: "Use the Growth plan free for seven days.",
    body: "The trial includes client acquisition, coaching delivery, messages, check-ins, client attention, team access, and the client app.",
    primaryLabel: "Start 7-day trial",
    primaryDestination: productPageRoutes.trial,
    secondaryLabel: "Explore for coaches",
    secondaryDestination: productPageRoutes.forCoaches,
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
  (chapter) =>
    isProductChapterAvailable(chapter) &&
    (chapter.id !== "integrations" ||
      getPublicMarketingIntegrations().length > 0),
);
