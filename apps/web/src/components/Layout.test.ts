import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Layout links the probe games to games/ in this repo", () => {
  const source = readFileSync(join(import.meta.dir, "Layout.tsx"), "utf8");
  expect(source).toContain("github.com/Noisemaker111/jgengine/tree/beta/games");
  expect(source).not.toContain("JGengine-games");
});
