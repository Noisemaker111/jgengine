import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

// The `changes` job turns the frame and smoke gates on from one path pattern. This holds both
// directions: every path a frame's own work runs through pays for the gate, and a docs or
// unrelated change stays on the fast lane. #2218 changed movement, scene and runtime, skipped
// both gates, and merged unseen.
const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)), "utf8");

function jobBlock(name: string): string {
  return new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}\\S)`, "m").exec(workflow)?.[1] ?? "";
}

/** The single-quoted pattern the `changes` job greps the changed paths with. */
const heavy = new RegExp(/grep -Eq '([^']+)'/.exec(jobBlock("changes"))?.[1] ?? "(?!)");

const FRAME_OWNERS = [
  "packages/core/src/render/postProcessing.ts",
  "packages/core/src/scene/objectStore.ts",
  "packages/core/src/sim/population.ts",
  "packages/core/src/ai/crowd.ts",
  "packages/core/src/nav/navCrowd.ts",
  "packages/core/src/physics/physicsWorld.ts",
  "packages/core/src/movement/solidObstacles.ts",
  "packages/core/src/runtime/simLoop.ts",
  "packages/core/src/time/simClock.ts",
  "packages/core/src/game/systemRuntime.ts",
  "packages/core/src/game/systemSchedule.ts",
];

const FAST_PATHS = [
  "README.md",
  "AGENTS.md",
  "changes/agent-lane-heavy-paths.md",
  ".claude/skills/jgengine-world/SKILL.md",
  "apps/web/src/routes/index.tsx",
  "packages/core/src/cards/cardPile.ts",
];

describe("heavy path list", () => {
  test("turns both gates on for every path the frame's own work runs through", () => {
    expect(FRAME_OWNERS.filter((path) => !heavy.test(path))).toEqual([]);
  });

  test("leaves docs and unrelated work on the fast lane", () => {
    expect(FAST_PATHS.filter((path) => heavy.test(path))).toEqual([]);
  });

  test("a heavy verdict needs the gated jobs rather than letting them skip", () => {
    for (const job of ["perf-game", "smoke-game"]) {
      const block = jobBlock(job);
      expect(block).toContain("needs: [changes]");
      expect(block).toContain("if: needs.changes.outputs.heavy == 'true'");
    }
  });
});
