import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import {
  bootsFor,
  buildPlan,
  MAX_BOOTS,
  changedFiles,
  fastSteps,
  fullSteps,
  gatesFor,
  heavyPaths,
  isRuntimeSource,
  jsonRun,
  junitCosts,
  opaqueScopes,
  ownTests,
  pureRenames,
  runSteps,
  splitByCost,
  TESTS_PER_LANE,
  workspaceOf,
  workspaces,
  type Plan,
  type Step,
  type StepResult,
  type Workspace,
} from "./verify-fast";
import { buildImportGraph, specifiers, type ImportGraph } from "./import-graph";
import { matchingShard, walkTestFiles } from "./test-shard";
import { REPRESENTATIVE_GAME } from "./ci-scope";

const root = fileURLToPath(new URL("..", import.meta.url));

const fakeWorkspaces: Workspace[] = [
  { dir: "packages/core", checkTypes: true },
  { dir: "packages/shell", checkTypes: true },
  { dir: "apps/dev", checkTypes: false },
];

const ENGINE_PATHS = new Map([
  [
    "",
    [
      { key: "@jgengine/core/*", targets: ["packages/core/src/*"] },
      { key: "@jgengine/shell/*", targets: ["packages/shell/src/*"] },
    ],
  ],
]);

/** A graph over `sources` (path -> text), plus `others` that exist but are not parsed. */
function fixtureGraph(sources: Record<string, string>, others: readonly string[] = []): ImportGraph {
  return buildImportGraph("/repo", [...Object.keys(sources), ...others], { readText: (path) => sources[path] ?? "", tsconfigs: ENGINE_PATHS });
}

const emptyGraph = fixtureGraph({});

const emptyPlan: Plan = { changed: [], deleted: [], typechecks: [], tests: [], gates: [], unattributed: [], suites: [], boots: [], inputs: {} };

