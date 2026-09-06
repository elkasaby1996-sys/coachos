import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workoutRunSource = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "workout-run.tsx"),
  "utf8",
);

const coachRailSource = readFileSync(
  resolve(
    process.cwd(),
    "src",
    "components",
    "client",
    "workout-session",
    "CoachRail.tsx",
  ),
  "utf8",
);

describe("client workout runner chrome cleanup", () => {
  it("removes secondary header copy and sticky finish bar from the runner", () => {
    expect(workoutRunSource).toContain(
      'className="flex flex-wrap items-center gap-2"',
    );
    expect(workoutRunSource).toContain(
      '<Badge variant="muted">In progress</Badge>',
    );
    expect(workoutRunSource).not.toContain("Workout run");
    expect(workoutRunSource).not.toContain("Log your sets as you go.");
    expect(workoutRunSource).not.toContain(
      "Ready to finish? Save and log your session.",
    );
    expect(workoutRunSource).not.toContain(
      "fixed bottom-0 left-0 right-0 z-30",
    );
  });

  it("embeds the rest timer inside the session progress card", () => {
    expect(coachRailSource).toContain(
      'import { RestTimer } from "./RestTimer";',
    );
    expect(coachRailSource.indexOf('title="Session progress"')).toBeLessThan(
      coachRailSource.indexOf("<RestTimer"),
    );
    expect(workoutRunSource).toContain(
      "const [restAutoStart, setRestAutoStart]",
    );
    expect(workoutRunSource).toContain("autoStartTrigger={completedSetCount}");
    expect(coachRailSource).not.toContain('title="Rest timer"');
    expect(coachRailSource).not.toContain("Show timer panel");
  });
});
