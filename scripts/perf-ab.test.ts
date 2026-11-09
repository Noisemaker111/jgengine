import { expect, test } from "bun:test";

import { abVerdict, affectedGames, baseTreeName, blockOrder, medianMs, parseAbArgs, plantScript, renderAbTable, t99, type AbGameResult } from "./perf-ab";

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

test("blocks alternate which side goes first", () => {
  expect(blockOrder(0)).toEqual(["base", "branch"]);
  expect(blockOrder(1)).toEqual(["branch", "base"]);
  expect(blockOrder(2)).toEqual(["base", "branch"]);
});

test("medianMs drops non-frames and takes the middle", () => {
  expect(medianMs([3, 1, 2])).toBe(2);
  expect(medianMs([4, 1, 3, 2, 0, Number.NaN])).toBe(2.5);
  expect(medianMs([])).toBeNaN();
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
  expect(() => parseAbArgs(["--blocks", "9,3"])).toThrow("max >= min");
  expect(() => parseAbArgs(["--games"])).toThrow("needs a value");
  expect(() => parseAbArgs(["--path", "fly"])).toThrow("walk or still");
  expect(() => parseAbArgs(["--nope", "1"])).toThrow("unknown argument");
});

test("the base tree is named for its commit", () => {
  expect(baseTreeName("6c5e869e2e1234")).toBe("perf-base-6c5e869e2e");
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
});
