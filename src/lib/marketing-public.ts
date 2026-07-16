export type MarketingFeatureAvailability =
  | "available"
  | "beta"
  | "coming_soon"
  | "not_available";

export type MarketingSignupMode = "request_access" | "direct_signup";

export const marketingSignupMode: MarketingSignupMode = "request_access";

export type MarketingAudience = "coach" | "client" | "team" | "business";

export type MarketingFeatureCategory =
  | "acquire"
  | "onboard"
  | "deliver"
  | "communicate"
  | "retain"
  | "operate"
  | "client_experience";

export type MarketingPreviewId =
  | "pt_hub"
  | "public_profile"
  | "application"
  | "lead_pipeline"
  | "client_detail"
  | "program_assignment"
  | "nutrition_assignment"
  | "checkin"
  | "client_attention"
  | "client_home"
  | "team_permissions";

export type MarketingFeature = {
  id: string;
  title: string;
  shortDescription: string;
  longDescription?: string;
  availability: MarketingFeatureAvailability;
  audiences: MarketingAudience[];
  category: MarketingFeatureCategory;
  screenshotId?: MarketingPreviewId;
  route?: string;
  note?: string;
};

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
      : "/book-demo";
  }
  if (intent === "switch") return "/switch";
  if (intent === "product") return "/product";
  return "/login";
}

