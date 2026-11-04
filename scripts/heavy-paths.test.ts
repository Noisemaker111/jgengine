import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { FRAME_GAMES, gameScope, playableGames, REPRESENTATIVE_GAME } from "./ci-scope";
import { SMOKE_GAMES } from "./smoke-games";

// The `changes` job turns the game jobs on from `scripts/ci-scope.ts`. This holds both
// directions: every path a frame's own work runs through measures every game, and a docs
// or test change stays on the fast lane. #2218 changed movement, scene and runtime and
// merged with both gates skipped; #2342 changed the react menu and skipped them the same
// way. The sentinel job keeps the last block (the `ci` rollup) inside a lookahead.
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
  test("measures every game for every path the frame's own work runs through", () => {
    expect(FRAME_OWNERS.filter((path) => gameScope([path]).scope !== "full")).toEqual([]);
  });

  test("leaves docs and tests with no game job", () => {
    expect(FAST_PATHS.filter((path) => gameScope([path]).scope !== "none")).toEqual([]);
  });

  test("the one game list is every game folder with a web entry", () => {
    const entries = [...new Bun.Glob("games/*/src/index.tsx").scanSync({ cwd: fileURLToPath(new URL("..", import.meta.url)) })];
    const games = entries.map((entry) => entry.replaceAll("\\", "/").split("/")[1] ?? "").sort();
    expect([...FRAME_GAMES]).toEqual(games);
    expect(FRAME_GAMES).toContain(REPRESENTATIVE_GAME);
    // The ships-the-frame smoke set stays a subset, so folding it into the frame gate lost no game.
    for (const game of SMOKE_GAMES) expect(FRAME_GAMES).toContain(game);
  });

  test("a game folder without a web entry is not a playable game", () => {
    const root = mkdtempSync(join(tmpdir(), "playable-"));
    try {
      mkdirSync(join(root, "games", "shooter", "src"), { recursive: true });
      writeFileSync(join(root, "games", "shooter", "src", "index.tsx"), "");
      mkdirSync(join(root, "games", "notes"), { recursive: true });
      mkdirSync(join(root, "games", "racer", "src"), { recursive: true });
      writeFileSync(join(root, "games", "racer", "src", "index.tsx"), "");
      expect(playableGames(root)).toEqual(["racer", "shooter"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("CI never boots a game or downloads a model", () => {
    for (const forbidden of ["perf-game:", "smoke-game:", "games:provision", "capabilities-probe", "perf:gate", "assets pull", "public/models"]) {
      expect(workflow).not.toContain(forbidden);
    }
  });

  test("the ci check branch protection reads names the scope", () => {
    expect(jobBlock("ci")).toContain("needs.changes.outputs.reason");
  });

  test("a change-notes diff skips the test shards, and a skipped matrix cannot pass as run", () => {
    expect(jobBlock("test")).toContain("needs.changes.outputs.tests != 'none'");
    expect(jobBlock("ci")).toContain('test "$TEST" = "skipped"');
    expect(jobBlock("ci")).toContain('test "$TEST" = "success"');
  });
});
