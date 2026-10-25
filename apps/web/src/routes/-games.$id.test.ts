import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Type-only: names the route this test covers without loading its virtual-module imports.
import type { Route } from "./games.$id";

test("the game page links its source to games/<id> in this repo", () => {
  const source = readFileSync(join(import.meta.dir, "games.$id.tsx"), "utf8");
  expect(source).toContain("github.com/Noisemaker111/jgengine/tree/beta/games/");
  expect(source).not.toContain("JGengine-games");
  expect(null as unknown as typeof Route | null).toBeNull();
});
