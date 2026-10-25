import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseGameReadme } from "./gameReadme";

test("every game games/README.md describes is a game in games/", () => {
  const games = join(import.meta.dir, "../../../../games");
  const entries = parseGameReadme(readFileSync(join(games, "README.md"), "utf8"));
  const ids = readdirSync(games, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(games, entry.name, "package.json")))
    .map((entry) => entry.name);
  expect(Object.keys(entries).length).toBeGreaterThan(3);
  expect(Object.keys(entries).filter((id) => !ids.includes(id))).toEqual([]);
});
