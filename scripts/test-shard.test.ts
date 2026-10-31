import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assignShards, bunCrashed, matchingShard, preparation, SHARDS, planLanes, SLOW_TEST_SECONDS, splitLanes, TEST_ROOTS, walkTestFiles, type Shard } from "./test-shard";

const TABLE: Shard[] = [
  { name: "hot", label: "the core combat tests", include: ["packages/core/src/combat"] },
  { name: "core", label: "packages/core", include: ["packages/core"] },
  { name: "rest", label: "everything else", include: ["packages", "scripts"] },
];

// Run 40757914741 on 28 Oct: shard h's one bun process printed "panic: abort() called / oh no: Bun
// has crashed" after 1072 passing files, and beta read red with no test failed.
test("a Bun crash with no failed test is run again; a failed test never is", () => {
  const crash = "(pass) a > b [1ms]\n============\npanic: abort() called\noh no: Bun has crashed. This indicates a bug in Bun, not your code.\n";
  expect(bunCrashed(crash, 1)).toBe(true);
  expect(bunCrashed(`(fail) a > c [3ms]\n${crash}`, 1)).toBe(false);
  expect(bunCrashed("(fail) a > c [3ms]\n 1 fail\n", 1)).toBe(false);
  expect(bunCrashed(crash, 0)).toBe(false);
});

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

test("the built gate is one shard", () => {
  const scripts = matchingShard("scripts/cutlistSurface.test.ts")!;
  expect(scripts.include).toContain("scripts");
  expect(preparation(scripts)).toEqual([["run", "build"]]);
  expect(preparation({ name: "bare", label: "bare", include: [] })).toEqual([]);
});

test("the roots are the directories CI tests", () => {
  expect([...TEST_ROOTS]).toEqual(["packages", "apps/dev", "apps/web", "apps/desktop", "scripts"]);
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

test("a shard's lanes split by measured cost, so the long simulations never share one", () => {
  const files = [...Object.keys(SLOW_TEST_SECONDS), "a.test.ts", "b.test.ts"];
  const lanes = splitLanes(files, 4);
  expect(lanes).toHaveLength(4);
  for (const lane of lanes) expect(lane.filter((file) => (SLOW_TEST_SECONDS[file] ?? 0) > 100).length).toBeLessThanOrEqual(1);
  expect(lanes.flat().sort()).toEqual([...files].sort());
  expect(splitLanes(["one.test.ts"], 4)).toEqual([["one.test.ts"]]);
});

test("the slow files are in the shard that runs them in lanes", () => {
  for (const file of Object.keys(SLOW_TEST_SECONDS)) expect(matchingShard(file)?.lanes).toBeGreaterThan(1);
});

test("a file that reads the wall clock runs alone after the lanes, never beside them", () => {
  const sources: Record<string, string> = { "a.test.ts": "expect(1).toBe(1)", "timed.test.ts": "const t = performance.now();", "b.test.ts": "" };
  const plan = planLanes(Object.keys(sources), 4, (file) => sources[file] ?? "");
  expect(plan.alone).toEqual(["timed.test.ts"]);
  expect(plan.lanes.flat().sort()).toEqual(["a.test.ts", "b.test.ts"]);
  expect(planLanes(Object.keys(sources), 1, (file) => sources[file] ?? "")).toEqual({ lanes: [Object.keys(sources)], alone: [] });
});
