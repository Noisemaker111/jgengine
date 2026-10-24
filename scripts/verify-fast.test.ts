import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import {
  buildPlan,
  changedFiles,
  fastSteps,
  fullSteps,
  gatesFor,
  heavyPaths,
  importers,
  isRuntimeSource,
  jsonRun,
  makeResolver,
  ownTests,
  runSteps,
  splitByCost,
  specifiers,
  workspaceOf,
  workspaces,
  type Step,
  type StepResult,
  type Workspace,
} from "./verify-fast";
import { matchingShard, walkTestFiles } from "./test-shard";

const root = fileURLToPath(new URL("..", import.meta.url));

const fakeWorkspaces: Workspace[] = [
  { dir: "packages/core", checkTypes: true },
  { dir: "packages/shell", checkTypes: true },
  { dir: "apps/dev", checkTypes: false },
];

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
      readText: () => "",
      resolveSpecifier: () => [],
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
  const resolveSpecifier = makeResolver(root);

  test("resolves a package subpath through the repo's tsconfig paths", () => {
    expect(resolveSpecifier("@jgengine/core/world", "packages/shell/src/x.ts")).toEqual(["packages/core/src/world.ts"]);
  });

  test("resolves a bare package name to its source entry", () => {
    expect(resolveSpecifier("@jgengine/core", "scripts/x.ts")).toContain("packages/core/src/index.ts");
  });

  test("resolves a relative import beside the importer", () => {
    expect(resolveSpecifier("./terrain", "packages/core/src/world/terrain.test.ts")).toEqual(["packages/core/src/world/terrain.ts"]);
  });

  test("ignores a package that is not in the monorepo", () => {
    expect(resolveSpecifier("react", "packages/shell/src/x.ts")).toEqual([]);
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

  test("a test that imports the file reaches it, and one that does not is left out", () => {
    const files = ["packages/core/src/world/terrain.ts"];
    const text: Record<string, string> = {
      "packages/core/src/world/terrain.test.ts": 'import { sample } from "./terrain";',
      "packages/core/src/game/loop.test.ts": 'import { tick } from "./loop";',
    };
    const reached = importers(files, Object.keys(text), (path) => text[path]!, (specifier) =>
      specifier === "./terrain"
        ? ["packages/core/src/world/terrain.ts"]
        : ["packages/core/src/game/loop.ts"],
    );
    expect(reached.get(files[0]!)).toEqual(["packages/core/src/world/terrain.test.ts"]);
  });

  test("a test that imports a package barrel is not counted against every module it re-exports", () => {
    const files = ["packages/core/src/world/terrain.ts"];
    const text: Record<string, string> = {
      "packages/shell/src/render/World.test.ts": 'import { world } from "@jgengine/core/world";',
      "packages/core/src/world/terrain.test.ts": 'import { sample } from "./terrain";',
    };
    const resolveSpecifier = (specifier: string): string[] =>
      specifier === "@jgengine/core/world" ? ["packages/core/src/world.ts"] : ["packages/core/src/world/terrain.ts"];
    const reached = importers(files, Object.keys(text), (path) => text[path]!, resolveSpecifier);
    expect(reached.get(files[0]!)).toEqual(["packages/core/src/world/terrain.test.ts"]);
  });

  test("the real tree maps a core file to the test beside it", () => {
    const plan = buildPlan({
      changed: ["packages/core/src/world/terrain.ts"],
      testFiles: ["packages/core/src/world/terrain.test.ts", "packages/core/src/world/city.test.ts"],
      workspaces: fakeWorkspaces,
      readText: () => "",
      resolveSpecifier: makeResolver(root),
    });
    expect(plan.tests).toEqual(["packages/core/src/world/terrain.test.ts"]);
    expect(plan.unattributed).toEqual([]);
    expect(plan.typechecks).toEqual(["packages/core"]);
  });
});

describe("attribution fails loudly", () => {
  test("a runtime file no test reaches is reported, not passed", () => {
    const plan = buildPlan({
      changed: ["packages/core/src/world/terrain.ts", "packages/core/src/world/unreachable.ts"],
      testFiles: ["packages/core/src/world/terrain.test.ts"],
      workspaces: fakeWorkspaces,
      readText: () => "",
      resolveSpecifier: () => [],
    });
    expect(plan.unattributed).toEqual(["packages/core/src/world/unreachable.ts"]);
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
    const steps = fastSteps({
      changed: ["packages/core/src/world/terrain.ts"],
      typechecks: [],
      tests: [],
      gates: ["check-export-manifest", "check-skill-api"],
      unattributed: [],
    });
    const manifest = steps.find((step) => step.name === "check-export-manifest");
    const skillApi = fastSteps(
      { changed: ["packages/core/src/world/terrain.ts"], typechecks: [], tests: [], gates: ["check-skill-api"], unattributed: [] },
      { skillApi: true },
    ).find((step) => step.name === "check-skill-api");
    expect(manifest?.fix).toContain("bun run gen");
    expect(manifest?.fix).toContain("scripts/export-manifest.json");
    expect(skillApi?.fix).toContain("bun run gen");
    expect(skillApi?.fix).toContain(".claude/skills/*/api.md");
  });

  test("the inner loop leaves the 21 s generated check out unless --skill-api asks for it", () => {
    const plan = {
      changed: ["packages/core/src/world/terrain.ts"],
      typechecks: [],
      tests: [],
      gates: ["check-artifacts", "check-export-manifest", "check-skill-api"],
      unattributed: [],
    };
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
      readText: () => "",
      resolveSpecifier: () => [],
    });
    const steps = fastSteps(plan);
    expect(steps[0]?.command).toEqual(["bun", "--cwd=packages/shell", "run", "check-types"]);
    expect(steps[1]?.command).toEqual(["bun", "test", "--timeout", "20000", "packages/shell/src/render/crowdBatch.test.ts"]);
    expect(steps.some((step) => step.command.includes("packages/core"))).toBe(false);
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
    for (const step of shardHalves) expect(step.needs).toEqual(["build", "games:clone"]);
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
