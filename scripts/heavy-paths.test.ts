import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { gameScope } from "./ci-scope";

// The `changes` job turns the frame and smoke gates on from `scripts/ci-scope.ts`. This holds
// both directions: every path a frame's own work runs through pays for the gate, and a docs or
// unrelated change stays on the fast lane. #2218 changed movement, scene and runtime, skipped
// both gates, and merged unseen; #2342 changed the react menu and skipped them the same way.
// The sentinel job keeps the last block (the `ci` rollup) inside a lookahead.
const workflow = `${readFileSync(fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)), "utf8")}\n  __end__:\n`;

function jobBlock(name: string): string {
  return new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}\\S)`, "m").exec(workflow)?.[1] ?? "";
}

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
  "packages/react/src/gameMenu.tsx",
  "packages/shell/src/Shell3dPresentation.tsx",
];

const FAST_PATHS = [
  "README.md",
  "AGENTS.md",
  "changes/agent-lane-heavy-paths.md",
  ".claude/skills/jgengine-world/SKILL.md",
  "apps/web/src/routes/index.tsx",
  "packages/core/src/cards/cardPile.test.ts",
];

describe("game scope", () => {
  test("runs both game jobs for every path a game loads", () => {
    expect(FRAME_OWNERS.filter((path) => gameScope([path]).scope !== "full")).toEqual([]);
  });

  test("leaves docs and tests on the fast lane", () => {
    expect(FAST_PATHS.filter((path) => gameScope([path]).scope !== "none")).toEqual([]);
  });

  test("a full verdict needs both gated jobs rather than letting them skip", () => {
    for (const job of ["perf-game", "smoke-game"]) {
      const block = jobBlock(job);
      expect(block).toContain("needs: [changes]");
      expect(block).toContain("needs.changes.outputs.games");
    }
  });

  test("the frame gate skips only below a full verdict, and the verdicts name the skip", () => {
    expect(jobBlock("perf-game")).toContain("needs.changes.outputs.games == 'full'");
    expect(jobBlock("smoke-game")).toContain("needs.changes.outputs.games != 'none'");
    for (const job of ["perf", "smoke", "ci"]) {
      expect(jobBlock(job)).toContain("needs.changes.outputs.reason");
    }
  });
});
