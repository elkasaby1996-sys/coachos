/** Commercial identifiers describe contracts, not runtime permissions. */
export const PUBLIC_PLAN_KEYS = ["launch", "growth", "scale"] as const;
export type PublicPlanKey = (typeof PUBLIC_PLAN_KEYS)[number];
export const COMMERCIAL_PLAN_KEYS = [...PUBLIC_PLAN_KEYS, "custom"] as const;
export type CommercialPlanKey = (typeof COMMERCIAL_PLAN_KEYS)[number];
export const FEATURE_DOMAINS = [
  "core",
  "acquisition",
  "workspace",
  "team",
  "analytics",
  "automation",
  "integration",
  "commercial",
  "support",
] as const;
export const COMMERCIAL_FEATURE_KEYS = [
  "core.client_management",
  "core.client_onboarding",
  "core.workout_delivery",
  "core.program_delivery",
  "core.exercise_library",
  "core.custom_exercises",
  "core.nutrition_delivery",
  "core.habit_tracking",
  "core.checkins",
  "core.messaging",
  "core.progress_tracking",
  "core.lifecycle_management",
  "core.risk_indicators",
  "core.data_export",
  "acquisition.public_profile",
  "acquisition.marketplace_eligibility",
  "acquisition.public_application",
  "acquisition.lead_pipeline",
  "acquisition.lead_chat",
  "acquisition.lead_source_reporting",
  "acquisition.conversion_reporting",
  "acquisition.package_reporting",
  "acquisition.team_lead_routing",
  "workspace.basic_identity",
  "workspace.custom_logo",
  "workspace.custom_accent",
  "workspace.custom_welcome_content",
  "workspace.custom_invite_identity",
  "workspace.multiple_workspaces",
  "workspace.cross_workspace_admin",
  "team.assigned_client_access",
  "team.additional_seats",
  "team.standard_roles",
  "team.custom_permissions",
  "team.audit_history",
  "team.workload_reporting",
  "team.cross_workspace_access",
  "analytics.basic_dashboard",
  "analytics.client_progress",
  "analytics.advanced_filters",
  "analytics.saved_segments",
  "analytics.retention",
  "analytics.multi_workspace",
  "analytics.team_performance",
  "analytics.scheduled_reports",
  "automation.transactional_notifications",
  "automation.standard_templates",
  "automation.conditional_rules",
  "automation.multi_step",
  "automation.cross_workspace",
  "automation.execution_history",
  "integration.wearables",
  "integration.calendar",
  "integration.meeting_provider",
  "integration.zapier_make",
  "integration.api",
  "integration.webhooks",
  "commercial.published_packages",
  "commercial.client_payments",
  "commercial.revenue_reporting",
  "support.standard",
  "support.priority",
  "support.migration_assistance",
] as const;
export type CommercialFeatureKey = (typeof COMMERCIAL_FEATURE_KEYS)[number];
export const FEATURE_READINESS_STATUSES = [
  "DRAFT",
  "IMPLEMENTED",
  "E2E_PROVEN",
  "PRODUCTION_HARDENED",
  "COMMERCIALLY_SALEABLE",
  "RETIRED",
] as const;
export type FeatureReadinessStatus =
  (typeof FEATURE_READINESS_STATUSES)[number];
