export type CharacterLimitKind =
  | "full_name"
  | "short_name"
  | "entity_name"
  | "bio"
  | "email"
  | "default_text";

export const CHARACTER_LIMITS: Record<CharacterLimitKind, number> = {
  full_name: 255,
  short_name: 50,
  entity_name: 100,
  bio: 300,
  email: 254,
  default_text: 255,
};

export type CharacterLimitState = {
  value: string;
  count: number;
  limit: number;
  remaining: number;
  overLimit: boolean;
  errorText: string | null;
};

export function getCharacterLimit(kind: CharacterLimitKind) {
  return CHARACTER_LIMITS[kind];
}

export function getCharacterCount(value: string) {
  return [...value].length;
}

export function getCharacterLimitState(params: {
  value: string | null | undefined;
  kind?: CharacterLimitKind;
  limit?: number;
  fieldLabel?: string;
}): CharacterLimitState {
  const value = params.value ?? "";
  const limit = params.limit ?? getCharacterLimit(params.kind ?? "default_text");
  const count = getCharacterCount(value);
  const remaining = limit - count;
  const overLimit = count > limit;
  const fieldLabel = params.fieldLabel ?? "This field";

  return {
    value,
    count,
    limit,
    remaining,
    overLimit,
    errorText: overLimit ? `${fieldLabel} must be ${limit} characters or fewer.` : null,
  };
}

export function hasCharacterLimitError(states: Array<CharacterLimitState | null | undefined>) {
  return states.some((state) => Boolean(state?.overLimit));
}

