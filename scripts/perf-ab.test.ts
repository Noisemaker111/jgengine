import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { abVerdict, affectedGames, awayFromHome, BASE_TREE_KEEP_MS, baseTreeName, expiredBaseTrees, homeRequest, medianMs, pairLogRatio, parseAbArgs, percentileMs, plantScript, renderAbTable, rendererCpuPct, routeSpread, t99, treeFingerprint, type AbGameResult } from "./perf-ab";

const GAMES = ["deepward", "harbor-heat", "scrap-signal"];
const options = { minBlocks: 4, maxBlocks: 16, marginPct: 3 };
const ratios = (pcts: readonly number[]) => pcts.map((pct) => Math.log(1 + pct / 100));

test("a planted 5% regression reads as slower within the minimum pairs", () => {
  const verdict = abVerdict(ratios([5.4, 4.6, 5.2, 4.9]), options);
  expect(verdict?.call).toBe("slower");
  expect(verdict?.blocks).toBe(4);
  expect(verdict!.lowPct).toBeGreaterThan(0);
  expect(verdict!.changePct).toBeCloseTo(5, 0);
});

test("a no-op reads as no difference once the interval fits inside the margin", () => {
  expect(abVerdict(ratios([0.4, -0.3, 0.2, -0.1]), options)?.call).toBe("same");
});

test("an interval past zero but not past the 1% floor is not called a change", () => {
  // The 2026-11-09 no-op: +3.4%, interval +0.1% to +6.9%, the same game code on both sides.
  const nearZero = ratios([3.4, 0.2, 6.6, 3.5, 0.3, 6.5, 3.4, 0.4, 6.4]);
  expect(abVerdict(nearZero, { ...options, floorPct: 0 })?.call).toBe("slower");
  expect(abVerdict(nearZero, options)).toBeNull();
});

test("a faster branch reads as faster", () => {
  expect(abVerdict(ratios([-8, -7.5, -9, -8.2]), options)?.call).toBe("faster");
});

test("an undecided interval keeps measuring until the block limit, then says unclear", () => {
  const noisy = ratios([6, -5, 4, -6]);
  expect(abVerdict(noisy, options)).toBeNull();
  expect(abVerdict(noisy.slice(0, 3), options)).toBeNull();
  const atLimit = abVerdict(noisy, { ...options, maxBlocks: 4 });
  expect(atLimit?.call).toBe("unclear");
  expect(atLimit!.lowPct).toBeLessThan(0);
  expect(atLimit!.highPct).toBeGreaterThan(0);
});

test("t99 falls with more pairs and holds past the table", () => {
  expect(t99(3)).toBeCloseTo(5.841, 3);
  expect(t99(15)).toBeLessThan(t99(5));
  expect(t99(100)).toBe(2.75);
  expect(t99(0)).toBe(Number.POSITIVE_INFINITY);
});

test("a pair's ratio is its branch window over the base window just before it", () => {
  expect(pairLogRatio(20, 20)).toBeCloseTo(0, 9);
  expect(Math.exp(pairLogRatio(20, 21)) - 1).toBeCloseTo(0.05, 9);
});

test("medianMs drops non-frames and takes the middle", () => {
  expect(medianMs([3, 1, 2])).toBe(2);
  expect(medianMs([4, 1, 3, 2, 0, Number.NaN])).toBe(2.5);
  expect(medianMs([])).toBeNaN();
});

test("percentileMs reads the slow tail: one tick frame in six shows at p90, not at p50", () => {
  const frames = Array.from({ length: 600 }, (_, index) => (index % 6 === 5 ? 6 : 2.5));
  expect(percentileMs(frames, 50)).toBe(2.5);
  expect(percentileMs(frames, 90)).toBe(6);
  expect(percentileMs([1, 2, 3, 4, 5], 75)).toBe(4);
  expect(percentileMs([1, 2], 50)).toBe(1.5);
  expect(percentileMs([0, Number.NaN], 90)).toBeNaN();
});

test("affectedGames: the engine changes every game, a game folder only that game, scripts none", () => {
  expect(affectedGames(["packages/core/src/render/pass.ts"], GAMES)).toEqual(GAMES);
  expect(affectedGames(["packages/core/src/render/pass.test.ts", "scripts/perf-ab.ts", "AGENTS.md"], GAMES)).toEqual([]);
  expect(affectedGames(["games/deepward/src/level.ts", "games/harbor-heat/PLAN.md"], GAMES)).toEqual(["deepward"]);
  expect(affectedGames(["games/shared/provisionAssets.ts"], GAMES)).toEqual(GAMES);
  expect(affectedGames(["apps/dev/src/main.tsx"], GAMES)).toEqual(GAMES);
  expect(affectedGames(["bun.lock"], GAMES)).toEqual(GAMES);
});

