import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { writeGameTree } from "./fixtures/gameTree";
import { findFrontEndGaps } from "./gameFrontEnd";
import { findGameFeelGaps } from "./gameFeel";
import { ignoredGames, ignoredGamesWarning, referenceGames, warnIgnoredGames } from "./games-scope";

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

/** A clone holding the reference set plus games another checkout of the games repo is working on. */
function clone(extra: Record<string, string>): string {
  const root = writeGameTree("games-scope-", { "scripts/perf-budget.json": BUDGET, ...extra });
  roots.push(root);
  return root;
}

/** The same clone with the real gate script copied beside it, so it runs end to end. */
function gateTree(files: Record<string, string>): string {
  const root = clone({ ...files, "scripts/game-feel-baseline.json": "[]\n" });
  mkdirSync(join(root, "scripts"), { recursive: true });
  for (const name of ["check-game-feel.ts", "gameFeel.ts", "games-scope.ts", "ratchet.ts"]) {
    copyFileSync(join(import.meta.dir, name), join(root, "scripts", name));
  }
  return root;
}

function runGate(root: string): { code: number | null; output: string } {
  const proc = Bun.spawnSync(["bun", join(root, "scripts/check-game-feel.ts")], { cwd: root, timeout: 60_000 });
  return { code: proc.exitCode, output: proc.stdout.toString() + proc.stderr.toString() };
}

const healthy = "camera targetSmoothing; attack; audio.play(); hitReaction;";
const defective = "const camera = true;";

describe("the Games scope", () => {
  test("is the reference set the perf gate measures, whatever the clone also holds", () => {
    const root = clone({ "Games/beatlane/src/index.tsx": "attack; camera;" });
    expect(referenceGames(root)).toEqual(REFERENCE);
    expect(ignoredGames(root, referenceGames(root))).toEqual(["beatlane"]);
  });

  test("names every extra game it skipped", async () => {
    const root = clone({
      "Games/beatlane/src/index.tsx": "attack;",
      "Games/apexline/index.html": "<div id=root></div>",
      "Games/beatlane/package.json": "{}",
    });
    // A helper package beside the games is not a game, so it is not named as one.
    await Bun.write(`${root}/Games/studios/src/index.ts`, "export {};\n");
    const ignored = ignoredGames(root, referenceGames(root));
    expect(ignored).toEqual(["apexline", "beatlane"]);
    expect(ignoredGamesWarning("check-game-feel", ignored)).toContain("apexline, beatlane");
    expect(ignoredGamesWarning("check-game-feel", ignored)).toStartWith("check-game-feel: ignoring 2 game(s)");
  });

  test("warns only when a game was skipped", () => {
    expect(ignoredGamesWarning("check-game-feel", [])).toBeNull();
    const lines: string[] = [];
    const written = console.warn;
    console.warn = (line: string) => void lines.push(line);
    try {
      warnIgnoredGames("check-game-feel", []);
      warnIgnoredGames("check-game-feel", ["beatlane"]);
    } finally {
      console.warn = written;
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("beatlane");
  });
});

describe("a gate scoped to the reference set", () => {
  test("passes on a clone with extra sibling games that have defects of their own", () => {
    const root = clone({
      "Games/harbor-heat/src/index.tsx": healthy,
      "Games/beatlane/src/index.tsx": defective,
      "Games/deepstack/src/index.tsx": "const camera = true; attack;",
    });
    expect(findGameFeelGaps(root, referenceGames(root))).toEqual([]);
    expect(findFrontEndGaps(root, referenceGames(root)).map((gap) => gap.key)).toEqual([
      "harbor-heat#credits",
      "harbor-heat#settings",
    ]);
  });

  test("still fails on a real defect in one of the eight", () => {
    const root = clone({
      "Games/harbor-heat/src/index.tsx": healthy,
      "Games/deepward/src/index.tsx": defective,
      "Games/beatlane/src/index.tsx": healthy,
    });
    expect(findGameFeelGaps(root, referenceGames(root)).map((gap) => gap.key)).toEqual(["deepward#camera-smoothing"]);
  });

  test("the unscoped scan still sees every game, so a fixture tree keeps working", () => {
    const root = clone({ "Games/beatlane/src/index.tsx": defective });
    expect(findGameFeelGaps(root).map((gap) => gap.key)).toEqual(["beatlane#camera-smoothing"]);
  });
});

describe("check-game-feel end to end", () => {
  test("passes on a clone with extra games, and warns naming them", () => {
    const root = gateTree({
      "Games/harbor-heat/src/index.tsx": healthy,
      "Games/apexline/src/index.tsx": defective,
      "Games/deepstack/src/index.tsx": "const camera = true; attack;",
    });
    const { code, output } = runGate(root);
    expect(code).toBe(0);
    expect(output).toContain("check-game-feel ok");
    expect(output).toContain("ignoring 2 game(s)");
    expect(output).toContain("apexline, deepstack");
  });

  test("still fails on a real defect in one of the eight", () => {
    const root = gateTree({
      "Games/harbor-heat/src/index.tsx": defective,
      "Games/beatlane/src/index.tsx": healthy,
    });
    const { code, output } = runGate(root);
    expect(code).toBe(1);
    expect(output).toContain("harbor-heat — camera needs damping or smoothing");
    expect(output).toContain("failed: 1 new offender(s)");
  });
});
