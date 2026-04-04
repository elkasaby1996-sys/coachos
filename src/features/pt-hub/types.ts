export interface PTSocialLink {
  platform: string;
  label: string;
  url: string;
}

export type PTCoachingMode =
  | "one_on_one"
  | "programming"
  | "nutrition"
  | "accountability";

export type PTAvailabilityMode = "online" | "in_person";

export type PTLeadStatus =
  | "new"
  | "reviewed"
  | "contacted"
  | "consultation_booked"
  | "accepted"
  | "rejected"
  | "archived";

export interface PTProfile {
  id: string | null;
  workspaceId: string | null;
  fullName: string;
  displayName: string;
  slug: string;
  headline: string;
  searchableHeadline: string;
  shortBio: string;
  specialties: string[];
  certifications: string[];
  coachingStyle: string;
  coachingModes: PTCoachingMode[];
  availabilityModes: PTAvailabilityMode[];
  locationLabel: string;
  marketplaceVisible: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  profilePhotoUrl: string | null;
  bannerImageUrl: string | null;
  socialLinks: PTSocialLink[];
  testimonials: PTPublicTestimonial[];
  transformations: PTPublicTransformation[];
  publicUrl: string | null;
  completionPercent: number;
  updatedAt: string | null;
}

export type PTWorkspaceStatus = "current" | "active" | "new";

export interface PTWorkspaceSummary {
  id: string;
  name: string;
  status: PTWorkspaceStatus;
  clientCount: number | null;
  lastUpdated: string | null;
  ownerUserId: string | null;
  role: string | null;
  createdAt: string | null;
}

export interface PTOverviewStats {
  activeWorkspaces: number;
  activeClients: number;
  applicationsThisWeek: number;
  applicationsThisMonth: number;
  applicationsPreviousWindow: number;
  profileCompletionPercent: number;
  subscriptionStatus: string;
  latestWorkspaceId: string | null;
  latestWorkspaceName: string | null;
  lastProfileUpdate: string | null;
  readyForPublish: boolean;
  missingSetupItems: string[];
  businessHealthLabel: string;
}

export interface PTLeadNote {
  id: string;
  leadId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface PTLead {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  goalSummary: string;
  trainingExperience: string | null;
  budgetInterest: string | null;
  packageInterest: string | null;
  status: PTLeadStatus;
  submittedAt: string;
  notesPreview: string | null;
  notes: PTLeadNote[];
  source: string;
  sourceLabel: string;
  sourceSlug: string | null;
  convertedAt: string | null;
  convertedWorkspaceId: string | null;
  convertedClientId: string | null;
}

export interface PTAccountSettingsDraft {
  contactEmail: string;
  supportEmail: string;
  phone: string;
  timezone: string;
  city: string;
  clientAlerts: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
  profileVisibility: "draft" | "private" | "listed";
  subscriptionPlan: string;
  subscriptionStatus: string;
}

export interface PTClientSummary {
  id: string;
  workspaceId: string;
  workspaceName: string;
  displayName: string;
  status: string;
  lifecycleState: string;
  lifecycleChangedAt: string | null;
  pausedReason: string | null;
  churnReason: string | null;
  goal: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  onboardingStatus: string | null;
  onboardingIncomplete: boolean;
  lastActivityAt: string | null;
  lastClientReplyAt: string | null;
  hasOverdueCheckin: boolean;
  overdueCheckinsCount: number;
  riskFlags: string[];
  recentActivityLabel: string;
}

export interface PTProfilePreviewData {
  fullName: string;
  displayName: string;
  slug: string;
  headline: string;
  searchableHeadline: string;
  shortBio: string;
  specialties: string[];
  certifications: string[];
  coachingStyle: string;
  coachingModes: PTCoachingMode[];
  availabilityModes: PTAvailabilityMode[];
  locationLabel: string;
  marketplaceVisible: boolean;
  isPublished: boolean;
  publicUrl: string | null;
  profilePhotoUrl: string | null;
  bannerImageUrl: string | null;
  socialLinks: PTSocialLink[];
  testimonials: PTPublicTestimonial[];
  transformations: PTPublicTransformation[];
}

export interface PTSubscriptionSummary {
  planName: string;
  billingStatus: string;
  renewalDate: string | null;
  paymentMethodLabel: string | null;
  packagePricingLabel: string | null;
  billingConnected: boolean;
}

export interface PTInvoiceSummary {
  id: string;
  label: string;
  amountLabel: string;
  status: string;
  issuedAt: string | null;
  downloadUrl: string | null;
  placeholder: boolean;
}

export interface PTRevenueSnapshot {
  monthlyRevenueLabel: string;
  trailingRevenueLabel: string;
  activePayingClientsLabel: string;
  packagePricingLabel: string;
  revenueConnected: boolean;
  potentialActiveClients: number;
}

export interface PTProfileReadinessItem {
  key:
    | "profile_photo"
    | "banner"
    | "display_name"
    | "headline"
    | "bio"
    | "specialties"
    | "certifications"
    | "coaching_style"
    | "social_links"
    | "cta_ready";
  label: string;
  complete: boolean;
  href: string;
  guidance: string;
}

export interface PTProfileReadiness {
  completionPercent: number;
  readyForPublish: boolean;
  statusLabel: string;
  missingItems: string[];
  checklist: PTProfileReadinessItem[];
}

export interface PTAnalyticsWorkspaceBreakdown {
  workspaceId: string;
  workspaceName: string;
  clientCount: number;
}

export interface PTAnalyticsSnapshot {
  profileViewsLabel: string;
  profileViewsConnected: boolean;
  totalApplications: number;
  applicationsThisWeek: number;
  applicationsThisMonth: number;
  applicationsPreviousWindow: number;
  applicationConversionRate: number;
  activeClients: number;
  profileCompletionPercent: number;
  testimonialCountLabel: string;
  transformationsCountLabel: string;
  growthTrendLabel: string;
  clientsByWorkspace: PTAnalyticsWorkspaceBreakdown[];
}

export interface PTPublicTestimonial {
  quote: string;
  author: string;
  role: string | null;
}

export interface PTPublicTransformation {
  title: string;
  summary: string;
}

export interface PTPublicProfile {
  userId: string;
  fullName: string;
  displayName: string;
  slug: string;
  headline: string;
  searchableHeadline: string;
  shortBio: string;
  specialties: string[];
  certifications: string[];
  coachingStyle: string;
  coachingModes: PTCoachingMode[];
  availabilityModes: PTAvailabilityMode[];
  locationLabel: string;
  marketplaceVisible: boolean;
  publishedAt: string | null;
  profilePhotoUrl: string | null;
  bannerImageUrl: string | null;
  socialLinks: PTSocialLink[];
  testimonials: PTPublicTestimonial[];
  transformations: PTPublicTransformation[];
  publicUrl: string;
}

export interface PTPublicLeadInput {
  slug: string;
  fullName: string;
  email: string;
  phone: string;
  goalSummary: string;
  trainingExperience: string;
  budgetInterest: string;
  packageInterest: string;
}

export interface PTPublicationState {
  canPublish: boolean;
  isPublished: boolean;
  blockers: string[];
  publicUrl: string | null;
  marketplaceStatus: string;
}
