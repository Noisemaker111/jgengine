import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { abVerdict, affectedGames, baseTreeName, bracketedLogRatio, homeRequest, medianMs, parseAbArgs, plantScript, renderAbTable, t99, treeFingerprint, type AbGameResult } from "./perf-ab";

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

test("a branch window is held against the base windows either side, so a linear drift cancels", () => {
  expect(bracketedLogRatio(20, 20, 20)).toBeCloseTo(0, 9);
  expect(Math.exp(bracketedLogRatio(20, 21, 20)) - 1).toBeCloseTo(0.05, 9);
  // The PC slowing every window by 10%: base 20 then 24.2, branch 22 between them, no change of its own.
  expect(bracketedLogRatio(20, 22, 24.2)).toBeCloseTo(0, 9);
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
});

test("every window's walk starts from the warmed-up pose", () => {
  expect(JSON.parse(homeRequest({ x: 1, y: 2, z: 3, yaw: 0.5 }))).toEqual({ method: "teleport", x: 1, y: 2, z: 3, yaw: 0.5 });
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
