import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { typecheckedDirs } from "./check-types-all";

const root = fileURLToPath(new URL("..", import.meta.url));

function readJson(path: string): { scripts?: Record<string, string>; compilerOptions?: { types?: string[] }; include?: string[] } {
  return JSON.parse(readFileSync(path, "utf8")) as {
    scripts?: Record<string, string>;
    compilerOptions?: { types?: string[] };
    include?: string[];
  };
}

test("scripts/ is typechecked, so a script type error cannot sit in the tree unseen", () => {
  const dirs = typecheckedDirs(root);
  expect(dirs).toContain("scripts");
  expect(readJson(join(root, "scripts", "package.json")).scripts?.["check-types"]).toBe("tsgo --noEmit -p tsconfig.json");
  expect(existsSync(join(root, "scripts", "tsconfig.json"))).toBe(true);
});

test("the scripts config keeps the whole folder and Bun's globals", () => {
  const config = readJson(join(root, "scripts", "tsconfig.json"));
  // Without "bun" every `Bun.*` call and `bun:test` import is an error, which is what the 300
  // missing-type errors were before this config existed.
  expect(config.compilerOptions?.types).toContain("bun");
  expect(config.include).toEqual(["."]);
});

test("every dir it checks exists once and carries its own package.json", () => {
  const dirs = typecheckedDirs(root);
  expect(new Set(dirs).size).toBe(dirs.length);
  expect(dirs).toContain("packages/core");
  for (const dir of dirs) expect(existsSync(join(root, dir, "package.json"))).toBe(true);
});