export type ProductPreviewGroup = {
  key: "acquire" | "coach" | "retain" | MarketingPreviewId;
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
  {
    key: "pt_hub",
    title: "PT Hub",
    caption: "Marketing demonstration preview of PT Hub operating visibility.",
    screenTitle: "PT Hub operating view",
    screenSubtitle:
      "Leads, active clients, overdue check-ins, attention, and workspace performance",
    facts: [
      "New leads visible",
      "Active clients grouped by workspace",
      "Overdue check-ins surfaced",
      "Attention reasons ready for review",
    ],
    metrics: [
      { label: "Leads", value: "New" },
      { label: "Clients", value: "Active" },
      { label: "Check-ins", value: "Due" },
    ],
    timeline: [
      {
        label: "Lead pipeline",
        detail: "Applications and conversations awaiting coach review",
        tone: "action",
      },
      {
        label: "Client workload",
        detail: "Active clients, overdue check-ins, and lifecycle visibility",
        tone: "warning",
      },
      {
        label: "Workspace performance",
        detail: "Neutral operating labels without invented public metrics",
        tone: "clear",
      },
    ],
  },
  {
    key: "public_profile",
    title: "Profile",
    caption:
      "Marketing demonstration preview of a published public coach profile.",
    screenTitle: "Public coach profile",
    screenSubtitle:
      "Published profile, coaching modes, specialties, and application CTA",
    facts: [
      "Profile: Published",
      "Mode: Online and in-person",
      "CTA: Apply to coaching",
      "Visibility: Controlled from PT Hub",
    ],
    metrics: [
      { label: "Profile status", value: "Live" },
      { label: "Modes", value: "2" },
      { label: "CTA", value: "Apply" },
    ],
    timeline: [
      {
        label: "Headline",
        detail: "Strength coaching for busy professionals",
        tone: "clear",
      },
      {
        label: "Specialties",
        detail: "Strength, accountability, nutrition",
        tone: "clear",
      },
      {
        label: "Application",
        detail: "Prospects submit goals and context",
        tone: "action",
      },
    ],
  },
  {
    key: "application",
    title: "Application",
    caption: "Marketing demonstration preview of the public application path.",
    screenTitle: "Application submission",
    screenSubtitle: "Prospect context becomes a lead record for review",
    facts: [
      "Goal summary collected",
      "Training experience captured",
      "Package interest optional",
      "Lead source retained",
    ],
    metrics: [
      { label: "Status", value: "New" },
      { label: "Source", value: "Profile" },
      { label: "Next", value: "Review" },
    ],
    timeline: [
      {
        label: "Application",
        detail: "Prospect submits coaching goals",
        tone: "clear",
      },
      {
        label: "Lead",
        detail: "Coach reviews fit before approval",
        tone: "action",
      },
      {
        label: "Decision",
        detail: "Approve, continue conversation, or decline",
        tone: "warning",
      },
    ],
  },
  {
    key: "lead_pipeline",
    title: "Pipeline",
    caption: "Marketing demonstration preview of lead review and approval.",
    screenTitle: "Lead pipeline",
    screenSubtitle: "Applications, conversations, and approval decisions",
    facts: [
      "Lead: New",
      "Conversation: Open",
      "Approval: Pending workspace",
      "Decline path available",
    ],
    metrics: [
      { label: "New leads", value: "4" },
      { label: "Contacted", value: "3" },
      { label: "Ready", value: "1" },
    ],
    timeline: [
      {
        label: "Maya R.",
        detail: "Asked about schedule and equipment",
        tone: "action",
      },
      {
        label: "Jordan S.",
        detail: "Approved pending workspace assignment",
        tone: "warning",
      },
      {
        label: "Priya K.",
        detail: "Converted to active client",
        tone: "clear",
      },
    ],
  },
  {
    key: "client_detail",
    title: "Client",
    caption: "Marketing demonstration preview of a client setup workspace.",
    screenTitle: "Client detail",
    screenSubtitle: "Onboarding state, delivery assignments, and context",
    facts: [
      "Lifecycle: Onboarding",
      "Program: Assigned",
      "Nutrition: Assigned",
      "Check-in: Weekly",
    ],
    metrics: [
      { label: "Setup", value: "4/5" },
      { label: "Cadence", value: "Fri" },
      { label: "Access", value: "Team" },
    ],
    timeline: [
      {
        label: "Invite accepted",
        detail: "Client account connected to workspace",
        tone: "clear",
      },
      {
        label: "Starting setup",
        detail: "Program, nutrition, habits, and check-in cadence",
        tone: "action",
      },
      {
        label: "Next step",
        detail: "Complete intake before first review",
        tone: "warning",
      },
    ],
  },
  {
    key: "program_assignment",
    title: "Program",
    caption: "Marketing demonstration preview of assigned training work.",
    screenTitle: "Program assignment",
    screenSubtitle:
      "Reusable templates stay distinct from assigned client work",
    facts: [
      "Template: Strength base",
      "Assignment: Client-specific block",
      "Workout: Today",
      "Progress: Coach review",
    ],
    metrics: [
      { label: "Weeks", value: "6" },
      { label: "Sessions", value: "4" },
      { label: "Status", value: "Live" },
    ],
    timeline: [
      {
        label: "Template",
        detail: "Reusable program structure",
        tone: "clear",
      },
      {
        label: "Assignment",
        detail: "Current block attached to one client",
        tone: "action",
      },
      {
        label: "Coach review",
        detail: "Progress and context stay together",
        tone: "clear",
      },
    ],
  },
  {
    key: "nutrition_assignment",
    title: "Nutrition",
    caption: "Marketing demonstration preview of nutrition guidance.",
    screenTitle: "Nutrition assignment",
    screenSubtitle: "Goals and guidance remain visible beside coaching work",
    facts: [
      "Goal: Protein target",
      "Guidance: Assigned",
      "Review: Weekly",
      "Context: Client workspace",
    ],
    metrics: [
      { label: "Targets", value: "3" },
      { label: "Review", value: "Fri" },
      { label: "Status", value: "Live" },
    ],
    timeline: [
      {
        label: "Guidance",
        detail: "Simple nutrition targets assigned",
        tone: "clear",
      },
      {
        label: "Check-in",
        detail: "Coach reviews adherence context",
        tone: "action",
      },
      {
        label: "Adjustment",
        detail: "Update guidance from the workspace",
        tone: "warning",
      },
    ],
  },
  {
    key: "checkin",
    title: "Check-in",
    caption: "Marketing demonstration preview of a recurring check-in.",
    screenTitle: "Recurring check-ins",
    screenSubtitle: "Cadence, response, overdue state, and coach follow-up",
    facts: [
      "Cadence: Weekly",
      "Latest: Due Friday",
      "Overdue state visible",
      "Coach follow-up attached",
    ],
    metrics: [
      { label: "Due", value: "6" },
      { label: "Overdue", value: "2" },
      { label: "Reviewed", value: "9" },
    ],
    timeline: [
      {
        label: "Friday check-in",
        detail: "Client submits weekly context",
        tone: "clear",
      },
      {
        label: "Overdue",
        detail: "Missed latest check-in becomes an attention reason",
        tone: "warning",
      },
      {
        label: "Review",
        detail: "Coach response stays with the relationship",
        tone: "action",
      },
    ],
  },
  {
    key: "client_attention",
    title: "Attention",
    caption:
      "Marketing demonstration preview of lifecycle and attention states.",
    screenTitle: "Client attention",
    screenSubtitle: "Lifecycle stays separate from coach attention reasons",
    facts: [
      "Lifecycle: Active",
      "Attention: At risk",
      "Reason: Missed latest check-in",
      "Action: Coach follow-up",
    ],
    metrics: [
      { label: "Active", value: "18" },
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
        label: "Lifecycle: Paused",
        detail: "Attention: Clear. Review pause reason",
        tone: "action",
      },
    ],
  },
  {
    key: "client_home",
    title: "Client home",
    caption: "Marketing demonstration preview of the private client home.",
    screenTitle: "Today in coaching",
    screenSubtitle:
      "Workout, nutrition, habits, check-in, messages, and progress",
    facts: [
      "Workout: Lower strength",
      "Nutrition: Protein target",
      "Habits: 3 active",
      "Message: Coach reply",
    ],
    metrics: [
      { label: "Today", value: "3" },
      { label: "Habits", value: "3" },
      { label: "Check-in", value: "Fri" },
    ],
    timeline: [
      {
        label: "Workout",
        detail: "Lower strength session ready",
        tone: "clear",
      },
      {
        label: "Nutrition",
        detail: "Review protein and hydration goals",
        tone: "action",
      },
      {
        label: "Message",
        detail: "Coach replied with next step",
        tone: "clear",
      },
    ],
  },
  {
    key: "team_permissions",
    title: "Team",
    caption:
      "Marketing demonstration preview of workspace roles and assignment scope.",
    screenTitle: "Workspace team access",
    screenSubtitle: "Owner, assistant coach, viewer, and assigned-client scope",
    facts: [
      "Owner: Workspace control",
      "Assistant coach: Client work",
      "Viewer: Read-oriented access",
      "Scope: Assigned clients supported",
    ],
    metrics: [
      { label: "Roles", value: "3" },
      { label: "Scope", value: "Client" },
      { label: "Status", value: "Active" },
    ],
    timeline: [
      {
        label: "Owner",
        detail: "Manages workspace and team access",
        tone: "clear",
      },
      {
        label: "Assistant coach",
        detail: "Works assigned clients without owner controls",
        tone: "action",
      },
      {
        label: "Viewer",
        detail: "Reviews context with read-oriented permissions",
        tone: "clear",
      },
    ],
  },
];

