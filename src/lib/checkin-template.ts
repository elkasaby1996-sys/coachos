export const CHECKIN_SCALE_MIN = 1;
export const CHECKIN_SCALE_MAX = 10;

export const checkinQuestionTypeOptions = [
  {
    value: "text",
    label: "Text",
    description: "Open response for notes, wins, and context.",
  },
  {
    value: "number",
    label: "Number",
    description: "Single numeric answer like weight, steps, or HRV.",
  },
  {
    value: "scale",
    label: "Scale",
    description: "Quick 1 to 10 rating for readiness, soreness, or energy.",
  },
  {
    value: "choice",
    label: "Choice",
    description: "Single-select answer from coach-defined options.",
  },
  {
    value: "yes_no",
    label: "Yes / No",
    description: "Binary answer rendered as a dedicated yes-no control.",
  },
] as const;

export type SupportedCheckinQuestionType =
  (typeof checkinQuestionTypeOptions)[number]["value"];

export type CheckinQuestionLike = {
  id?: string | null;
  question_text?: string | null;
  prompt?: string | null;
  question_type?: string | null;
  response_type?: string | null;
  type?: string | null;
  input_type?: string | null;
  options?: string[] | null;
  is_required?: boolean | null;
  sort_order?: number | null;
  position?: number | null;
};

export type CheckinQuestionDraft = {
  id: string;
  questionText: string;
  helpText: string;
  type: SupportedCheckinQuestionType;
  isRequired: boolean;
  options: string[];
  sortOrder: number;
};

export function normalizeCheckinQuestionType(
  question: CheckinQuestionLike | string | null | undefined,
): SupportedCheckinQuestionType {
  const raw =
    typeof question === "string"
      ? question
      : question?.question_type ||
        question?.response_type ||
        question?.type ||
        question?.input_type ||
        "text";
  const normalized = String(raw).trim().toLowerCase();

  if (["scale", "rating", "slider"].includes(normalized)) return "scale";
  if (["choice", "select", "option", "options"].includes(normalized))
    return "choice";
  if (["boolean", "yes_no", "yes-no", "yesno"].includes(normalized))
    return "yes_no";
  if (["number", "numeric", "int", "float", "decimal"].includes(normalized))
    return "number";

  return "text";
}

export function getCheckinQuestionLabel(question: CheckinQuestionLike) {
  return (
    question.question_text?.trim() || question.prompt?.trim() || "Question"
  );
}

export function getCheckinQuestionHelpText(question: CheckinQuestionLike) {
  const label = question.question_text?.trim() ?? "";
  const prompt = question.prompt?.trim() ?? "";
  if (!prompt || prompt === label) return "";
  return prompt;
}

export function normalizeCheckinChoiceOptions(
  options: string[] | null | undefined,
) {
  const normalized = (options ?? [])
    .map((option) => option.trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function getCheckinQuestionOptions(question: CheckinQuestionLike) {
  const type = normalizeCheckinQuestionType(question);
  if (type === "yes_no") return ["Yes", "No"];
  if (type === "choice") return normalizeCheckinChoiceOptions(question.options);
  return [];
}

export function mapCheckinQuestionToDraft(
  question: CheckinQuestionLike,
  index: number,
): CheckinQuestionDraft {
  return {
    id: question.id ?? crypto.randomUUID(),
    questionText: getCheckinQuestionLabel(question),
    helpText: getCheckinQuestionHelpText(question),
    type: normalizeCheckinQuestionType(question),
    isRequired: Boolean(question.is_required),
    options: getCheckinQuestionOptions(question),
    sortOrder: question.sort_order ?? question.position ?? (index + 1) * 10,
  };
}

export function createEmptyCheckinQuestionDraft(index: number) {
  return {
    id: crypto.randomUUID(),
    questionText: "",
    helpText: "",
    type: "text" as SupportedCheckinQuestionType,
    isRequired: false,
    options: ["", ""],
    sortOrder: (index + 1) * 10,
  };
}

export function validateCheckinQuestionDraft(
  question: CheckinQuestionDraft,
  index: number,
) {
  if (!question.questionText.trim()) {
    return `Question ${index + 1} needs a prompt.`;
  }

  if (
    question.type === "choice" &&
    normalizeCheckinChoiceOptions(question.options).length < 2
  ) {
    return `Question ${index + 1} needs at least two choice options.`;
  }

  return null;
}

export function formatDuplicateTemplateName(name: string | null | undefined) {
  const baseName = name?.trim() || "Untitled template";
  return `${baseName} copy`;
}
