import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Launcher names the games/ folder a new game lands in", () => {
  const source = readFileSync(join(import.meta.dir, "Launcher.tsx"), "utf8");
  expect(source).toContain("Created games/${id}");
  expect(source).not.toContain("Games/");
});