export const marketingProductFeatures: MarketingFeature[] = [
  {
    id: "public_profile",
    title: "Public coach profile",
    shortDescription:
      "Publish coaching information and an application path from PT Hub.",
    longDescription:
      "Coaches can present services, specialties, coaching modes, and a public application route without exposing private workspace data.",
    availability: marketingFeatureAvailability.publicCoachProfiles.status,
    audiences: ["coach", "business"],
    category: "acquire",
    screenshotId: "public_profile",
    route: "/coaches",
  },
  {
    id: "application_lead",
    title: "Application to lead workflow",
    shortDescription:
      "Turn profile interest into a lead record, conversation, and decision.",
    longDescription:
      "RepSync supports public application submission, lead review, lead messaging, approval or decline, and workspace assignment after approval.",
    availability: marketingFeatureAvailability.leadWorkflow.status,
    audiences: ["coach", "business"],
    category: "acquire",
    screenshotId: "lead_pipeline",
  },
  {
    id: "onboarding_setup",
    title: "Client onboarding setup",
    shortDescription:
      "Configure the client's starting setup from one connected workspace.",
    longDescription:
      "Accepted clients can be invited into a workspace, then set up with program, nutrition, habits, and check-in cadence. RepSync does not market every step as fully automated.",
    availability: marketingFeatureAvailability.coachClientAccounts.status,
    audiences: ["coach", "client"],
    category: "onboard",
    screenshotId: "client_detail",
  },
  {
    id: "program_delivery",
    title: "Programs and assigned work",
    shortDescription:
      "Create coaching work and attach current assignments to clients.",
    longDescription:
      "Reusable templates and assigned client content are presented as distinct concepts so marketing does not imply unsupported automatic updates to existing assignments.",
    availability: marketingFeatureAvailability.programs.status,
    audiences: ["coach", "client"],
    category: "deliver",
    screenshotId: "program_assignment",
  },
  {
    id: "nutrition_habits_checkins",
    title: "Nutrition, habits, and check-ins",
    shortDescription: "Keep weekly coaching context beside the training plan.",
    longDescription:
      "Nutrition assignments, habits, recurring check-ins, overdue states, and review context are part of the coaching delivery surface.",
    availability: marketingFeatureAvailability.recurringCheckins.status,
    audiences: ["coach", "client"],
    category: "deliver",
    screenshotId: "checkin",
  },
  {
    id: "messaging",
    title: "Lead and client messaging",
    shortDescription:
      "Keep conversations connected to the right coaching relationship.",
    longDescription:
      "RepSync markets in-app lead and client messaging only. Attachments, voice notes, video calls, WhatsApp sync, email sequences, and push notifications are not marketed as available.",
    availability: marketingFeatureAvailability.messaging.status,
    audiences: ["coach", "client", "team"],
    category: "communicate",
  },
  {
    id: "client_attention",
    title: "Client lifecycle and attention",
    shortDescription:
      "See who needs attention and why without turning risk into a lifecycle state.",
    longDescription:
      "Lifecycle values are invited, onboarding, active, paused, completed, and churned. Attention reasons include missed latest check-in, no recent reply, adherence trending down, client inactivity, overdue action, and manual coach flag.",
    availability: marketingFeatureAvailability.clientAttentionSignals.status,
    audiences: ["coach", "team", "business"],
    category: "retain",
    screenshotId: "client_attention",
  },
  {
    id: "pt_hub_analytics",
    title: "PT Hub visibility",
    shortDescription:
      "Review leads, active clients, overdue work, at-risk clients, and workspace performance.",
    longDescription:
      "PT Hub analytics and operational views help coaches review the business and the coaching workload together without invented public performance claims.",
    availability: marketingFeatureAvailability.ptHubAnalytics.status,
    audiences: ["coach", "business", "team"],
    category: "operate",
    screenshotId: "pt_hub",
  },
  {
    id: "client_home",
    title: "Client home",
    shortDescription: "Give clients one clear place for today's coaching work.",
    longDescription:
      "Clients can see their own workout, nutrition guidance, habits, check-ins, messages, progress, and supported wearable context without seeing coach business analytics or other clients.",
    availability: marketingFeatureAvailability.coachClientAccounts.status,
    audiences: ["client"],
    category: "client_experience",
    screenshotId: "client_home",
  },
  {
    id: "team_permissions",
    title: "Small-team workspaces",
    shortDescription:
      "Structure owner, assistant coach, viewer, and assigned-client access.",
    longDescription:
      "Workspace roles and assigned-client scope support small-team collaboration without marketing enterprise permission builders or unlimited staffing models.",
    availability: marketingFeatureAvailability.teamRolesPermissions.status,
    audiences: ["coach", "team", "business"],
    category: "operate",
    screenshotId: "team_permissions",
  },
  {
    id: "whoop_context",
    title: "WHOOP context",
    shortDescription:
      "Wearable context is marked coming soon rather than sold as broad wearable support.",
    availability: marketingFeatureAvailability.whoopData.status,
    audiences: ["coach", "client"],
    category: "client_experience",
    note: "Garmin and broad wearable migration are not marketed as available.",
  },
  {
    id: "public_marketplace",
    title: "Coach marketplace",
    shortDescription:
      "Published profiles can appear in a public coach directory while the marketplace remains beta-positioned.",
    availability: marketingFeatureAvailability.publicMarketplace.status,
    audiences: ["coach", "client"],
    category: "acquire",
    route: "/coaches",
    note: "The client page treats discovery honestly and does not render fake coach cards.",
  },
];

export const unavailableMarketingCapabilities = [
  marketingFeatureAvailability.automatedBilling,
  marketingFeatureAvailability.nativeMobileApps,
  marketingFeatureAvailability.automatedMigration,
  marketingFeatureAvailability.garmin,
  marketingFeatureAvailability.messageAttachments,
];

export type TrustClaimStatus = "verified" | "planned" | "not_applicable";

export type TrustClaim = {
  id: string;
  title: string;
  description: string;
  status: TrustClaimStatus;
  evidenceReference?: string;
  public: boolean;
};

