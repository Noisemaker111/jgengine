import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseGameReadme, parseGameSeed } from "./gameReadme";

const games = join(import.meta.dir, "../../../../games");
const siteGames = () =>
  readdirSync(games, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(games, entry.name, "src/index.tsx")))
    .map((entry) => entry.name);

test("every game games/README.md describes is a game in games/", () => {
  const entries = parseGameReadme(readFileSync(join(games, "README.md"), "utf8"));
  const ids = readdirSync(games, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(games, entry.name, "package.json")))
    .map((entry) => entry.name);
  expect(Object.keys(entries).length).toBeGreaterThan(3);
  expect(Object.keys(entries).filter((id) => !ids.includes(id))).toEqual([]);
});

test("every game the site lists has a README description and a cover", () => {
  const entries = parseGameReadme(readFileSync(join(games, "README.md"), "utf8"));
  const covers = join(import.meta.dir, "../../public/covers");
  for (const id of siteGames()) {
    expect({ id, described: entries[id] !== undefined }).toEqual({ id, described: true });
    expect({ id, cover: existsSync(join(covers, `${id}.webp`)) }).toEqual({ id, cover: true });
  }
});

test("reads the idea a game was first generated from", () => {
  expect(parseGameSeed('Grow a garden. First generated from the idea: "cozy fishing village". Start it')).toBe("cozy fishing village");
  expect(parseGameSeed("# Deepward\nNo seed line here.")).toBeNull();
});
