export type ProfileCompletionInput = {
  display_name?: string | null;
  phone?: string | null;
  location?: string | null;
  timezone?: string | null;
  unit_preference?: string | null;
  dob?: string | null;
  gender?: string | null;
  training_type?: string | null;
  days_per_week?: number | string | null;
  current_weight?: number | string | null;
};

const completionFields: Array<{
  key: keyof ProfileCompletionInput;
  label: string;
}> = [
  { key: "display_name", label: "Display name" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Country" },
  { key: "timezone", label: "Timezone" },
  { key: "unit_preference", label: "Units" },
  { key: "dob", label: "Birthdate" },
  { key: "gender", label: "Gender" },
  { key: "training_type", label: "Training type (coach)" },
  { key: "days_per_week", label: "Days per week" },
  { key: "current_weight", label: "Current weight" },
];

const hasValue = (
  value: ProfileCompletionInput[keyof ProfileCompletionInput],
) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return !Number.isNaN(value) && value > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
};

export const getProfileCompletion = (
  profile: ProfileCompletionInput | null | undefined,
) => {
  const total = completionFields.length;
  if (!profile) {
    return {
      total,
      completed: 0,
      percent: 0,
      missing: completionFields.map((f) => f.label),
    };
  }

  let completed = 0;
  const missing: string[] = [];

  completionFields.forEach((field) => {
    const value = profile[field.key];
    if (hasValue(value)) {
      completed += 1;
    } else {
      missing.push(field.label);
    }
  });

  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percent, missing };
};
