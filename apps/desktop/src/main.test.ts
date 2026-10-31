import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("the desktop app's game glob finds every game in games/", () => {
  const source = readFileSync(join(import.meta.dir, "main.tsx"), "utf8");
  const pattern = /import\.meta\.glob<[^>]*>\("([^"]+)"\)/.exec(source)?.[1];
  expect(pattern).toBeDefined();
  const found = [...new Bun.Glob(pattern!).scanSync({ cwd: import.meta.dir })];
  expect(found.length).toBeGreaterThan(8);
});
