import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("the agent docs tells agents not to copy from the repo's games/ folder, which exists", () => {
  const text = readFileSync(join(import.meta.dir, "agentDocs.ts"), "utf8");
  expect(text).toContain("games/*");
  expect(text).not.toContain("Games/*");
  expect(existsSync(join(import.meta.dir, "../../../..", "games"))).toBe(true);
});
