import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "src/components/layouts/client-layout.tsx",
  "src/components/client/portal/portal-ui.tsx",
  "src/features/notifications/components/notification-bell.tsx",
  "src/pages/client/home.tsx",
  "src/pages/client/messages.tsx",
  "src/pages/client/workouts.tsx",
  "src/pages/client/workout-today.tsx",
  "src/pages/client/workout-summary.tsx",
  "src/pages/client/nutrition.tsx",
  "src/pages/client/nutrition-create-plan.tsx",
  "src/pages/client/profile.tsx",
  "src/pages/client/medical.tsx",
  "src/pages/client/progress.tsx",
] as const;

const bannedIconLibPatterns = [
  /from\s+["']@radix-ui\/react-icons["']/,
  /from\s+["']react-icons(?:\/[^"']+)?["']/,
  /from\s+["']@heroicons\/react(?:\/[^"']+)?["']/,
  /from\s+["']@tabler\/icons-react["']/,
  /from\s+["']phosphor-react["']/,
  /from\s+["']@fortawesome\//,
];

describe("client-side icon library consistency", () => {
  it("keeps app-side icon imports on lucide-react", () => {
    for (const relativePath of files) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      for (const pattern of bannedIconLibPatterns) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
