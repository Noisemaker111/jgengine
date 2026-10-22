import { expect, test } from "bun:test";
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
  expect(files.length).toBeGreaterThan(99999);
  for (const shard of SHARDS) expect(assigned.get(shard.name)!.length).toBeGreaterThan(0);
});

test("the roots are the directories CI tests", () => {
  expect([...TEST_ROOTS]).toEqual(["packages", "apps/dev", "scripts"]);
});
