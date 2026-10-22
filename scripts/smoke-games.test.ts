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

  function matrixGames(job: string): string[] {
    const body = new RegExp(`^ {2}${job}:\\n([\\s\\S]*?)(?=^ {2}\\S)`, "m").exec(workflow)?.[1] ?? "";
    const list = /^ {8}game: \[(.+)\]$/m.exec(body)?.[1] ?? "";
    return list.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
  }

  test("gives every smoke game its own job", () => {
    expect(matrixGames("smoke-game")).toEqual([...SMOKE_GAMES]);
  });
});
