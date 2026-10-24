import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SMOKE_GAMES, parseGames } from "./smoke-games";

/**
 * The smoke script is a loop over independent game boots; CI gives each game its
 * own job. These cases keep the default set whole and the CI matrix honest, so a
 * game cannot fall out of the smoke by being left off either list.
 */

describe("parseGames", () => {
  test("boots every smoke game when no flag is given", () => {
    expect(parseGames([])).toEqual([...SMOKE_GAMES]);
  });

  test("narrows to the named game for one CI job", () => {
    expect(parseGames(["--games", "deepward"])).toEqual(["deepward"]);
    expect(parseGames(["--games", "harbor-heat, deepward"])).toEqual(["harbor-heat", "deepward"]);
  });

  test("rejects a game the smoke does not cover instead of booting nothing", () => {
    expect(() => parseGames(["--games", "harbor-heat,ember-command"])).toThrow(/not a smoke game: ember-command/);
    expect(() => parseGames(["--games", ""])).toThrow(/at least one game id/);
    expect(() => parseGames(["--games"])).toThrow(/at least one game id/);
  });
});

describe("ci matrix", () => {
  const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)), "utf8");

  test("no job boots a game a second time: the frame gate's matrix carries the smoke set", () => {
    // `bun run smoke` still exists for a local boot, but CI launches each game once, from
    // `perf-game`, whose `measureGame` fails on the same capture handshake.
    expect(workflow).not.toContain("smoke-game:");
    expect(workflow).not.toContain("bun run smoke --games");
  });
});