export const trustClaims: TrustClaim[] = [
  {
    id: "supabase_auth",
    title: "Supabase authentication",
    description:
      "Private RepSync areas require authenticated accounts, and client-side configuration rejects service-role keys.",
    status: "verified",
    evidenceReference: "src/lib/auth.tsx; src/lib/supabase.ts",
    public: true,
  },
  {
    id: "protected_routes",
    title: "Protected application routes",
    description:
      "Authenticated coach, client, workspace, and team areas use route guards before private app screens render.",
    status: "verified",
    evidenceReference: "src/routes/app.tsx; src/components/*OnlyRoute.tsx",
    public: true,
  },
  {
    id: "workspace_roles",
    title: "Workspace role access",
    description:
      "Workspace roles include owner, admin, coach, assistant coach, and viewer, with permissions mapped in code.",
    status: "verified",
    evidenceReference: "src/features/workspace-team/contracts.ts",
    public: true,
  },
  {
    id: "assigned_client_scope",
    title: "Assigned-client visibility",
    description:
      "Workspace members can be scoped to all clients or assigned clients only, depending on role and workspace settings.",
    status: "verified",
    evidenceReference: "workspace-team migrations and contracts",
    public: true,
  },
  {
    id: "public_profile_publication",
    title: "Controlled public profile publication",
    description:
      "Coach profiles are public only when published; marketplace listing is controlled separately from publication.",
    status: "verified",
    evidenceReference: "usePublicPtProfile; useCoachMarketplaceProfiles",
    public: true,
  },
  {
    id: "public_application_limits",
    title: "Public application checks",
    description:
      "Public applications submit through a dedicated function that checks the profile is published and applies rate-limit guards.",
    status: "verified",
    evidenceReference: "submit_public_pt_application migrations",
    public: true,
  },
  {
    id: "team_invite_hardening",
    title: "Invitation checks",
    description:
      "Workspace team invite flows verify invite status, invited email, expiration, and acceptance state before granting access.",
    status: "verified",
    evidenceReference: "workspace-team invite page state and migrations",
    public: true,
  },
  {
    id: "rls_policies",
    title: "Database access policies",
    description:
      "Supabase row-level security and backend permission helpers are present for workspace, client, invite, and marketing lead surfaces.",
    status: "verified",
    evidenceReference: "supabase/migrations; unit SQL contract tests",
    public: true,
  },
  {
    id: "security_certifications",
    title: "Formal security certifications",
    description:
      "Formal security certification claims should not appear until human-approved evidence exists.",
    status: "not_applicable",
    evidenceReference:
      "No SOC 2, ISO 27001, HIPAA, or penetration-test evidence in repo.",
    public: false,
  },
];

export function getPublicTrustClaims() {
  return trustClaims.filter(
    (claim) => claim.public && claim.status === "verified",
  );
}

export type LegalSiteConfig = {
  businessName: string;
  legalEntityName: string;
  jurisdiction: string;
  contactEmail: string;
  privacyEmail: string;
  securityEmail: string;
  effectiveDate: string;
  version: string;
  approvedBy?: string;
  approvedAt?: string;
};

export const legalSiteConfig: LegalSiteConfig = {
  businessName: "RepSync",
  legalEntityName: "RepSync",
  jurisdiction: "Legal review pending",
  contactEmail: "support@repsync.com",
  privacyEmail: "privacy@repsync.com",
  securityEmail: "security@repsync.com",
  effectiveDate: "2026-07-12",
  version: "draft-public-launch-2026-07-12",
};

export const legalReviewRequired =
  !legalSiteConfig.approvedBy || !legalSiteConfig.approvedAt;

export type FaqGroup = {
  category: string;
  items: Array<{ q: string; a: string; href?: string }>;
};

