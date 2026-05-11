export type CalendarMentionUser = {
  user_id: string;
  display_name: string;
  role: "client" | "coach" | string;
};

export function getActiveMentionQuery(value: string) {
  const match = value.match(/(?:^|\s)@([^\s@]*)$/);
  return match?.[1] !== undefined ? match[1].toLowerCase() : null;
}

export function normalizeMentionLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function filterMentionUsers(
  users: CalendarMentionUser[],
  query: string | null,
) {
  if (query === null) return [];
  const normalizedQuery = query.toLowerCase();
  return users
    .filter((user) => user.display_name.toLowerCase().includes(normalizedQuery))
    .slice(0, 6);
}

export function insertMention(value: string, displayName: string) {
  const label = normalizeMentionLabel(displayName);
  if (!label) return value;

  if (/(^|\s)@[^\s@]*$/.test(value)) {
    return value.replace(/(^|\s)@[^\s@]*$/, `$1@${label} `);
  }

  return `${value}${value.endsWith(" ") || value.length === 0 ? "" : " "}@${label} `;
}

export function getSelectedMentionIds(
  selectedIds: string[],
  users: CalendarMentionUser[],
  text: string,
) {
  const ids = new Set(selectedIds);
  for (const user of users) {
    const label = normalizeMentionLabel(user.display_name);
    if (!label) continue;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?])`, "i").test(text)) {
      ids.add(user.user_id);
    }
  }
  return Array.from(ids);
}
