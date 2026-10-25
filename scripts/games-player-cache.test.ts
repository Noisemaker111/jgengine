import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { HASH_ROOTS } from "./games-player-cache";

test("every /play cache input exists, so a games/ change invalidates the cache on case-sensitive CI", () => {
  const root = join(import.meta.dir, "..");
  expect(HASH_ROOTS).toContain("games");
  expect(HASH_ROOTS.filter((path) => !existsSync(join(root, path)))).toEqual([]);
});
