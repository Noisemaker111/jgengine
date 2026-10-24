import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readsPinnedGames } from "./fixtures/gamesGate";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("games:check", () => {
  test("names the Games commit it measures and fails off the pin", () => {
    expect(() => readsPinnedGames("games:check", "games-check.ts")).not.toThrow();
  });

  /** The script reads `./Games` when it loads, so this drives it as a process rather than importing it. */
  test("an unknown game is named rather than quietly checking nothing", () => {
    const run = spawnSync("bun", ["scripts/games-check.ts", "no-such-game", "--types-only"], { cwd: root, encoding: "utf8", timeout: 120_000 });
    expect(`${run.stdout}${run.stderr}`).toContain('games:check: unknown game "no-such-game"');
  });
});
