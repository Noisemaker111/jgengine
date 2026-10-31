import { describe, expect, test } from "bun:test";

import { shootCommand, LOAD_GUARD_SECONDS } from "./shoot";
import { BUSY_LIMIT, bestOf, busyShare, cpuTimes, guardVerdict, judgeLoad, judgeOpen, parseLoadArgs, renderTable, revealSummary, summarizeRuns, type LoadSample } from "./load-check";
import { siteGames } from "./siteGames";

const known = ["odd-orbit", "deepward", "fernwild"];

function sample(game: string, worstClick: number | null, playable: number | null): LoadSample {
  return { game, firstPaint: 500, menuShown: 900, worstClick, sceneReady: 2000, playable, revealWorstFrame: 17, longestTaskMs: 120, blockingMs: 300, transferKb: 2048, menuLabel: "Play" };
}

describe("bun run shoot --load", () => {
  test("hands the rest to the load check under its own guard", () => {
    expect(shootCommand(["--load", "all", "--runs", "2"])).toEqual(["scripts/guard.ts", String(LOAD_GUARD_SECONDS), "bun scripts/load-check.ts", "all", "--runs", "2"]);
  });

  test("the site's games are every games/<id> with an entry, llmville aside", () => {
    const games = siteGames();
    expect(games).toContain("deepward");
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
    expect(() => parseLoadArgs(["nope"], known)).toThrow("known: odd-orbit");
    expect(() => parseLoadArgs([], known)).toThrow("name a game");
  });
});

describe("summarizeRuns", () => {
  test("takes each measure's median over the runs and ignores runs that never got there", () => {
    const row = summarizeRuns([sample("fernwild", 400, 9000), sample("fernwild", 200, null), sample("fernwild", 900, 3000)]);
    expect(row.worstClick).toBe(400);
    expect(row.playable).toBe(9000);
  });
});

describe("renderTable", () => {
  test("shows before -> after cells when a previous run is given", () => {
    const table = renderTable([sample("fernwild", 400, 3000)], [sample("fernwild", 12_000, null)]);
    expect(table).toContain("| fernwild | 500 -> 500 | 900 -> 900 | 12000 -> 400 | 2000 -> 2000 | - -> 3000 |");
  });
});

describe("judgeLoad", () => {
  const base = { worstClick: 600, sceneReady: 4000 };
  const now = (worstClick: number | null, sceneReady: number | null): LoadSample => ({ ...sample("fernwild", worstClick, null), sceneReady });

  test("passes a load within noise of its baseline", () => {
    expect(judgeLoad("fernwild", base, now(950, 5400))).toEqual([]);
  });

  test("fails a worse freeze or a slower scene and names the numbers", () => {
    expect(judgeLoad("fernwild", base, now(1100, 4000))).toEqual(["fernwild: worst freeze 1100 ms, baseline 600 ms, limit 1000 ms"]);
    expect(judgeLoad("fernwild", base, now(600, 5600))).toEqual(["fernwild: scene ready 5600 ms, baseline 4000 ms, limit 5500 ms"]);
    expect(judgeLoad("fernwild", base, now(600, null))).toEqual(["fernwild: scene ready never happened (baseline 4000 ms)"]);
  });

  test("a slower load fails on a quiet PC and is not judged on one other work holds busy", () => {
    const slower = judgeLoad("harbor-heat", { worstClick: 700, sceneReady: 9441 }, now(702, 18279));
    expect(guardVerdict(slower, 0.2)).toEqual({ failures: slower, unjudged: [] });
    expect(guardVerdict(slower, 1)).toEqual({
      failures: [],
      unjudged: ["harbor-heat: scene ready 18279 ms, baseline 9441 ms, limit 12273 ms, but other work held this PC 100% busy"],
    });
    expect(guardVerdict([], 1)).toEqual({ failures: [], unjudged: [] });
  });

  test("the PC's busy share comes from the CPU time every core spent between two samples", () => {
    const core = (user: number, idle: number) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } });
    const before = cpuTimes([core(100, 900), core(100, 900)]);
    const after = cpuTimes([core(190, 910), core(190, 910)]);
    expect(busyShare(before, after)).toBe(0.9);
    expect(busyShare(before, before)).toBe(0);
    expect(BUSY_LIMIT).toBeLessThan(1);
  });

  test("a baseline that never reached the scene does not judge it", () => {
    expect(judgeLoad("fernwild", { worstClick: 600, sceneReady: null }, now(600, null))).toEqual([]);
  });

  test("fails a scene that drew blank however fast it loaded", () => {
    expect(judgeLoad("fernwild", base, { ...now(600, 3000), sceneColors: 3, glErrors: 400 })).toEqual([
      "fernwild: the scene drew blank at scene ready (3 colours; 400 WebGL errors logged)",
    ]);
    expect(judgeLoad("fernwild", base, { ...now(600, 3000), sceneColors: 180 })).toEqual([]);
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
    expect(revealSummary([16.7, 50, 16.7], true)).toBe("3 frames once the game's menu lifted, worst 50 ms, median 17 ms, 1 over 33 ms");
    expect(revealSummary([], true)).toBe("no frames (the game's menu never lifted)");
  });

  test("an open fails on a second loading screen, a vanished world or a missing file", () => {
    expect(judgeOpen("fernwild", { ...sample("fernwild", 10, 10), boot: "open>loading>menu>playing" })).toEqual([]);
    expect(judgeOpen("fernwild", { ...sample("fernwild", 10, 10), boot: "open>loading>menu|menu -> loading (game view code)" })).toEqual([
      "fernwild: boot open > loading > menu: refused: menu -> loading (game view code)",
    ]);
    expect(judgeOpen("fernwild", sample("fernwild", 10, 10))).toEqual(["fernwild: the engine recorded no boot sequence"]);
    expect(judgeOpen("fernwild", { ...sample("fernwild", 10, 10), boot: "open>menu", missingFiles: ["/play/models/a.glb", "/play/models/a.glb"] })).toEqual([
      "fernwild: 2 files missing on the server: /play/models/a.glb",
    ]);
  });
});