export const publicFaqGroups: FaqGroup[] = [
  {
    category: "Product",
    items: [
      {
        q: "What is RepSync?",
        a: "RepSync is a coaching operating system for public profiles, applications, onboarding, delivery, check-ins, messages, client attention, and workspace visibility.",
        href: "/product",
      },
      {
        q: "Who is RepSync for?",
        a: "RepSync is built for independent coaches, hybrid coaches, in-person coaches who need follow-up structure, and small coaching teams.",
        href: "/for-coaches",
      },
      {
        q: "Is RepSync only for online coaches?",
        a: "No. RepSync can support online, hybrid, and in-person coaching workflows when the coach needs structured work between sessions.",
      },
      {
        q: "What does RepSync manage?",
        a: "RepSync manages public profiles, applications, leads, workspaces, clients, programs, nutrition assignments, habits, check-ins, messages, lifecycle state, attention signals, and PT Hub visibility.",
      },
      {
        q: "Does RepSync replace every tool?",
        a: "No. RepSync does not currently market automated billing, native mobile apps, Garmin, message attachments, program commerce, or full automated migration as available.",
      },
    ],
  },
  {
    category: "Coaches and teams",
    items: [
      {
        q: "Can I use RepSync as a solo coach?",
        a: "Yes. RepSync supports solo coach workflows with profile, lead, delivery, check-in, message, and client attention surfaces.",
      },
      {
        q: "Can a small team use RepSync?",
        a: "Yes. RepSync has workspace roles and assigned-client access patterns for small teams.",
      },
      {
        q: "What can assistant coaches access?",
        a: "Assistant coach access is controlled by workspace role and client assignment. Marketing should not imply assistants receive owner controls.",
      },
      {
        q: "Can viewers change client information?",
        a: "Viewer access is read-oriented in the verified permission configuration and should not be described as client-edit access.",
      },
      {
        q: "How do workspaces work?",
        a: "Workspaces group coaching relationships, team access, client delivery, and visibility within a controlled business context.",
      },
    ],
  },
  {
    category: "Clients",
    items: [
      {
        q: "What does a client see?",
        a: "Clients see their own coaching plan, workouts, nutrition guidance, habits, check-ins, messages, progress, and supported wearable context.",
        href: "/for-clients",
      },
      {
        q: "How does a client join?",
        a: "Clients typically join through an invitation or public application flow created by their coach.",
      },
      {
        q: "Can a client use RepSync without a coach?",
        a: "RepSync is designed around a coaching relationship. Independent client signup exists as an app route, but the public product story is coach-led.",
      },
      {
        q: "Can clients see another client's data?",
        a: "No. The client experience is described as showing the client's own coaching information, not other clients or coach business operations.",
      },
      {
        q: "Is there a native mobile app?",
        a: "No. Native iOS and Android apps are not currently marketed as available.",
      },
    ],
  },
  {
    category: "Switching",
    items: [
      {
        q: "Can I move from TrueCoach?",
        a: "RepSync can help assess a move from TrueCoach, but it does not promise a one-click or complete historical migration.",
        href: "/compare/truecoach",
      },
      {
        q: "Can I move from FITR?",
        a: "RepSync can help assess active-client delivery moved from FITR, while payment, commerce, and historical records may need separate planning.",
        href: "/compare/fitr",
      },
      {
        q: "Can client lists or programs be imported?",
        a: "Client lists and active programs can be evaluated during switch planning. Import support depends on source data quality and export shape.",
      },
      {
        q: "Is migration automatic?",
        a: "No. RepSync does not market fully automated competitor migration as available.",
      },
      {
        q: "Will clients need new accounts?",
        a: "Clients use RepSync accounts for private coaching areas. Switch planning should include invitation timing and client communication.",
      },
    ],
  },
  {
    category: "Availability",
    items: [
      {
        q: "Is RepSync available now?",
        a: "RepSync is presented as controlled early access. Book a demo so the team can qualify fit and explain current availability.",
        href: "/book-demo",
      },
      {
        q: "How does early access work?",
        a: "Coaches share business workflow context, current platform, client range, and priorities. RepSync follows up when there is a fit.",
      },
      {
        q: "Is pricing available?",
        a: "Public pricing is not available yet.",
      },
      {
        q: "Does RepSync support billing?",
        a: "Automated billing is not currently marketed as available.",
      },
      {
        q: "Does RepSync have a marketplace?",
        a: "Published profiles can appear in a public coach directory while marketplace availability remains beta-positioned.",
      },
    ],
  },
  {
    category: "Data and integrations",
    items: [
      {
        q: "Does RepSync support WHOOP?",
        a: "WHOOP context is marked coming soon in the public feature configuration.",
      },
      {
        q: "Does RepSync support Garmin?",
        a: "No. Garmin is not currently marketed as available.",
      },
      {
        q: "What wearable data is shown?",
        a: "RepSync only describes supported wearable context at a high level until the integration is production-ready.",
      },
      {
        q: "Does RepSync provide medical advice?",
        a: "No. RepSync is coaching software and should not be presented as medical, psychological, or diagnostic advice.",
      },
    ],
  },
  {
    category: "Security and privacy",
    items: [
      {
        q: "How is access controlled?",
        a: "Private areas require authenticated accounts, workspace roles, client relationships, and route guards.",
        href: "/security",
      },
      {
        q: "What information is public?",
        a: "Published coach profile information and public application surfaces are public. Private coaching data remains behind authenticated app areas.",
      },
      {
        q: "How can I request my data?",
        a: `Contact ${legalSiteConfig.privacyEmail} for access, correction, export, or deletion requests.`,
        href: "/privacy",
      },
      {
        q: "How can I request account deletion?",
        a: `Contact ${legalSiteConfig.privacyEmail} from the email associated with your account so the request can be reviewed.`,
      },
      {
        q: "How do I report a security issue?",
        a: `Send responsible disclosure reports to ${legalSiteConfig.securityEmail}. Do not include client health details or sensitive records in an initial report.`,
        href: "/security",
      },
    ],
  },
];

export function getVisibleFaqItems() {
  return publicFaqGroups.flatMap((group) => group.items);
}

export function getMarketingFeaturesByCategory(
  category: MarketingFeatureCategory,
) {
  return marketingProductFeatures.filter(
    (feature) =>
      feature.category === category && feature.availability !== "not_available",
  );
}

export function getMarketingFeaturesByAudience(audience: MarketingAudience) {
  return marketingProductFeatures.filter(
    (feature) =>
      feature.audiences.includes(audience) &&
      feature.availability !== "not_available",
  );
}

export type ComparisonCompetitor = "truecoach" | "fitr";

export type ProductAvailability =
  | "included"
  | "beta"
  | "planned"
  | "not_available";

export type CompetitorAvailability =
  | "included"
  | "partial"
  | "not_available"
  | "unknown";

export type ComparisonEvidence = {
  sourceLabel: string;
  sourceUrl: string;
  verifiedAt: string;
};

export type ComparisonFeature = {
  id: string;
  category: string;
  label: string;
  description?: string;
  repSync: {
    availability: ProductAvailability;
    note?: string;
  };
  competitor: {
    availability: CompetitorAvailability;
    note?: string;
    evidence?: ComparisonEvidence;
  };
};

export type MigrationSupportLevel =
  | "supported"
  | "assisted"
  | "evaluate"
  | "not_supported";

export type MigrationCategory = {
  id: string;
  label: string;
  description: string;
  support: MigrationSupportLevel;
  note?: string;
};

export const trademarkDisclaimer =
  "TrueCoach and FITR are trademarks of their respective owners. RepSync is not affiliated with or endorsed by either company.";

export const switchingProblems = [
  "Leads are managed outside the coaching platform.",
  "Public profiles and applications are disconnected from delivery.",
  "Onboarding requires several manual tools.",
  "Check-in follow-up is scattered.",
  "Client risk requires manual review.",
  "Business reporting and client delivery are separated.",
  "Team permissions are unclear.",
  "The client experience does not reflect the quality of the coaching brand.",
  "Client context is spread across messages, forms, documents, and spreadsheets.",
];

