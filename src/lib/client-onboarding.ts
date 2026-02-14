export type ClientOnboardingProfile = {
  display_name?: string | null;
  dob?: string | null;
  location?: string | null;
  timezone?: string | null;
  gender?: string | null;
  gym_name?: string | null;
  days_per_week?: number | null;
  goal?: string | null;
  height_cm?: number | null;
  current_weight?: number | null;
};

const hasText = (value: string | null | undefined) => Boolean(value && value.trim().length > 0);

const hasPositiveNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function hasCompletedClientOnboarding(profile: ClientOnboardingProfile | null | undefined): boolean {
  if (!profile) return false;

  return (
    hasText(profile.display_name) &&
    hasText(profile.dob) &&
    hasText(profile.location) &&
    hasText(profile.timezone) &&
    hasText(profile.gender) &&
    hasText(profile.gym_name) &&
    hasPositiveNumber(profile.days_per_week) &&
    hasText(profile.goal) &&
    hasPositiveNumber(profile.height_cm) &&
    hasPositiveNumber(profile.current_weight)
  );
}