test("parseAbArgs reads every flag and refuses bad values", () => {
  const parsed = parseAbArgs(["--games", "deepward,harbor-heat", "--base", "origin/beta", "--window", "1.5", "--blocks", "3,9", "--margin", "2.5", "--path", "still", "--plant-ms", "1.2", "--markdown"]);
  if (parsed === "help") throw new Error("parsed as help");
  expect(parsed.games).toEqual(["deepward", "harbor-heat"]);
  expect(parsed.base).toBe("origin/beta");
  expect(parsed.windowSeconds).toBe(1.5);
  expect([parsed.minBlocks, parsed.maxBlocks]).toEqual([3, 9]);
  expect(parsed.marginPct).toBe(2.5);
  expect(parsed.path).toBe("still");
  expect(parsed.plantMs).toBe(1.2);
  expect(parsed.markdown).toBe(true);
  expect(parseAbArgs(["--help"])).toBe("help");
  const defaults = parseAbArgs([]);
  if (defaults === "help") throw new Error("parsed as help");
  expect([defaults.path, defaults.marginPct, defaults.minBlocks, defaults.maxBlocks, defaults.windowSeconds, defaults.percentile]).toEqual(["still", 4, 4, 30, 2, 50]);
  const tail = parseAbArgs(["--stat", "p90"]);
  if (tail === "help") throw new Error("parsed as help");
  expect(tail.percentile).toBe(90);
  expect(() => parseAbArgs(["--stat", "p100"])).toThrow("percentile");
  expect(() => parseAbArgs(["--stat", "max"])).toThrow("percentile");
  expect(() => parseAbArgs(["--blocks", "9,3"])).toThrow("max >= min");
  expect(() => parseAbArgs(["--games"])).toThrow("needs a value");
  expect(() => parseAbArgs(["--path", "fly"])).toThrow("walk or still");
  expect(() => parseAbArgs(["--nope", "1"])).toThrow("unknown argument");
});

test("the fingerprint changes when a served file is edited, not when the edit is committed", () => {
  const dir = mkdtempSync(join(tmpdir(), "perf-ab-fp-"));
  try {
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    for (const folder of ["packages", "apps", "games"]) {
      mkdirSync(join(dir, folder));
      writeFileSync(join(dir, folder, "a.ts"), "1\n");
    }
    git("add", "-A");
    git("commit", "-q", "-m", "one");
    const clean = treeFingerprint(dir);
    writeFileSync(join(dir, "packages", "a.ts"), "2\n");
    const edited = treeFingerprint(dir);
    expect(edited).not.toBe(clean);
    git("commit", "-q", "-am", "two");
    expect(treeFingerprint(dir)).toBe(edited);
    writeFileSync(join(dir, "games", "new.ts"), "untracked\n");
    expect(treeFingerprint(dir)).not.toBe(edited);
    writeFileSync(join(dir, "notes.md"), "not served\n");
    rmSync(join(dir, "games", "new.ts"));
    expect(treeFingerprint(dir)).toBe(edited);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // About twenty git processes; past bun's 5 s default on a PC at full load.
}, 30_000);

test("renderer CPU sums the renderers alive at both readings, as a percent of one core", () => {
  const before = new Map([["renderer:1", 10], ["renderer:2", 4], ["gpu:3", 1]]);
  const after = new Map([["renderer:1", 12], ["renderer:2", 4.5], ["gpu:3", 9], ["renderer:4", 50]]);
  expect(rendererCpuPct(before, after, 2_000)).toBe(125);
  expect(rendererCpuPct(before, before, 2_000)).toBe(0);
});

test("routeSpread names how far apart the windows' walks ended, ignoring the primer pair", () => {
  const at = (block: number, x: number, z: number) => ({ block, route: { from: [0, 0, 0], to: [x, 1, z] } });
  // The alternating routes of the 2026-11-09 pilot: north-east ends near z 47, south ends near z 29.
  expect(routeSpread([at(1, -179.7, 47), at(2, -190.1, 28.7), at(3, -177.7, 41.5)])).toBeGreaterThan(18);
  expect(routeSpread([at(0, 0, 0), at(1, -180, 40), at(2, -180.5, 40.4)])).toBeLessThan(1);
  expect(routeSpread([{ block: 1, route: null }])).toBe(0);
});

test("every window's walk starts from the warmed-up pose", () => {
  expect(JSON.parse(homeRequest({ x: 1, y: 2, z: 3, yaw: 0.5 }))).toEqual({ method: "teleport", x: 1, y: 2, z: 3, yaw: 0.5 });
});

test("the base tree is named for its commit", () => {
  expect(baseTreeName("6c5e869e2e1234")).toBe("perf-base-6c5e869e2e");
});

test("only base trees unused for a day are removed, never the one being made or another checkout", () => {
  const now = 10 * BASE_TREE_KEEP_MS;
  const trees = [
    { name: "perf-base-aaaaaaaaaa", usedAtMs: now - 60_000 },
    { name: "perf-base-bbbbbbbbbb", usedAtMs: now - BASE_TREE_KEEP_MS - 1 },
    { name: "perf-base-cccccccccc", usedAtMs: 0 },
    { name: "agent-some-thread", usedAtMs: 0 },
  ];
  expect(expiredBaseTrees(trees, "perf-base-cccccccccc", now)).toEqual(["perf-base-bbbbbbbbbb"]);
});

test("the planted busy-wait runs once a frame, before the page's own callback", () => {
  const source = plantScript(1.5);
  expect(source).toContain("performance.now() + 1.5");
  expect(source).toContain("now !== frame");
});

test("the table says the verdict, change and interval per game", () => {
  const result: AbGameResult = {
    game: "harbor-heat",
    verdict: { call: "slower", blocks: 5, changePct: 5.1, lowPct: 3.2, highPct: 7 },
    baseMs: 24.6, branchMs: 25.85, windows: [], lockSeconds: 95,
  };
  const table = renderAbTable([result], { markdown: true, marginPct: 3 });
  expect(table).toContain("| harbor-heat | slower | +5.1% | +3.2% to +7.0% | 24.60 | 25.85 | 5 | 95 |");
  expect(table).toContain("| base p50 ms | branch p50 ms |");
  expect(renderAbTable([result], { markdown: true, marginPct: 3, percentile: 90 })).toContain("| base p90 ms | branch p90 ms |");
});

test("distance from home is on the ground, and a game with no pose counts as home", () => {
  const home = { x: 0, y: 0, z: 100, yaw: 0 };
  expect(awayFromHome([3, 9, 104], home)).toBeCloseTo(5, 9);
  expect(awayFromHome(null, home)).toBe(0);
});
