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
  makeResolver,
  ownTests,
  specifiers,
  summarize,
  workspaceOf,
  workspaces,
  type Workspace,
} from "./verify-fast";

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

  test("root scripts belong to no workspace, so they get no package typecheck", () => {
    expect(workspaceOf("scripts/verify-fast.ts", fakeWorkspaces)).toBeNull();
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
});

describe("--json", () => {
  const shape = (value: unknown): void => {
    expect(typeof value).toBe("object");
    const report = value as { ok: unknown; ms: unknown; checks: unknown };
    expect(Object.keys(report).sort()).toEqual(["checks", "ms", "ok"]);
    expect(typeof report.ok).toBe("boolean");
    expect(typeof report.ms).toBe("number");
    expect(Array.isArray(report.checks)).toBe(true);
    for (const check of report.checks as Array<Record<string, unknown>>) {
      expect(Object.keys(check).sort()).toEqual(["ms", "name", "ok"]);
      expect(typeof check.name).toBe("string");
      expect(typeof check.ok).toBe("boolean");
      expect(typeof check.ms).toBe("number");
    }
  };

  test("a passing run prints one document with ok true and a check per step", () => {
    const report = summarize(
      [
        { name: "typecheck packages/core", ok: true, ms: 1200 },
        { name: "test 2 file(s)", ok: true, ms: 3400 },
        { name: "check-artifacts", ok: true, ms: 90 },
      ],
      4690,
    );
    shape(JSON.parse(JSON.stringify(report)));
    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.name)).toEqual(["typecheck packages/core", "test 2 file(s)", "check-artifacts"]);
  });

  test("a failing run leaves ok false and keeps the failing check's name", () => {
    const report = summarize(
      [
        { name: "typecheck packages/core", ok: true, ms: 1200 },
        { name: "test 2 file(s)", ok: false, ms: 3400 },
      ],
      4600,
    );
    shape(JSON.parse(JSON.stringify(report)));
    expect(report.ok).toBe(false);
    expect(report.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(["test 2 file(s)"]);
  });

  test("an empty run is one document, not a bare line of prose", () => {
    const text = JSON.stringify(summarize([], 0));
    expect(text).toBe('{"ok":true,"ms":0,"checks":[]}');
    shape(JSON.parse(text));
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
    for (const name of ["check-artifacts", "build", "check-export-manifest", "types (type-shard)", "web-build", "perf-cpu", "windows-tests"]) {
      expect(names).toContain(name);
    }
    for (const shard of ["a", "b", "c", "d", "e", "f", "g", "h", "i"]) expect(names).toContain(`test shard ${shard}`);
    expect(names.some((name) => name.startsWith("smoke "))).toBe(false);
  });

  test("--full adds the frame and smoke gates only for a path that can reach them", async () => {
    expect(heavyPaths(root).test("packages/shell/src/render/crowdBatch.ts")).toBe(true);
    expect(heavyPaths(root).test("scripts/lookArg.ts")).toBe(false);
    const steps = await fullSteps(root, ["packages/shell/src/render/crowdBatch.ts"]);
    const names = steps.map((step) => step.name);
    expect(names.some((name) => name.startsWith("smoke "))).toBe(true);
    expect(names.some((name) => name.startsWith("perf "))).toBe(true);
  });
});