export const repSyncOperatingFlow = [
  {
    title: "Before the client joins",
    items: [
      "Public coach profile",
      "Applications",
      "Lead pipeline",
      "Lead conversation",
      "Approval",
    ],
  },
  {
    title: "When the client starts",
    items: [
      "Workspace assignment",
      "Onboarding",
      "Program assignment",
      "Nutrition assignment",
      "Habit setup",
      "Check-in cadence",
    ],
  },
  {
    title: "During coaching",
    items: [
      "Workouts",
      "Nutrition",
      "Habits",
      "Messaging",
      "Check-ins",
      "Client home",
    ],
  },
  {
    title: "Before the client drifts",
    items: [
      "Missed check-ins",
      "No recent reply",
      "Declining adherence",
      "Inactivity",
      "Overdue actions",
      "Manual attention flags",
    ],
  },
  {
    title: "Across the business",
    items: [
      "PT Hub",
      "Lifecycle visibility",
      "Workspace performance",
      "Team access and permissions",
      "Analytics",
    ],
  },
];

export const switchingSteps = [
  {
    title: "Review",
    body: "We review your current platform, active-client setup, programs, check-ins, team structure, and key workflows.",
  },
  {
    title: "Prepare",
    body: "We identify what can be imported, what should be recreated, and what may need to remain archived.",
  },
  {
    title: "Launch",
    body: "We verify coach access, configure the workspace, confirm active assignments, invite clients, and move delivery into RepSync.",
  },
];

export const migrationMatrix: MigrationCategory[] = [
  {
    id: "coach_account_information",
    label: "Coach account information",
    description: "Basic coach identity and workspace setup details.",
    support: "assisted",
    note: "RepSync has coach accounts and PT Hub workspace setup; migration is reviewed during onboarding.",
  },
  {
    id: "active_client_list",
    label: "Active client list",
    description: "Current clients who should continue coaching in RepSync.",
    support: "assisted",
    note: "Client accounts and workspace assignment are supported; import shape is evaluated before launch.",
  },
  {
    id: "client_contact_information",
    label: "Client contact information",
    description: "Client names and contact details needed for invites.",
    support: "assisted",
  },
  {
    id: "team_member_list",
    label: "Team member list",
    description: "Owners, assistant coaches, and viewer access planning.",
    support: "assisted",
    note: "Workspace roles are present; exact permissions are configured inside RepSync.",
  },
  {
    id: "active_programs",
    label: "Active programs",
    description: "Programs clients are currently following.",
    support: "evaluate",
    note: "RepSync supports programs, but source exports vary by platform.",
  },
  {
    id: "reusable_program_templates",
    label: "Reusable program templates",
    description: "Workout templates and repeatable training blocks.",
    support: "evaluate",
  },
  {
    id: "nutrition_information",
    label: "Nutrition information",
    description: "Active nutrition assignments and coaching notes.",
    support: "evaluate",
    note: "RepSync supports nutrition assignments; historical nutrition imports require review.",
  },
  {
    id: "habits",
    label: "Habits",
    description: "Active habits and routine tracking setup.",
    support: "evaluate",
  },
  {
    id: "recurring_checkin_schedules",
    label: "Recurring check-in schedules",
    description: "Cadence and template expectations for client check-ins.",
    support: "assisted",
  },
  {
    id: "upcoming_client_actions",
    label: "Upcoming client actions",
    description: "Near-term assignments, check-ins, and follow-up work.",
    support: "assisted",
  },
  {
    id: "historical_checkin_responses",
    label: "Historical check-in responses",
    description: "Past check-in submissions and review context.",
    support: "evaluate",
    note: "Historical import is not promised without inspecting source data.",
  },
  {
    id: "historical_messages",
    label: "Historical messages",
    description: "Past coach-client conversations.",
    support: "evaluate",
  },
  {
    id: "coach_notes",
    label: "Coach notes",
    description: "Private notes used for coaching context.",
    support: "evaluate",
  },
  {
    id: "documents_and_attachments",
    label: "Documents and attachments",
    description: "Uploaded PDFs, files, and media attachments.",
    support: "not_supported",
    note: "Message attachments are not currently marketed as available.",
  },
  {
    id: "wearable_history",
    label: "Wearable history",
    description: "Past wearable metrics from connected devices.",
    support: "not_supported",
    note: "WHOOP is marked coming soon; Garmin and broad wearable migration are not marketed as available.",
  },
  {
    id: "billing_history",
    label: "Billing history",
    description: "Invoices, subscriptions, and payment records.",
    support: "not_supported",
    note: "Automated billing is not currently marketed as available.",
  },
];

const trueCoachEvidence: Record<string, ComparisonEvidence> = {
  features: {
    sourceLabel: "TrueCoach official features page",
    sourceUrl: "https://truecoach.co/features/",
    verifiedAt: "2026-07-12",
  },
  about: {
    sourceLabel: "TrueCoach official about page",
    sourceUrl: "https://truecoach.co/about/",
    verifiedAt: "2026-07-12",
  },
};

const fitrEvidence: Record<string, ComparisonEvidence> = {
  home: {
    sourceLabel: "FITR official product page",
    sourceUrl: "https://fitr.training/",
    verifiedAt: "2026-07-12",
  },
  programTypes: {
    sourceLabel: "FITR official program types page",
    sourceUrl: "https://get.fitr.training/programming/program-types",
    verifiedAt: "2026-07-12",
  },
};

const repSyncComparisonBase: Array<
  Omit<ComparisonFeature, "competitor"> & {
    competitorByPage: Record<
      ComparisonCompetitor,
      ComparisonFeature["competitor"]
    >;
  }
