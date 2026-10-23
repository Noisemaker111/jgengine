import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assignShards, SHARDS, TEST_ROOTS, walkTestFiles, type Shard } from "./test-shard";

const TABLE: Shard[] = [
  { name: "hot", include: ["packages/core/src/combat"] },
  { name: "core", include: ["packages/core"] },
  { name: "rest", include: ["packages", "scripts"] },
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
      { name: "same", include: ["scripts"] },
      { name: "same", include: ["packages"] },
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
