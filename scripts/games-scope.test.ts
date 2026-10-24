import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { writeGameTree } from "./fixtures/gameTree";
import { findFrontEndGaps } from "./gameFrontEnd";
import { findGameFeelGaps } from "./gameFeel";
import {
  gamesCheckout,
  gamesCheckoutLine,
  gamesHead,
  gamesPin,
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

describe("check-game-feel end to end", () => {  test("passes on a clone with extra games, and warns naming them", () => {
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

const PIN = "7fe11849dcb84f04f0c564ecd9c77cb1aed22da5";
const OLD = "67f6ed9bc5e66aadc15ad6dee391117f3aace947";

/** A checkout-shaped tree: the pin file, and a Games/.git whose HEAD is `head`. */
function checkoutTree(head: string | null, pin: string | null = PIN): string {
  const root = join(import.meta.dir, "..", ".scratch", `games-checkout-${randomUUID().slice(0, 8)}`);
  roots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  if (pin !== null) writeFileSync(join(root, "scripts", "games-ref.txt"), `${pin}\n`);
  if (head !== null) {
    mkdirSync(join(root, "Games", ".git"), { recursive: true });
    writeFileSync(join(root, "Games", ".git", "HEAD"), `${head}\n`);
  }
  return root;
}

describe("the Games commit a gate measures", () => {
  test("names the pinned commit when the clone is at it", () => {
    const root = checkoutTree(PIN);
    expect(gamesPin(root)).toBe(PIN);
    expect(gamesHead(root)).toBe(PIN);
    const checkout = gamesCheckout(root);
    expect(checkout.state).toBe("at-pin");
    expect(gamesCheckoutLine("check-game-feel", checkout)).toBe("check-game-feel: measuring Games/ at 7fe1184 (pin)");
  });

  test("names both commits when the clone is not the pin, so an old tree cannot hide", () => {
    const root = checkoutTree(OLD);
    const checkout = gamesCheckout(root);
    expect(checkout.state).toBe("stale");
    const line = gamesCheckoutLine("perf gate", checkout);
    expect(line).toContain("67f6ed9");
    expect(line).toContain("7fe1184");
    expect(line).toContain("measuring an unpinned checkout");
    expect(line).toContain("bun run games:update");
  });

  test("says nothing was measured when there is no clone, and still names the pin", () => {
    const root = checkoutTree(null);
    const checkout = gamesCheckout(root);
    expect(checkout.state).toBe("absent");
    const line = gamesCheckoutLine("games:check", checkout);
    expect(line).toContain("no Games/ checkout");
    expect(line).toContain("7fe1184");
    expect(line).toContain("bun run games:clone");
  });

  test("follows a branch HEAD through the loose ref, without a git process", () => {
    const root = checkoutTree(null);
    mkdirSync(join(root, "Games", ".git", "refs", "heads"), { recursive: true });
    writeFileSync(join(root, "Games", ".git", "HEAD"), "ref: refs/heads/stable\n");
    writeFileSync(join(root, "Games", ".git", "refs", "heads", "stable"), `${PIN}\n`);
    expect(gamesHead(root)).toBe(PIN);
  });

  test("a GAMES_REF override is reported as the expectation, not as drift", () => {
    const root = checkoutTree(OLD, PIN);
    const previous = process.env.GAMES_REF;
    try {
      process.env.GAMES_REF = OLD;
      expect(gamesCheckout(root).state).toBe("at-pin");
      process.env.GAMES_REF = "some-branch";
      const override = gamesCheckout(root);
      expect(override.state).toBe("override");
      expect(gamesCheckoutLine("smoke", override)).toContain("GAMES_REF=some-branch");
    } finally {
      if (previous === undefined) delete process.env.GAMES_REF;
      else process.env.GAMES_REF = previous;
    }
  });

  test("a tree with no pin file cannot be lied about: it says so and does not fail", () => {
    const root = checkoutTree(PIN, null);
    const checkout = gamesCheckout(root);
    expect(checkout.state).toBe("no-pin");
    expect(gamesCheckoutLine("check-module-globals", checkout)).toContain("no pin in scripts/games-ref.txt");
  });
});

describe("a gate reading a stale Games/ checkout", () => {
  test("fails and names both commits before scanning anything", () => {
    const root = gateTree({ "Games/harbor-heat/src/index.tsx": healthy });
    writeFileSync(join(root, "scripts", "games-ref.txt"), `${PIN}\n`);
    mkdirSync(join(root, "Games", ".git"), { recursive: true });
    writeFileSync(join(root, "Games", ".git", "HEAD"), `${OLD}\n`);
    const { code, output } = runGate(root);
    expect(code).toBe(1);
    expect(output).toContain("67f6ed9");
    expect(output).toContain("7fe1184");
    expect(output).not.toContain("check-game-feel ok");
  });

  test("GAMES_ALLOW_STALE=1 keeps the run and still says it is unpinned", () => {
    const root = gateTree({ "Games/harbor-heat/src/index.tsx": healthy });
    writeFileSync(join(root, "scripts", "games-ref.txt"), `${PIN}\n`);
    mkdirSync(join(root, "Games", ".git"), { recursive: true });
    writeFileSync(join(root, "Games", ".git", "HEAD"), `${OLD}\n`);
    const proc = Bun.spawnSync(["bun", join(root, "scripts/check-game-feel.ts")], {
      cwd: root,
      timeout: 60_000,
      env: { ...process.env, GAMES_ALLOW_STALE: "1" },
    });
    const output = proc.stdout.toString() + proc.stderr.toString();
    expect(proc.exitCode).toBe(0);
    expect(output).toContain("measuring an unpinned checkout");
    expect(output).toContain("check-game-feel ok");
  });
});