> = [
  {
    id: "workout_program_delivery",
    category: "Delivery",
    label: "Workout and program delivery",
    description: "Creating and assigning structured training work.",
    repSync: {
      availability: "included",
      note: "Programs, workouts, and assigned client work are implemented in the authenticated app.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials describe workout templates, a drag-and-drop workout builder, and video library.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "included",
        note: "Official materials describe structured programming and multiple program types.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "nutrition",
    category: "Delivery",
    label: "Nutrition",
    repSync: {
      availability: "included",
      note: "RepSync includes nutrition assignment surfaces.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials describe nutrition tracking, meal plans, macros, and MyFitnessPal integration.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "included",
        note: "Official materials describe built-in nutrition tools including macro tracking and calorie calculators.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "habits",
    category: "Delivery",
    label: "Habits",
    repSync: {
      availability: "included",
      note: "RepSync includes habit setup and tracking surfaces.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials describe habit tracking.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "partial",
        note: "Official materials list Habits as coming soon.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "messaging",
    category: "Communication",
    label: "Messaging",
    repSync: {
      availability: "included",
      note: "RepSync includes coach-client messaging.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials describe in-app, group, multimedia, and real-time messaging.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "included",
        note: "Official materials include client management, communication, and mobile apps.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "public_profile",
    category: "Acquisition",
    label: "Public coach profile",
    repSync: {
      availability: "included",
      note: "Coaches can publish public profiles from PT Hub.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials describe Public Profiles and Coach Profiles.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "included",
        note: "Official materials describe storefront, program pages, marketing customisation, and client sign-up surfaces.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "applications_lead_pipeline",
    category: "Acquisition",
    label: "Applications and lead pipeline",
    repSync: {
      availability: "included",
      note: "Public applications, lead workflow, lead conversation, and approval are implemented.",
    },
    competitorByPage: {
      truecoach: {
        availability: "partial",
        note: "Official materials describe public profiles that let potential clients contact or apply; broader pipeline fit should be evaluated.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "partial",
        note: "Official materials describe marketing/storefront/program pages and client sign-up; lead-pipeline details should be evaluated.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "client_attention",
    category: "Retention",
    label: "Client attention signals",
    repSync: {
      availability: "included",
      note: "RepSync separates lifecycle from attention reasons such as missed check-ins, no reply, inactivity, overdue work, and manual flags.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials describe automated risk assessment and client organization.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "partial",
        note: "Official materials describe progress and accountability; exact attention-signal behavior should be evaluated.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "workspace_team_model",
    category: "Operations",
    label: "Workspace and team model",
    repSync: {
      availability: "included",
      note: "RepSync supports owner, assistant coach, and viewer access patterns for controlled workspaces.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials reference team accounts.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "included",
        note: "Official materials include Teams in Business & Admin.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "analytics",
    category: "Operations",
    label: "Analytics",
    repSync: {
      availability: "included",
      note: "PT Hub analytics and workspace performance are marketed as available.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials describe dashboards, client tracking, and progress tracking.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "included",
        note: "Official materials describe progress tracking, data and integrations, and business/admin features.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "wearables",
    category: "Integrations",
    label: "Wearable support",
    repSync: {
      availability: "planned",
      note: "WHOOP is marked coming soon; Garmin is not marketed as available.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials describe wearable integrations including Apple Health, Garmin, WHOOP, OURA, and more.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "unknown",
      },
    },
  },
  {
    id: "billing_payments",
    category: "Business",
    label: "Billing and payments",
    repSync: {
      availability: "not_available",
      note: "Automated billing is not currently marketed as available.",
    },
    competitorByPage: {
      truecoach: {
        availability: "included",
        note: "Official materials describe automated payments powered by Stripe in supported countries.",
        evidence: trueCoachEvidence.features,
      },
      fitr: {
        availability: "included",
        note: "Official materials describe managing payments and program sales.",
        evidence: fitrEvidence.home,
      },
    },
  },
  {
    id: "migration_support",
    category: "Switching",
    label: "Migration support",
    repSync: {
      availability: "included",
      note: "RepSync offers switch assessment during early access without promising full automated migration.",
    },
    competitorByPage: {
      truecoach: {
        availability: "unknown",
      },
      fitr: {
        availability: "unknown",
      },
    },
  },
];

export type ComparisonPageData = {
  competitor: ComparisonCompetitor;
  competitorName: string;
  canonicalPath: string;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  primaryCta: string;
  secondaryCta: string;
  lastReviewed: string;
  features: ComparisonFeature[];
  summary: string[];
  switchingConsiderations: string[];
  faqs: Array<{ q: string; a: string }>;
  trademarkDisclaimer: string;
};

export const comparisonPages: Record<ComparisonCompetitor, ComparisonPageData> =
  {
    truecoach: {
      competitor: "truecoach",
      competitorName: "TrueCoach",
      canonicalPath: "/compare/truecoach",
      heroEyebrow: "REPSYNC VS TRUECOACH",
      heroTitle: "Considering a move from TrueCoach?",
      heroBody:
        "Compare how each product fits your coaching operation, not just the workout builder.",
      primaryCta: "Plan your switch from TrueCoach",
      secondaryCta: "Explore RepSync",
      lastReviewed: "2026-07-16",
      trademarkDisclaimer,
      summary: [
        "TrueCoach has official materials for workout delivery, nutrition, habits, messaging, public profiles, payments, wearables, and team accounts.",
        "RepSync emphasizes the connected lead-to-client path: public profile, applications, lead workflow, onboarding, delivery, and attention visibility.",
        "Switch planning should focus on the active client workflow and what historical data must be preserved.",
      ],
      switchingConsiderations: [
        "Which active clients need to move first",
        "Which programs should be rebuilt as current RepSync assignments",
        "Which historical check-ins, notes, and messages need archival access",
        "How client invites and communication should be sequenced",
      ],
      faqs: [
        {
          q: "Can RepSync automatically import everything from TrueCoach?",
          a: "No. RepSync should review source data first and identify what can be imported, recreated, or archived.",
        },
        {
          q: "Does RepSync replace every TrueCoach business feature?",
          a: "No. RepSync currently does not market automated billing or broad wearable support as available.",
        },
        {
          q: "What should I compare first?",
          a: "Start with your active-client workflow: applications, onboarding, programs, check-ins, messaging, attention signals, and team access.",
        },
      ],
      features: repSyncComparisonBase
        .map((feature) => ({
          ...feature,
          competitor: feature.competitorByPage.truecoach,
        }))
        .filter((feature) => feature.competitor.availability !== "unknown"),
    },
    fitr: {
      competitor: "fitr",
      competitorName: "FITR",
      canonicalPath: "/compare/fitr",
      heroEyebrow: "REPSYNC VS FITR",
      heroTitle: "Considering a move from FITR?",
      heroBody:
        "Compare the coaching workflow, client journey, and business operating model.",
      primaryCta: "Plan your switch from FITR",
      secondaryCta: "Explore RepSync",
      lastReviewed: "2026-07-16",
      trademarkDisclaimer,
      summary: [
        "FITR official materials describe programming, client management, communication, progress tracking, marketing/storefront features, payments, teams, mobile apps, and program types.",
        "RepSync emphasizes acquisition-to-delivery continuity, client attention, workspace roles, and honest switch planning.",
        "Program commerce and automated payments should be treated as FITR strengths and RepSync limitations until RepSync billing is verified.",
      ],
      switchingConsiderations: [
        "Whether program sales or subscriptions remain outside RepSync",
        "Which clients are active coaching relationships versus program purchasers",
        "How to rebuild current programs and check-in cadence",
        "Which historical commerce records need to stay archived in the prior system",
      ],
      faqs: [
        {
          q: "Can RepSync replace FITR program commerce today?",
          a: "No. RepSync does not currently market program commerce or automated payments as available.",
        },
        {
          q: "Can RepSync support active coaching clients moved from FITR?",
          a: "RepSync supports client accounts, programs, nutrition, habits, check-ins, messages, and workspaces; each source export still needs review.",
        },
        {
          q: "What should FITR users evaluate before switching?",
          a: "Evaluate program types, payment dependencies, active client delivery, check-in history, and team access before moving live coaching work.",
        },
      ],
      features: repSyncComparisonBase
        .map((feature) => ({
          ...feature,
          competitor: feature.competitorByPage.fitr,
        }))
        .filter((feature) => feature.competitor.availability !== "unknown"),
    },
  };

export function getComparisonPageData(competitor: ComparisonCompetitor) {
  return comparisonPages[competitor];
}

export function getComparisonCategories(features: ComparisonFeature[]) {
  return Array.from(new Set(features.map((feature) => feature.category)));
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
    title: "RepSync Product | Coaching Business and Client Management",
    description:
      "Explore how RepSync connects lead management, onboarding, coaching delivery, check-ins, messaging, client attention, and workspace oversight.",
    canonicalPath: "/product",
  },
  "/for-coaches": {
    title: "RepSync for Personal Trainers and Online Coaches",
    description:
      "Manage leads, onboard clients, deliver coaching, run check-ins, collaborate with your team, and see who needs attention.",
    canonicalPath: "/for-coaches",
  },
  "/for-clients": {
    title: "RepSync for Coaching Clients",
    description:
      "View workouts, nutrition guidance, habits, check-ins, messages, and coaching progress in one clear client experience.",
    canonicalPath: "/for-clients",
  },
  "/switch": {
    title: "Switch Coaching Platforms to RepSync",
    description:
      "Plan your move to RepSync and connect lead management, onboarding, coaching delivery, check-ins, communication, and client attention.",
    canonicalPath: "/switch",
  },
  "/compare/truecoach": {
    title: "RepSync vs TrueCoach | Coaching Platform Comparison",
    description:
      "Compare RepSync and TrueCoach across coaching delivery, client workflows, lead management, check-ins, team access, and switching considerations.",
    canonicalPath: "/compare/truecoach",
  },
  "/compare/fitr": {
    title: "RepSync vs FITR | Coaching Platform Comparison",
    description:
      "Compare RepSync and FITR across programming, client delivery, lead workflows, check-ins, analytics, team structure, and migration considerations.",
    canonicalPath: "/compare/fitr",
  },
  "/faq": {
    title: "RepSync FAQ | Product, Security, Switching, and Early Access",
    description:
      "Answers about RepSync product scope, coaches, clients, switching, availability, integrations, security, privacy, and early access.",
    canonicalPath: "/faq",
  },
  "/security": {
    title: "RepSync Security | Public Profiles and Private Coaching Data",
    description:
      "Learn how RepSync separates public profile information from private coaching data with authentication, workspace roles, client boundaries, and invite checks.",
    canonicalPath: "/security",
  },
  "/book-demo": {
    title: "Book a Demo | RepSync",
    description:
      "Book a RepSync demo for your coaching business or small coaching team.",
    canonicalPath: "/book-demo",
  },
  "/request-access": {
    title: "Book a Demo | RepSync",
    description:
      "Book a RepSync demo for your coaching business or small coaching team.",
    canonicalPath: "/book-demo",
  },
  "/privacy": {
    title: "RepSync Privacy Notice",
    description:
      "Read the RepSync draft privacy notice covering account information, coach profiles, applications, marketing forms, analytics, cookies, integrations, and data requests.",
    canonicalPath: "/privacy",
  },
  "/terms": {
    title: "RepSync Terms of Service",
    description:
      "Read the RepSync draft terms covering accounts, acceptable use, coach and client responsibilities, public profile content, early access, and service limitations.",
    canonicalPath: "/terms",
  },
  "/cookies": {
    title: "RepSync Cookie Notice and Analytics Preferences",
    description:
      "Review RepSync essential storage, analytics preferences, local storage use, and cookie consent controls.",
    canonicalPath: "/cookies",
  },
};
