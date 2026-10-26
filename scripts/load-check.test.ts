import { describe, expect, test } from "bun:test";

import { shootCommand, LOAD_GUARD_SECONDS } from "./shoot";
import { parseLoadArgs, renderTable, siteGames, summarizeRuns, type LoadSample } from "./load-check";

const known = ["apex-nights", "hold-the-line", "saltwick"];

function sample(game: string, worstClick: number | null, playable: number | null): LoadSample {
  return { game, firstPaint: 500, menuShown: 900, worstClick, sceneReady: 2000, playable, longestTaskMs: 120, blockingMs: 300, transferKb: 2048, menuLabel: "Play" };
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
