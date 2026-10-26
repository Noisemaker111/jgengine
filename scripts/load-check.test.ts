import { describe, expect, test } from "bun:test";

import { shootCommand, LOAD_GUARD_SECONDS } from "./shoot";
import { bestOf, judgeLoad, parseLoadArgs, renderTable, revealSummary, summarizeRuns, type LoadSample } from "./load-check";
import { siteGames } from "./siteGames";

const known = ["apex-nights", "hold-the-line", "saltwick"];

function sample(game: string, worstClick: number | null, playable: number | null): LoadSample {
  return { game, firstPaint: 500, menuShown: 900, worstClick, sceneReady: 2000, playable, revealWorstFrame: 17, longestTaskMs: 120, blockingMs: 300, transferKb: 2048, menuLabel: "Play" };
}

describe("bun run shoot --load", () => {
  test("hands the rest to the load check under its own guard", () => {
    expect(shootCommand(["--load", "all", "--runs", "2"])).toEqual(["scripts/guard.ts", String(LOAD_GUARD_SECONDS), "bun scripts/load-check.ts", "all", "--runs", "2"]);
  });

  test("the site's games are every games/<id> with an entry, llmville aside", () => {
    const games = siteGames();
    expect(games).toContain("hold-the-line");
    expect(games).not.toContain("llmville");
  });
});

describe("parseLoadArgs", () => {
  test("`all` expands to every game and flags parse", () => {
    const args = parseLoadArgs(["all", "--runs", "3", "--no-build", "--timeout", "30"], known);
    expect(args.games).toEqual(known);
    expect(args).toMatchObject({ runs: 3, build: false, timeoutMs: 30_000, headless: false });
  });

  test("an unknown game or no game is an error that names the known ids", () => {
    expect(() => parseLoadArgs(["nope"], known)).toThrow("known: apex-nights");
    expect(() => parseLoadArgs([], known)).toThrow("name a game");
  });
});

describe("summarizeRuns", () => {
  test("takes each measure's median over the runs and ignores runs that never got there", () => {
    const row = summarizeRuns([sample("saltwick", 400, 9000), sample("saltwick", 200, null), sample("saltwick", 900, 3000)]);
    expect(row.worstClick).toBe(400);
    expect(row.playable).toBe(9000);
  });
});

describe("renderTable", () => {
  test("shows before -> after cells when a previous run is given", () => {
    const table = renderTable([sample("saltwick", 400, 3000)], [sample("saltwick", 12_000, null)]);
    expect(table).toContain("| saltwick | 500 -> 500 | 900 -> 900 | 12000 -> 400 | 2000 -> 2000 | - -> 3000 |");
  });
});

describe("judgeLoad", () => {
  const base = { worstClick: 600, sceneReady: 4000 };
  const now = (worstClick: number | null, sceneReady: number | null): LoadSample => ({ ...sample("saltwick", worstClick, null), sceneReady });

  test("passes a load within noise of its baseline", () => {
    expect(judgeLoad("saltwick", base, now(950, 5400))).toEqual([]);
  });

  test("fails a worse freeze or a slower scene and names the numbers", () => {
    expect(judgeLoad("saltwick", base, now(1100, 4000))).toEqual(["saltwick: worst freeze 1100 ms, baseline 600 ms, limit 1000 ms"]);
    expect(judgeLoad("saltwick", base, now(600, 5600))).toEqual(["saltwick: scene ready 5600 ms, baseline 4000 ms, limit 5500 ms"]);
    expect(judgeLoad("saltwick", base, now(600, null))).toEqual(["saltwick: scene ready never happened (baseline 4000 ms)"]);
  });

  test("a baseline that never reached the scene does not judge it", () => {
    expect(judgeLoad("saltwick", { worstClick: 600, sceneReady: null }, now(600, null))).toEqual([]);
  });

  test("fails a scene that drew blank however fast it loaded", () => {
    expect(judgeLoad("saltwick", base, { ...now(600, 3000), sceneColors: 3, glErrors: 400 })).toEqual([
      "saltwick: the scene drew blank at scene ready (3 colours; 400 WebGL errors logged)",
    ]);
    expect(judgeLoad("saltwick", base, { ...now(600, 3000), sceneColors: 180 })).toEqual([]);
  });

  test("a retry keeps the better of the two runs per measure", () => {
    const best = bestOf(now(1200, 3000), now(700, 9000));
    expect(best.worstClick).toBe(700);
    expect(best.sceneReady).toBe(3000);
  });
});

describe("revealSummary", () => {
  test("counts the frames after the reveal, the worst, the median and the ones that missed 30 fps", () => {
    expect(revealSummary([16.7, 16.6, 120, 34, 16.8])).toBe("5 frames, worst 120 ms, median 17 ms, 2 over 33 ms");
    expect(revealSummary([])).toBe("no frames");
  });
});
