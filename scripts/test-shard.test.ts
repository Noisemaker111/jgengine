import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assignShards, matchingShard, preparation, SHARDS, TEST_ROOTS, walkTestFiles, type Shard } from "./test-shard";

const TABLE: Shard[] = [
  { name: "hot", label: "the core combat tests", include: ["packages/core/src/combat"] },
  { name: "core", label: "packages/core", include: ["packages/core"] },
  { name: "rest", label: "everything else", include: ["packages", "scripts"] },
];

test("the first matching include owns a file, so a prefix never runs twice", () => {
  const assigned = assignShards(
    ["packages/core/src/combat/a.test.ts", "packages/core/src/world/b.test.ts", "scripts/c.test.ts"],
    TABLE,
  );
  expect(assigned.get("hot")).toEqual(["packages/core/src/combat/a.test.ts"]);
  expect(assigned.get("core")).toEqual(["packages/core/src/world/b.test.ts"]);
  expect(assigned.get("rest")).toEqual(["scripts/c.test.ts"]);
});

test("a file no shard covers fails loudly instead of being skipped", () => {
  expect(() => assignShards(["apps/web/src/x.test.ts"], TABLE)).toThrow("no shard covers apps/web/src/x.test.ts");
});

test("duplicate shard names fail before any file is assigned", () => {
  expect(() =>
    assignShards([], [
      { name: "same", label: "first", include: ["scripts"] },
      { name: "same", label: "second", include: ["packages"] },
    ]),
  ).toThrow("duplicate shard name same");
});

test("the real table covers every test file once and each shard gets work", () => {
  const files = walkTestFiles();
  const assigned = assignShards(files);
  const covered = [...assigned.values()].flat();
  expect(covered.length).toBe(files.length);
  expect(new Set(covered).size).toBe(files.length);
  expect(files.length).toBeGreaterThan(1000);
  for (const shard of SHARDS) expect(assigned.get(shard.name)!.length).toBeGreaterThan(0);
});

test("the last shard covers every root, so a new one cannot fall outside the split", () => {
  const last = SHARDS.at(-1)!;
  for (const root of TEST_ROOTS) {
    expect(last.include.some((prefix) => root === prefix || root.startsWith(`${prefix}/`))).toBe(true);
  }
});

test("the core suite and the scripts suite stay out of one shard", () => {
  // Measured: merged, that job's own test time swung 48-79 s across four runs, which is what
  // pushed the deepest job past a minute. Merging them again needs a fresh timing, not a hunch.
  const core = matchingShard("packages/core/src/combat/damage.test.ts")!;
  const scripts = matchingShard("scripts/test-shard.test.ts")!;
  expect(core.name).not.toBe(scripts.name);
});

test("the shard that reads Games is the shard that clones it, and the built gate is one shard", () => {
  for (const file of ["scripts/cutlistSurface.test.ts", "packages/editor/src/mcp/loadGameLayers.test.ts"]) {
    const shard = matchingShard(file)!;
    expect(shard.needs ?? []).toContain("games");
  }
  const scripts = matchingShard("scripts/cutlistSurface.test.ts")!;
  expect(scripts.include).toContain("scripts");
  expect(preparation(scripts)).toEqual([
    ["run", "build"],
    ["run", "games:clone"],
  ]);
  expect(preparation({ name: "bare", label: "bare", include: [] })).toEqual([]);
});

test("the roots are the directories CI tests", () => {
  expect([...TEST_ROOTS]).toEqual(["packages", "apps/dev", "scripts"]);
});

/** The `shard:` list under `test:` in ci.yml, which is the only shard fact CI keeps. */
function matrixShards(): string[] {
  const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)), "utf8");
  const job = /^ {2}test:\n([\s\S]*?)(?=^ {2}\S)/m.exec(workflow)?.[1] ?? "";
  const list = /^ {8}shard: \[(.+)\]$/m.exec(job)?.[1] ?? "";
  return list.split(",").map((name) => name.trim()).filter((name) => name.length > 0);
}

test("ci runs one test job per shard this script defines", () => {
  expect(matrixShards()).toEqual(SHARDS.map((shard) => shard.name));
});

test("every shard names what it runs, so a red `test (a)` is diagnosable", () => {
  for (const shard of SHARDS) expect(shard.label.length).toBeGreaterThan(0);
});
