export type PerformanceMarkerTemplateLike = {
  id: string;
};

export function resolveAssignedPerformanceMarkerTemplates<
  Template extends PerformanceMarkerTemplateLike,
>(templates: Template[], assignedTemplateIds: string[]) {
  const assignedIds = new Set(
    assignedTemplateIds.filter((value): value is string => Boolean(value)),
  );

  if (assignedIds.size === 0) {
    return templates;
  }

  return templates.filter((template) => assignedIds.has(template.id));
}

export function buildPerformanceMarkerSelection(
  templates: PerformanceMarkerTemplateLike[],
  assignedTemplateIds: string[],
) {
  const assignedIds = new Set(
    assignedTemplateIds.filter((value): value is string => Boolean(value)),
  );

  if (assignedIds.size === 0) {
    return templates.map((template) => template.id);
  }

  return templates
    .map((template) => template.id)
    .filter((templateId) => assignedIds.has(templateId));
}

export function shouldShowPtPerformanceMarkerAssignment({
  onboardingBaselineId,
  submittedBaselineId,
  submittedAt,
}: {
  onboardingBaselineId: string | null | undefined;
  submittedBaselineId: string | null | undefined;
  submittedAt: string | null | undefined;
}) {
  if (!onboardingBaselineId) {
    return true;
  }

  return !(
    submittedBaselineId === onboardingBaselineId &&
    Boolean(submittedAt)
  );
}