describe("what changed", () => {
  test("counts committed, staged, unstaged and untracked paths", () => {
    const dir = join(root, ".scratch", `verify-fast-git-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const git = (...args: string[]): void => {
      const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 10_000 });
      if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    };
    try {
      git("init", "-q");
      git("config", "user.email", "lane@example.test");
      git("config", "user.name", "lane");
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src/committed.ts"), "export const a = 1;\n");
      writeFileSync(join(dir, "src/untouched.ts"), "export const b = 1;\n");
      git("add", ".");
      git("commit", "-qm", "base");
      const base = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8", timeout: 10_000 }).stdout.trim();
      git("branch", "base", base);
      writeFileSync(join(dir, "src/committed.ts"), "export const a = 2;\n");
      writeFileSync(join(dir, "src/untouched.ts"), "export const b = 2;\n");
      git("add", "src/untouched.ts");
      writeFileSync(join(dir, "src/staged.ts"), "export const c = 1;\n");
      git("add", "src/staged.ts");
      writeFileSync(join(dir, "src/untracked.ts"), "export const d = 1;\n");

      expect(changedFiles(dir, "base")).toEqual(["src/committed.ts", "src/staged.ts", "src/untouched.ts", "src/untracked.ts"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a file moved without an edit is a pure rename; a moved and edited one is not", () => {
    const dir = join(root, ".scratch", `verify-fast-rename-${process.pid}-${Date.now()}`);
    mkdirSync(join(dir, "src"), { recursive: true });
    const git = (...args: string[]): void => {
      const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 10_000 });
      if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    };
    try {
      git("init", "-q");
      git("config", "user.email", "lane@example.test");
      git("config", "user.name", "lane");
      const body = Array.from({ length: 20 }, (_, i) => `export const v${i} = ${i};`).join("\n");
      writeFileSync(join(dir, "src/a.ts"), `${body}\n`);
      writeFileSync(join(dir, "src/b.ts"), `${body}\nexport const b = 1;\n`);
      git("add", ".");
      git("commit", "-qm", "base");
      git("branch", "base");
      git("mv", "src/a.ts", "src/moved.ts");
      git("mv", "src/b.ts", "src/edited.ts");
      writeFileSync(join(dir, "src/edited.ts"), `${body}\nexport const b = 2;\n`);
      git("add", ".");
      expect(pureRenames(dir, "base")).toEqual(["src/moved.ts"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("workspace mapping", () => {
  test("picks the deepest workspace that owns the path", () => {
    expect(workspaceOf("packages/core/src/world/terrain.ts", fakeWorkspaces)?.dir).toBe("packages/core");
    expect(workspaceOf("apps/dev/src/main.ts", fakeWorkspaces)?.dir).toBe("apps/dev");
  });

  test("root scripts belong to no workspace, so their typecheck is the repo's own scripts config", () => {
    expect(workspaceOf("scripts/verify-fast.ts", fakeWorkspaces)).toBeNull();
    const plan = buildPlan({
      changed: ["scripts/verify-fast.ts"],
      testFiles: [],
      workspaces: fakeWorkspaces,
      graph: emptyGraph,
    });
    expect(plan.typechecks).toEqual(["scripts"]);
  });

  test("reads the real workspace list and their check-types scripts", () => {
    const real = workspaces(root);
    const core = real.find((workspace) => workspace.dir === "packages/core");
    expect(core?.checkTypes).toBe(true);
    expect(real.map((workspace) => workspace.dir)).toContain("apps/web");
  });
});

describe("specifiers", () => {
  test("reads static, type-only, side-effect, dynamic, re-export and require forms", () => {
    const text = [
      'import { a } from "./static";',
      'import type { B } from "@jgengine/core";',
      'import "./side-effect";',
      'const c = await import("./dynamic");',
      'export * from "./reexport";',
      'export { d } from "./named";',
      'const e = require("./required");',
      "const notAnImport = 'from \"./text\"';",
    ].join("\n");
    expect(specifiers(text)).toEqual([
      "./static",
      "@jgengine/core",
      "./side-effect",
      "./dynamic",
      "./reexport",
      "./named",
      "./required",
    ]);
  });
});

describe("import resolution", () => {
  const graph = buildImportGraph(root, ["packages/shell/src/x.ts", "scripts/x.ts", "packages/core/src/world.ts", "packages/core/src/index.ts", "packages/core/src/world/terrain.ts", "packages/core/src/world/terrain.test.ts"], {
    readText: (path) =>
      ({
        "packages/shell/src/x.ts": 'import { world } from "@jgengine/core/world";\nimport React from "react";',
        "scripts/x.ts": 'import * as core from "@jgengine/core";',
        "packages/core/src/world/terrain.test.ts": 'import { sample } from "./terrain";',
      })[path] ?? "",
  });

  test("resolves a package subpath through the repo's tsconfig paths", () => {
    expect(graph.imports.get("packages/shell/src/x.ts")).toEqual(["packages/core/src/world.ts"]);
  });

  test("resolves a bare package name to its source entry", () => {
    expect(graph.imports.get("scripts/x.ts")).toEqual(["packages/core/src/index.ts"]);
  });

  test("resolves a relative import beside the importer", () => {
    expect(graph.imports.get("packages/core/src/world/terrain.test.ts")).toEqual(["packages/core/src/world/terrain.ts"]);
  });

  test("ignores a package that is not in the monorepo, and does not call it opaque", () => {
    expect(graph.opaque.has("packages/shell/src/x.ts")).toBe(false);
  });
});

describe("test mapping", () => {
  test("a file's own test is the one named after it", () => {
    const tests = ["packages/core/src/world/terrain.test.ts", "packages/core/src/world/terrain.other.test.ts", "packages/core/src/world/city.test.ts"];
    expect(ownTests("packages/core/src/world/terrain.ts", tests)).toEqual([
      "packages/core/src/world/terrain.test.ts",
      "packages/core/src/world/terrain.other.test.ts",
    ]);
  });

  test("a changed test file is its own test", () => {
    expect(ownTests("scripts/land.test.ts", ["scripts/land.test.ts"])).toEqual(["scripts/land.test.ts"]);
  });

  const tests = ["packages/core/src/world/terrain.test.ts", "packages/core/src/game/loop.test.ts", "packages/shell/src/render/World.test.ts"];

  test("a test whose imports reach the file runs, directly or through other modules; one that does not is left out", () => {
    const graph = fixtureGraph(
      {
        "packages/core/src/world/terrain.test.ts": 'import { sample } from "./terrain";',
        "packages/core/src/game/loop.test.ts": 'import { tick } from "./loop";',
        "packages/shell/src/render/World.test.ts": 'import { World } from "./World";',
        "packages/shell/src/render/World.tsx": 'import { heightAt } from "@jgengine/core/world/heights";',
        "packages/core/src/world/heights.ts": 'export { sample as heightAt } from "./terrain";',
        "packages/core/src/world/terrain.ts": "export const sample = 1;",
        "packages/core/src/game/loop.ts": "export const tick = 1;",
      },
    );
    const plan = buildPlan({ changed: ["packages/core/src/world/terrain.ts"], testFiles: tests, workspaces: fakeWorkspaces, graph });
    expect(plan.tests).toEqual(["packages/core/src/world/terrain.test.ts", "packages/shell/src/render/World.test.ts"]);
  });

  test("a type-only import is an edge: a changed type can break what imports it", () => {
    const graph = fixtureGraph({
      "packages/shell/src/render/World.test.ts": 'import type { Terrain } from "@jgengine/core/world/terrain";',
      "packages/core/src/world/terrain.ts": "export interface Terrain {}",
    });
    const plan = buildPlan({ changed: ["packages/core/src/world/terrain.ts"], testFiles: tests, workspaces: fakeWorkspaces, graph });
    expect(plan.tests).toContain("packages/shell/src/render/World.test.ts");
  });

  test("an import the graph cannot resolve runs its importer for any change in the scope it names", () => {
    const graph = fixtureGraph({
      "packages/shell/src/render/World.test.ts": 'const mod = await import("@jgengine/core/world/" + name);\nimport { x } from "@jgengine/core/world/missing";',
    });
    expect(opaqueScopes("packages/shell/src/render/World.test.ts", ["@jgengine/core/world/missing", "./gone"], fakeWorkspaces)).toEqual(["packages/core/", "packages/shell/"]);
    expect(buildPlan({ changed: ["packages/core/src/world/terrain.ts"], testFiles: tests, workspaces: fakeWorkspaces, graph }).tests).toContain("packages/shell/src/render/World.test.ts");
    expect(buildPlan({ changed: ["apps/dev/src/x.ts"], testFiles: tests, workspaces: fakeWorkspaces, graph }).tests).not.toContain("packages/shell/src/render/World.test.ts");
  });

  test("a deleted file reaches whatever still imports it", () => {
    const graph = fixtureGraph({ "packages/core/src/world/terrain.test.ts": 'import { sample } from "./terrain";' });
    const plan = buildPlan({ changed: [], deleted: ["packages/core/src/world/terrain.ts"], testFiles: tests, workspaces: fakeWorkspaces, graph });
    expect(plan.tests).toEqual(["packages/core/src/world/terrain.test.ts"]);
    expect(plan.typechecks).toEqual(["packages/core"]);
  });

  test("the real tree maps a core file to the test beside it", () => {
    const plan = buildPlan({
      changed: ["packages/core/src/world/terrain.ts"],
      testFiles: ["packages/core/src/world/terrain.test.ts", "packages/core/src/world/city.test.ts"],
      workspaces: fakeWorkspaces,
      graph: emptyGraph,
    });
    expect(plan.tests).toEqual(["packages/core/src/world/terrain.test.ts"]);
    expect(plan.unattributed).toEqual([]);
    expect(plan.typechecks).toEqual(["packages/core"]);
  });
});

describe("attribution fails loudly", () => {
  test("a package file no test names is covered by running its package's suite", () => {
    const plan = buildPlan({
      changed: ["packages/core/src/world/terrain.ts", "packages/core/src/world/unreachable.ts"],
      testFiles: ["packages/core/src/world/terrain.test.ts", "packages/core/src/other.test.ts", "packages/react/src/a.test.ts"],
      workspaces: fakeWorkspaces,
      graph: emptyGraph,
    });
    expect(plan.unattributed).toEqual([]);
    expect(plan.suites).toEqual(["packages/core"]);
    expect(plan.tests).toContain("packages/core/src/other.test.ts");
    expect(plan.tests).not.toContain("packages/react/src/a.test.ts");
  });

  test("a root script no test reaches is reported, not passed", () => {
    const plan = buildPlan({
      changed: ["scripts/unreachable.ts"],
      testFiles: ["scripts/other.test.ts"],
      workspaces: fakeWorkspaces,
      graph: emptyGraph,
    });
    expect(plan.unattributed).toEqual(["scripts/unreachable.ts"]);
  });

  test("a pure rename and a demo never need a test", () => {
    const plan = buildPlan({
      changed: ["scripts/moved.ts", "apps/dev/src/demo/scene.tsx"],
      testFiles: [],
      workspaces: fakeWorkspaces,
      graph: emptyGraph,
      exempt: ["scripts/moved.ts"],
    });
    expect(plan.unattributed).toEqual([]);
    expect(isRuntimeSource("apps/dev/src/demo/scene.tsx")).toBe(false);
  });

  test("docs, data and declarations need no test", () => {
    for (const path of ["changes/lane.md", "scripts/export-manifest.json", "packages/core/src/world/types.d.ts"]) {
      expect(isRuntimeSource(path)).toBe(false);
    }
    expect(isRuntimeSource("scripts/land.ts")).toBe(true);
    expect(isRuntimeSource("packages/shell/src/render/crowdBatch.ts")).toBe(true);
  });
});

describe("static gates", () => {
  test("a package source change pays the changelog and artifact gates", () => {
    const gates = gatesFor(["packages/core/src/world/terrain.ts"]);
    expect(gates).toContain("check-changelog");
    expect(gates).toContain("check-artifacts");
    expect(gates).toContain("check:concept-homes");
    expect(gates).not.toContain("check-skills");
  });

  test("a skill or doc change pays the skill gates", () => {
    expect(gatesFor([".claude/skills/workflow/SKILL.md"])).toContain("check-skills");
    expect(gatesFor(["README.md"])).toContain("check-stage-skills");
  });

  test("a scripts change pays the capture hygiene gate", () => {
    expect(gatesFor(["scripts/lookArg.ts"])).toContain("check:capture-hygiene");
  });

  test("a package change pays both generated-file checks, so a stale manifest or api.md fails here", () => {
    const gates = gatesFor(["packages/core/src/world/terrain.ts"]);
    expect(gates).toContain("check-export-manifest");
    expect(gates).toContain("check-skill-api");
  });

  test("a change that cannot touch the public API does not pay the generated-file checks", () => {
    expect(gatesFor(["scripts/lookArg.ts"])).not.toContain("check-export-manifest");
    expect(gatesFor([".claude/skills/workflow/SKILL.md"])).not.toContain("check-skill-api");
  });

  test("a stale generated file names the command that rewrites it, not just the failure", () => {
    const steps = fastSteps({ ...emptyPlan, changed: ["packages/core/src/world/terrain.ts"], gates: ["check-export-manifest", "check-skill-api"] });
    const manifest = steps.find((step) => step.name === "check-export-manifest");
    const skillApi = fastSteps(
      { ...emptyPlan, changed: ["packages/core/src/world/terrain.ts"], gates: ["check-skill-api"] },
      { skillApi: true },
    ).find((step) => step.name === "check-skill-api");
    expect(manifest?.fix).toContain("bun run gen");
    expect(manifest?.fix).toContain("scripts/export-manifest.json");
    expect(skillApi?.fix).toContain("bun run gen");
    expect(skillApi?.fix).toContain(".claude/skills/*/api.md");
  });

  test("the inner loop leaves the 21 s generated check out unless --skill-api asks for it", () => {
    const plan: Plan = { ...emptyPlan, changed: ["packages/core/src/world/terrain.ts"], gates: ["check-artifacts", "check-export-manifest", "check-skill-api"] };
    const byDefault = fastSteps(plan).map((step) => step.name);
    expect(byDefault).not.toContain("check-skill-api");
    expect(byDefault).toContain("check-export-manifest");
    expect(fastSteps(plan, { skillApi: true }).map((step) => step.name)).toContain("check-skill-api");
  });
});

describe("commands", () => {
  test("the fast plan typechecks only the owning package and runs only its tests", () => {
    const plan = buildPlan({
      changed: ["packages/shell/src/render/crowdBatch.ts"],
      testFiles: ["packages/shell/src/render/crowdBatch.test.ts"],
      workspaces: fakeWorkspaces,
      graph: emptyGraph,
    });
    const steps = fastSteps(plan);
    expect(steps[0]?.command).toEqual(["bun", "--cwd=packages/shell", "run", "check-types"]);
    expect(steps[1]?.command).toEqual(["bun", "test", "--timeout", "20000", "packages/shell/src/render/crowdBatch.test.ts"]);
    expect(steps.some((step) => step.command.includes("packages/core"))).toBe(false);
  });

  test("many test files split across the lanes, each file in exactly one process", () => {
    const files = Array.from({ length: 45 }, (_, index) => `packages/core/src/t${String(index).padStart(2, "0")}.test.ts`);
    const steps = fastSteps({ ...emptyPlan, tests: files }, { lanes: 4 }).filter((step) => step.command[1] === "test");
    expect(steps).toHaveLength(Math.min(4, Math.ceil(files.length / TESTS_PER_LANE)));
    expect(steps.flatMap((step) => step.command.slice(4)).sort()).toEqual(files);
    expect(steps.flatMap((step) => step.units ?? []).map((unit) => unit.id).sort()).toEqual(files.map((file) => `test:${file}`));
  });

  test("measured test times split the processes by time, and the junit report supplies them", () => {
    const xml = [
      String.raw`<testsuite name="packages\core\src\slow.test.ts" file="packages\core\src\slow.test.ts" tests="3" time="40.5">`,
      String.raw`<testsuite name="slow" file="packages\core\src\slow.test.ts" line="4" tests="3" time="40.4">`,
      '<testsuite name="packages/core/src/fast.test.ts" file="packages/core/src/fast.test.ts" tests="1" time="0.01">',
    ].join("\n");
    expect(junitCosts(xml)).toEqual({ "packages/core/src/slow.test.ts": 40.5, "packages/core/src/fast.test.ts": 0.01 });
    const files = Array.from({ length: 20 }, (_, index) => `packages/core/src/t${String(index).padStart(2, "0")}.test.ts`);
    const steps = fastSteps({ ...emptyPlan, tests: files }, { lanes: 2, testCosts: { [files[0]!]: 60 }, reportDir: ".scratch/r" }).filter((step) => step.command[1] === "test");
    // 80 measured seconds make three ~30 s processes: the 60 s file alone, the other nineteen split.
    const sizes = steps.map((step) => step.command.filter((arg) => arg.endsWith(".test.ts")).length);
    expect(sizes.sort((a, b) => a - b)).toEqual([1, 9, 10]);
    expect(steps[0]?.command).toContain("--reporter-outfile=.scratch/r/tests-1.xml");
  });

  test("a long measured suite splits past the lane count so its chunks pack around other steps", () => {
    const files = Array.from({ length: 24 }, (_, index) => `packages/core/src/t${String(index).padStart(2, "0")}.test.ts`);
    const testCosts = Object.fromEntries(files.map((file) => [file, 10]));
    const steps = fastSteps({ ...emptyPlan, tests: files }, { lanes: 2, testCosts }).filter((step) => step.command[1] === "test");
    // 252 s at 30 s a process wants 9, held to three per lane.
    expect(steps).toHaveLength(6);
    expect(steps.flatMap((step) => step.command.filter((arg) => arg.endsWith(".test.ts"))).sort()).toEqual(files);
  });

  test("a unit that passed with the same inputs is left out; one whose inputs changed runs", () => {
    const plan: Plan = {
      ...emptyPlan,
      changed: ["packages/core/src/a.ts"],
      typechecks: ["packages/core"],
      tests: ["packages/core/src/a.test.ts", "packages/core/src/b.test.ts"],
      gates: ["check-artifacts"],
      boots: ["harbor-heat"],
      inputs: { "test:packages/core/src/a.test.ts": ["packages/core/src/a.ts"], "test:packages/core/src/b.test.ts": [] },
    };
    const passed = new Set(["test:packages/core/src/b.test.ts", "gate:check-artifacts", "boot:harbor-heat"]);
    const steps = fastSteps(plan, { fresh: (unit) => passed.has(unit) });
    expect(steps.map((step) => step.name)).toEqual(["typecheck packages/core", "test 1 file(s)"]);
    expect(steps[1]?.command.slice(4)).toEqual(["packages/core/src/a.test.ts"]);
    expect(steps[1]?.units).toEqual([{ id: "test:packages/core/src/a.test.ts", inputs: ["packages/core/src/a.ts"] }]);
  });

  test("a unit's inputs are the files that decide it: its import closure, its workspace's data, the root configs; a repo script's test reads the whole tree", () => {
    const graph = fixtureGraph(
      {
        "packages/shell/src/World.test.ts": 'import { World } from "./World";',
        "packages/shell/src/World.tsx": 'import { sample } from "@jgengine/core/terrain";',
        "packages/core/src/terrain.ts": "export const sample = 1;",
        "packages/core/src/loop.ts": "export const tick = 1;",
        "scripts/x.test.ts": 'import { tick } from "../packages/core/src/loop";',
      },
      ["packages/shell/src/scene.json", "packages/core/src/data.json", "bun.lock"],
    );
    const plan = buildPlan({
      changed: ["packages/core/src/terrain.ts", "packages/core/src/loop.ts"],
      testFiles: ["packages/shell/src/World.test.ts", "scripts/x.test.ts"],
      workspaces: fakeWorkspaces,
      graph,
    });
    expect(plan.inputs["test:packages/shell/src/World.test.ts"]).toEqual([
      "bun.lock",
      "packages/core/src/terrain.ts",
      "packages/shell/src/World.test.ts",
      "packages/shell/src/World.tsx",
      "packages/shell/src/scene.json",
    ]);
    expect(plan.inputs["typecheck:packages/core"]).toEqual(["bun.lock", "packages/core/src/data.json", "packages/core/src/loop.ts", "packages/core/src/terrain.ts"]);
    expect(plan.inputs["test:scripts/x.test.ts"]).toEqual(["*"]);
  });

  test("--full runs the quick job, the types job, every test shard and the other jobs", async () => {
    const steps = await fullSteps(root, ["README.md"]);
    const names = steps.map((step) => step.name);
    for (const name of ["check-artifacts", "build", "check-export-manifest", "types (type-shard)", "web-build", "perf-cpu"]) {
      expect(names).toContain(name);
    }
    for (const shard of ["a", "b", "c", "d", "e", "f", "g", "h"]) expect(names).toContain(`test shard ${shard}`);
    expect(names.filter((name) => name.startsWith("test shard i"))).toHaveLength(2);
    expect(names.some((name) => name.startsWith("smoke "))).toBe(false);
  });

  test("the Windows suite is not repeated: the shard that covers its files runs on this machine", async () => {
    const files = walkTestFiles(root, ["packages/jgengine/src"]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(matchingShard(file)).not.toBeNull();
    const steps = await fullSteps(root, ["README.md"]);
    expect(steps.some((step) => step.name.startsWith("windows-tests"))).toBe(false);
  });

  test("the split shard covers every file its CI step covers, exactly once", async () => {
    const steps = await fullSteps(root, ["README.md"]);
    const listed = steps
      .filter((step) => step.name.startsWith("test shard i"))
      .flatMap((step) => step.command.slice(4));
    const shardFiles = spawnSync("bun", ["scripts/test-shard.ts", "--print", "i"], { cwd: root, encoding: "utf8", timeout: 60_000 }).stdout;
    expect(listed.sort()).toEqual(
      shardFiles.split("\n").map((line) => line.trim()).filter(Boolean).sort(),
    );
  });

  test("--full adds the frame and smoke gates only for a path that can reach them", async () => {
    expect(heavyPaths(root).test("packages/shell/src/render/crowdBatch.ts")).toBe(true);
    expect(heavyPaths(root).test("scripts/lookArg.ts")).toBe(false);
    const steps = await fullSteps(root, ["packages/shell/src/render/crowdBatch.ts"]);
    const names = steps.map((step) => step.name);
    expect(names.some((name) => name.startsWith("smoke "))).toBe(true);
    expect(names.some((name) => name.startsWith("perf gate"))).toBe(true);
  });

  test("every browser step is marked, so one dev server is booted for all of them", async () => {
    const steps = await fullSteps(root, ["packages/core/src/render/frame.ts"]);
    const browser = steps.filter((step) => step.browser === true).map((step) => step.name);
    expect(browser.filter((name) => name.startsWith("smoke "))).toHaveLength(4);
    expect(browser.filter((name) => name.startsWith("perf gate"))).toHaveLength(1);
    expect(browser).toHaveLength(5);
  });

  test("the frame gate step measures all eight games at once rather than in one lane per game", async () => {
    const steps = await fullSteps(root, ["packages/core/src/render/frame.ts"]);
    const perf = steps.find((step) => step.name.startsWith("perf gate"));
    expect(perf?.command).toEqual(["bun", "run", "perf:gate", "--jobs", "8"]);
  });

  test("the heaviest runnable step starts first, so the longest one does not end the run", async () => {
    const steps = await fullSteps(root, ["packages/core/src/render/frame.ts"]);
    const heaviest = steps.reduce((slowest, step) => ((step.cost ?? 1) > (slowest.cost ?? 1) ? step : slowest));
    expect(heaviest.name.startsWith("perf gate") || heaviest.name.startsWith("test shard")).toBe(true);
    for (const name of ["build", "test shard d", "types (type-shard)"]) {
      expect(steps.find((step) => step.name === name)?.cost).toBeGreaterThan(1);
    }
  });

  test("one build writes dist: the build waits for nothing, and every dist reader waits for the build", async () => {
    const steps = await fullSteps(root, ["README.md"]);
    const byName = new Map(steps.map((step) => [step.name, step]));
    expect(byName.get("build")?.needs).toBeUndefined();
    expect(byName.get("check-skill-api")?.needs).toEqual(["build"]);
    expect(byName.get("check-export-manifest")?.needs).toEqual(["build"]);
    const shardHalves = steps.filter((step) => step.name.startsWith("test shard i"));
    for (const step of shardHalves) expect(step.needs).toEqual(["build"]);
  });
});

describe("parallel steps", () => {
  const done = (name: string, ok = true): StepResult => ({ name, ok, ms: 0, output: "" });
  const step = (name: string, needs?: string[]): Step => ({ name, command: ["noop"], ...(needs === undefined ? {} : { needs }) });

  test("never runs more than the jobs it was given, and still runs every step", async () => {
    const steps = Array.from({ length: 9 }, (_unused, index) => step(`s${index}`));
    let inFlight = 0;
    let peak = 0;
    const results = await runSteps(steps, 3, async (entry) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return done(entry.name);
    });
    expect(peak).toBe(3);
    expect(results.map((result) => result.name)).toEqual(steps.map((entry) => entry.name));
    expect(results.every((result) => result.ok)).toBe(true);
  });

  test("a lane waits on the prerequisite that is still running, not one that already finished", async () => {
    const steps = [step("done-first"), step("slow"), step("after", ["done-first", "slow"])];
    const results = await runSteps(steps, 2, async (entry) => {
      await new Promise((resolve) => setTimeout(resolve, entry.name === "slow" ? 30 : 1));
      return done(entry.name);
    });
    expect(results.map((result) => result.name)).toEqual(["done-first", "slow", "after"]);
  });

  test("a step starts only once what it needs finished, whatever order they are declared in", async () => {
    const order: string[] = [];
    const steps = [step("manifest", ["build"]), step("types"), step("build", ["tests"]), step("tests")];
    const results = await runSteps(steps, 2, async (entry) => {
      order.push(entry.name);
      return done(entry.name);
    });
    expect(order.slice(0, 2).sort()).toEqual(["tests", "types"]);
    expect(order).toHaveLength(4);
    expect(order.indexOf("build")).toBeLessThan(order.indexOf("manifest"));
    expect(order.indexOf("tests")).toBeLessThan(order.indexOf("build"));
    expect(results.map((result) => result.name)).toEqual(["manifest", "types", "build", "tests"]);
  });

  test("a dependent waits for its prerequisite to finish, not merely to start", async () => {
    const log: string[] = [];
    const steps = [step("slow"), step("after", ["slow"]), step("third", ["after"])];
    await runSteps(steps, 4, async (entry) => {
      log.push(`start ${entry.name}`);
      await new Promise((resolve) => setTimeout(resolve, entry.name === "slow" ? 40 : 5));
      log.push(`end ${entry.name}`);
      return done(entry.name);
    });
    expect(log).toEqual(["start slow", "end slow", "start after", "end after", "start third", "end third"]);
  });

  test("a dependency loop or a need that is not a step fails loudly instead of waiting forever", async () => {
    await expect(runSteps([step("a", ["ghost"])], 1, async (entry) => done(entry.name))).rejects.toThrow(
      /a needs ghost, which is not a step/,
    );
  });

  test("a step whose prerequisite failed is reported failed and never run", async () => {
    const ran: string[] = [];
    const results = await runSteps([step("tests"), step("build", ["tests"])], 2, async (entry) => {
      ran.push(entry.name);
      return done(entry.name, entry.name !== "tests");
    });
    expect(ran).toEqual(["tests"]);
    expect(results[1]).toMatchObject({ name: "build", ok: false, blockedBy: ["tests"] });
  });

  test("a failure is reported by name, and its neighbours still finish", async () => {
    const results = await runSteps([step("a"), step("b"), step("c")], 3, async (entry) => done(entry.name, entry.name !== "b"));
    expect(results.filter((result) => !result.ok).map((result) => result.name)).toEqual(["b"]);
    expect(results.filter((result) => result.ok).map((result) => result.name)).toEqual(["a", "c"]);
  });

  test("the heaviest runnable step is taken first, and its dependants still wait", async () => {
    const order: string[] = [];
    const steps: Step[] = [
      { name: "cheap", command: ["noop"], cost: 1 },
      { name: "expensive", command: ["noop"], cost: 90 },
      { name: "after-cheap", command: ["noop"], needs: ["cheap"], cost: 50 },
    ];
    await runSteps(steps, 2, async (entry) => {
      order.push(entry.name);
      return done(entry.name);
    });
    expect(order).toEqual(["expensive", "cheap", "after-cheap"]);
  });

  test("an exclusive step runs with nothing else in flight, and its neighbours continue after", async () => {
    let inFlight = 0;
    let duringExclusive = 0;
    const steps = [step("long-a"), { ...step("measured"), exclusive: true }, step("long-b")];
    await runSteps(steps, 3, async (entry) => {
      inFlight += 1;
      if (entry.exclusive === true) duringExclusive = inFlight;
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return done(entry.name);
    });
    expect(duringExclusive).toBe(1);
  });

  test("the timing and launch-handshake steps own the machine, so load cannot read as a regression", async () => {
    const steps = await fullSteps(root, ["README.md"]);
    const exclusive = steps.filter((step) => step.exclusive === true).map((step) => step.name);
    expect(exclusive.sort()).toEqual(["check:scaffold-launch", "perf-cpu"]);
  });
});

describe("--json", () => {
  const drive = async (
    results: Record<string, { ok: boolean; ms: number; output?: string }>,
  ): Promise<{ code: number; stdout: string[]; stderr: string[] }> => {
    const steps = Object.keys(results).map((name) => ({ name, command: ["bun", "run", name] }));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await jsonRun(steps, {
      run: async (step) => ({
        ok: results[step.name]!.ok,
        ms: results[step.name]!.ms,
        output: results[step.name]!.output ?? "",
      }),
      out: (line) => stdout.push(line),
      err: (line) => stderr.push(line),
    });
    return { code, stdout, stderr };
  };

  test("a passing fixture prints one document and exits 0", async () => {
    const { code, stdout } = await drive({
      "typecheck packages/core": { ok: true, ms: 1200 },
      "check-artifacts": { ok: true, ms: 30 },
    });
    expect(code).toBe(0);
    expect(stdout).toHaveLength(1);
    const document = JSON.parse(stdout[0]!);
    expect(Object.keys(document).sort()).toEqual(["checks", "ms", "ok"]);
    expect(document.ok).toBe(true);
    expect(typeof document.ms).toBe("number");
    expect(document.ms).toBeGreaterThanOrEqual(0);
    expect(document.checks).toEqual([
      { name: "typecheck packages/core", ok: true, ms: 1200 },
      { name: "check-artifacts", ok: true, ms: 30 },
    ]);
  });

  test("a failing fixture names the check, keeps stdout to one document and exits 1", async () => {
    const { code, stdout, stderr } = await drive({
      "check-artifacts": { ok: true, ms: 30 },
      "check-changelog": { ok: false, ms: 40, output: "missing entry for packages/core" },
    });
    expect(code).toBe(1);
    expect(stdout).toHaveLength(1);
    const document = JSON.parse(stdout[0]!);
    expect(document.ok).toBe(false);
    expect(document.checks).toEqual([
      { name: "check-artifacts", ok: true, ms: 30 },
      { name: "check-changelog", ok: false, ms: 40 },
    ]);
    expect(stderr).toEqual(["missing entry for packages/core"]);
  });
});


describe("--json", () => {
  const drive = async (
    results: Record<string, { ok: boolean; ms: number; output?: string }>,
  ): Promise<{ code: number; stdout: string[]; stderr: string[] }> => {
    const steps = Object.keys(results).map((name) => ({ name, command: ["bun", "run", name] }));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await jsonRun(steps, {
      run: async (step) => ({
        ok: results[step.name]!.ok,
        ms: results[step.name]!.ms,
        output: results[step.name]!.output ?? "",
      }),
      out: (line) => stdout.push(line),
      err: (line) => stderr.push(line),
    });
    return { code, stdout, stderr };
  };

  test("a passing fixture prints one document and exits 0", async () => {
    const { code, stdout } = await drive({
      "typecheck packages/core": { ok: true, ms: 1200 },
      "check-artifacts": { ok: true, ms: 30 },
    });
    expect(code).toBe(0);
    expect(stdout).toHaveLength(1);
    const document = JSON.parse(stdout[0]!);
    expect(Object.keys(document).sort()).toEqual(["checks", "ms", "ok"]);
    expect(document.ok).toBe(true);
    expect(typeof document.ms).toBe("number");
    expect(document.ms).toBeGreaterThanOrEqual(0);
    expect(document.checks).toEqual([
      { name: "typecheck packages/core", ok: true, ms: 1200 },
      { name: "check-artifacts", ok: true, ms: 30 },
    ]);
  });

  test("a failing fixture names the check, keeps stdout to one document and exits 1", async () => {
    const { code, stdout, stderr } = await drive({
      "check-artifacts": { ok: true, ms: 30 },
      "check-changelog": { ok: false, ms: 40, output: "missing entry for packages/core" },
    });
    expect(code).toBe(1);
    expect(stdout).toHaveLength(1);
    const document = JSON.parse(stdout[0]!);
    expect(document.ok).toBe(false);
    expect(document.checks).toEqual([
      { name: "check-artifacts", ok: true, ms: 30 },
      { name: "check-changelog", ok: false, ms: 40 },
    ]);
    expect(stderr).toEqual(["missing entry for packages/core"]);
  });
});

describe("local boots", () => {
  test("a game's own change boots that game; an engine change a game draws boots the representative; a test or doc boots none", () => {
    expect(bootsFor(["games/scrap-signal/src/game/world.ts"])).toEqual(["scrap-signal"]);
    expect(bootsFor(["games/scrap-signal/src/game/world.test.ts"])).toEqual([]);
    expect(bootsFor(["README.md"])).toEqual([]);
    expect(bootsFor(["packages/shell/src/render/modelLoad.ts"])).toEqual([REPRESENTATIVE_GAME]);
    expect(bootsFor(["games/a/src/x.ts", "games/b/src/x.ts", "games/c/src/x.ts"])).toHaveLength(MAX_BOOTS);
  });

  test("an engine change boots a game its import graph reaches, the representative first, and none when no game imports it", () => {
    const changed = ["packages/shell/src/render/modelLoad.ts"];
    const reaches = (...files: string[]): Set<string> => new Set([...changed, ...files]);
    expect(bootsFor(changed, reaches(`games/${REPRESENTATIVE_GAME}/src/main.tsx`, "games/odd-orbit/src/main.tsx"))).toEqual([REPRESENTATIVE_GAME]);
    expect(bootsFor(changed, reaches("games/odd-orbit/src/main.tsx", "games/saltwick/src/main.tsx"))).toEqual(["odd-orbit"]);
    expect(bootsFor(changed, reaches("games/saltwick/src/main.tsx"))).toEqual(["saltwick"]);
    expect(bootsFor(changed, reaches("packages/shell/src/other.ts", "games/scripts/check.ts"))).toEqual([]);
    // A heavy path no import shows (a lockfile, a workflow) still boots the representative.
    expect(bootsFor(["bun.lock"], new Set(["bun.lock"]))).toEqual([REPRESENTATIVE_GAME]);
  });

  test("a boot links the packs from the shared store first, then probes the running page", () => {
    const steps = fastSteps({ ...emptyPlan, boots: ["scrap-signal"] });
    expect(steps.map((step) => step.command.join(" "))).toEqual([
      "bun games/scripts/provision-assets.ts scrap-signal",
      "bun games/scripts/capabilities-probe.ts scrap-signal",
    ]);
    expect(steps[1]?.needs).toEqual(["provision scrap-signal"]);
    // The boot runs beside the tests: its deadline waits out a busy page instead of the suite.
    const withTests = fastSteps({ ...emptyPlan, tests: ["a.test.ts"], boots: ["scrap-signal"] });
    expect(withTests.find((step) => step.name === "boot probe scrap-signal")?.needs).toEqual(["provision scrap-signal"]);
  });

  test("the games job's capability gates run here with CI's arguments", () => {
    const steps = fastSteps({ ...emptyPlan, gates: gatesFor(["games/x/src/a.ts"]) });
    expect(steps.map((step) => step.command.join(" "))).toContain("bun run games:capabilities-sync -- --check");
    expect(steps.map((step) => step.command.join(" "))).toContain("bun run games:check-capabilities -- --summary");
  });
});
