import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("NewGameDialog names the games/ folder a new game lands in", () => {
  const source = readFileSync(join(import.meta.dir, "NewGameDialog.tsx"), "utf8");
  expect(source).toContain("scaffolds games/&lt;id&gt;");
  expect(source).not.toContain("Games/");
});