export const FEATURE_VISIBILITIES = ["internal", "beta", "public"] as const;
export type FeatureVisibility = (typeof FEATURE_VISIBILITIES)[number];
export const PLAN_VERSION_STATUSES = ["draft", "active", "retired"] as const;
export type PlanVersionStatus = (typeof PLAN_VERSION_STATUSES)[number];
export const TRIAL_DURATION_DAYS = 14;
export const PUBLIC_TRIAL_POLICY = Object.freeze({
  durationDays: TRIAL_DURATION_DAYS,
  featurePlanKey: "growth",
  defaultRequestedPlanKey: "growth",
  requiresCard: false,
  capacities: Object.freeze({
    countedClients: 10,
    coachSeats: 2,
    activeWorkspaces: 1,
    publishedPackages: 3,
  }),
} as const);
export function isPublicPlanKey(value: unknown): value is PublicPlanKey {
  return (
    typeof value === "string" &&
    PUBLIC_PLAN_KEYS.includes(value as PublicPlanKey)
  );
}
export function normalizePublicPlanKey(
  value: string | null | undefined,
): PublicPlanKey {
  const normalized = value?.trim().toLowerCase();
  return isPublicPlanKey(normalized)
    ? normalized
    : PUBLIC_TRIAL_POLICY.defaultRequestedPlanKey;
}
export function getPublicPlanLabel(plan: PublicPlanKey) {
  return { launch: "Launch", growth: "Growth", scale: "Scale" }[plan];
}
export const UNIVERSAL_PLAN_FEATURE_KEYS = Object.freeze([
  "core.client_management",
  "core.client_onboarding",
  "core.workout_delivery",
  "core.program_delivery",
  "core.exercise_library",
  "core.custom_exercises",
  "core.nutrition_delivery",
  "core.habit_tracking",
  "core.checkins",
  "core.messaging",
  "core.progress_tracking",
  "core.lifecycle_management",
  "core.risk_indicators",
  "core.data_export",
  "acquisition.public_profile",
  "acquisition.marketplace_eligibility",
  "acquisition.public_application",
  "acquisition.lead_pipeline",
  "acquisition.lead_chat",
  "workspace.basic_identity",
  "team.assigned_client_access",
  "team.additional_seats",
  "analytics.basic_dashboard",
  "analytics.client_progress",
  "automation.transactional_notifications",
  "integration.wearables",
  "commercial.published_packages",
  "commercial.client_payments",
  "support.standard",
] as const satisfies readonly CommercialFeatureKey[]);
export const GROWTH_AND_SCALE_FEATURE_KEYS = Object.freeze([
  "acquisition.lead_source_reporting",
  "acquisition.conversion_reporting",
  "acquisition.package_reporting",
  "workspace.custom_logo",
  "workspace.custom_accent",
  "workspace.custom_welcome_content",
  "workspace.custom_invite_identity",
  "workspace.multiple_workspaces",
  "team.standard_roles",
  "analytics.advanced_filters",
  "analytics.saved_segments",
  "analytics.retention",
  "automation.standard_templates",
  "automation.execution_history",
  "integration.calendar",
  "integration.meeting_provider",
  "commercial.revenue_reporting",
  "support.priority",
] as const satisfies readonly CommercialFeatureKey[]);
export const SCALE_ONLY_FEATURE_KEYS = Object.freeze([
  "acquisition.team_lead_routing",
  "workspace.cross_workspace_admin",
  "team.custom_permissions",
  "team.audit_history",
  "team.workload_reporting",
  "team.cross_workspace_access",
  "analytics.multi_workspace",
  "analytics.team_performance",
  "analytics.scheduled_reports",
  "automation.conditional_rules",
  "automation.multi_step",
  "automation.cross_workspace",
  "integration.zapier_make",
  "integration.api",
  "integration.webhooks",
  "support.migration_assistance",
] as const satisfies readonly CommercialFeatureKey[]);
export const PLAN_FEATURE_KEYS = Object.freeze({
  launch: UNIVERSAL_PLAN_FEATURE_KEYS,
  growth: Object.freeze([
    ...UNIVERSAL_PLAN_FEATURE_KEYS,
    ...GROWTH_AND_SCALE_FEATURE_KEYS,
  ]),
  scale: Object.freeze([
    ...UNIVERSAL_PLAN_FEATURE_KEYS,
    ...GROWTH_AND_SCALE_FEATURE_KEYS,
    ...SCALE_ONLY_FEATURE_KEYS,
  ]),
} satisfies Record<PublicPlanKey, readonly CommercialFeatureKey[]>);
