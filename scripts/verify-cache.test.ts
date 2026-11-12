import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "bun:test";

import { blobId, openPassCache, saveTestCosts, sharedVerifyDir, treeDigests, WHOLE_TREE } from "./verify-cache";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const dirs: string[] = [];
let made = 0;
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(files: Record<string, string>) {
  const dir = join(root, ".scratch", `verify-cache-${process.pid}-${(made += 1)}`);
  mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  const file = join(dir, "passed.json");
  const open = () => openPassCache({ file, runtime: "bun test", digest: (path) => files[path] ?? "absent", tree: () => Object.keys(files) });
  return { files, open };
}

describe("pass cache", () => {
  test("a unit that passed is fresh while its inputs hold the same bytes", () => {
    const { open } = fixture({ "packages/core/src/a.ts": "1" });
    const first = open();
    expect(first.fresh("test:a.test.ts", ["packages/core/src/a.ts"])).toBe(false);
    first.record("test:a.test.ts", ["packages/core/src/a.ts"]);
    first.save();
    expect(open().fresh("test:a.test.ts", ["packages/core/src/a.ts"])).toBe(true);
  });

  test("a rebase that only brings in other files leaves the unit fresh; one that edits its input does not", () => {
    const { files, open } = fixture({ "packages/core/src/a.ts": "1", "packages/shell/src/b.ts": "1" });
    const cache = open();
    cache.record("test:a.test.ts", ["packages/core/src/a.ts"]);
    cache.record("gate:check-artifacts", [WHOLE_TREE]);
    cache.save();
    files["packages/shell/src/b.ts"] = "2";
    expect(open().fresh("test:a.test.ts", ["packages/core/src/a.ts"])).toBe(true);
    // A gate reads the whole tree, so any moved file re-runs it.
    expect(open().fresh("gate:check-artifacts", [WHOLE_TREE])).toBe(false);
    files["packages/core/src/a.ts"] = "2";
    expect(open().fresh("test:a.test.ts", ["packages/core/src/a.ts"])).toBe(false);
  });

  test("another unit, other inputs, a deleted input or an unsaved run is not fresh", () => {
    const { files, open } = fixture({ "packages/core/src/a.ts": "1" });
    const cache = open();
    cache.record("typecheck:packages/core", ["packages/core/src/a.ts"]);
    cache.save();
    expect(open().fresh("test:b.test.ts", ["packages/core/src/a.ts"])).toBe(false);
    expect(open().fresh("typecheck:packages/core", [])).toBe(false);
    delete files["packages/core/src/a.ts"];
    expect(open().fresh("typecheck:packages/core", ["packages/core/src/a.ts"])).toBe(false);
    const unsaved = open();
    unsaved.record("gate:check-artifacts", []);
    expect(open().fresh("gate:check-artifacts", [])).toBe(false);
  });

  test("two lanes saving into one store keep each other's passes", () => {
    const { open } = fixture({ "packages/core/src/a.ts": "1" });
    const laneA = open();
    const laneB = open();
    laneA.record("test:a.test.ts", ["packages/core/src/a.ts"]);
    laneB.record("test:b.test.ts", ["packages/core/src/a.ts"]);
    laneA.save();
    laneB.save();
    const after = open();
    expect(after.fresh("test:a.test.ts", ["packages/core/src/a.ts"])).toBe(true);
    expect(after.fresh("test:b.test.ts", ["packages/core/src/a.ts"])).toBe(true);
  });
});

describe("shared store", () => {
  test("every worktree of a clone shares one store inside git's common directory", () => {
    const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" }).stdout.trim();
    expect(sharedVerifyDir(root)).toBe(join(common, "jgengine-verify"));
  });

  test("measured test costs from two lanes are merged, not overwritten", () => {
    const dir = join(root, ".scratch", `verify-costs-${process.pid}-${(made += 1)}`);
    dirs.push(dir);
    const file = join(dir, "test-costs.json");
    saveTestCosts(file, { "a.test.ts": 1 });
    saveTestCosts(file, { "b.test.ts": 2 });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ "a.test.ts": 1, "b.test.ts": 2 });
  });

  test("a dirty file digests to the blob id git gives it once committed", () => {
    const dir = join(root, ".scratch", `verify-blob-${process.pid}-${(made += 1)}`);
    mkdirSync(dir, { recursive: true });
    dirs.push(dir);
    writeFileSync(join(dir, "a.txt"), "hello\n");
    const hashed = spawnSync("git", ["hash-object", join(dir, "a.txt")], { encoding: "utf8" }).stdout.trim();
    expect(blobId(readFileSync(join(dir, "a.txt")))).toBe(hashed);
    const path = relative(root, join(dir, "a.txt")).replaceAll("\\", "/");
    expect(treeDigests(root, [path])(path)).toBe(hashed);
  });
});
