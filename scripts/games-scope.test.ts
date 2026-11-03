import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";

import { writeGameTree } from "./fixtures/gameTree";
import {
  ignoredGames,
  ignoredGamesWarning,
  referenceGames,
  warnIgnoredGames,
} from "./games-scope";

const REFERENCE = [
  "beacon-bastion",
  "brightway-park",
  "deepward",
  "drift-foundry",
  "ember-command",
  "harbor-heat",
  "odd-orbit",
  "scrap-signal",
];

const BUDGET = JSON.stringify(Object.fromEntries(REFERENCE.map((game) => [game, {}])));

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A games/ folder holding the reference set plus games outside it. */
function clone(extra: Record<string, string>): string {
  const root = writeGameTree("games-scope-", { "scripts/perf-budget.json": BUDGET, ...extra });
  roots.push(root);
  return root;
}

describe("the Games scope", () => {
  test("is the reference set the perf gate measures, whatever the clone also holds", () => {
    const root = clone({ "games/beatlane/src/index.tsx": "attack; camera;" });
    expect(referenceGames(root)).toEqual(REFERENCE);
    expect(ignoredGames(root, referenceGames(root))).toEqual(["beatlane"]);
  });

  test("names every extra game it skipped", async () => {
    const root = clone({
      "games/beatlane/src/index.tsx": "attack;",
      "games/apexline/index.html": "<div id=root></div>",
      "games/beatlane/package.json": "{}",
    });
    // A helper package beside the games is not a game, so it is not named as one.
    await Bun.write(`${root}/games/studios/src/index.ts`, "export {};\n");
    const ignored = ignoredGames(root, referenceGames(root));
    expect(ignored).toEqual(["apexline", "beatlane"]);
    expect(ignoredGamesWarning("check-game-determinism", ignored)).toContain("apexline, beatlane");
    expect(ignoredGamesWarning("check-game-determinism", ignored)).toStartWith("check-game-determinism: ignoring 2 game(s)");
  });

  test("warns only when a game was skipped", () => {
    expect(ignoredGamesWarning("check-game-determinism", [])).toBeNull();
    const lines: string[] = [];
    const written = console.warn;
    console.warn = (line: string) => void lines.push(line);
    try {
      warnIgnoredGames("check-game-determinism", []);
      warnIgnoredGames("check-game-determinism", ["beatlane"]);
    } finally {
      console.warn = written;
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("beatlane");
  });
});

