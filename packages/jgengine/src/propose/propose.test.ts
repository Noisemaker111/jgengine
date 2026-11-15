import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { engineProposalProblems } from "@jgengine/core/meta/proposal";

import { runPropose, proposeRoot } from "./command";
import { proposalIssue } from "./issue";
import { applyMigration, planMigration } from "./migrate";
import { checkFailures, ownedFolder, scanProposals } from "./proposals";

/**
 * Fixtures are a tiny engine repository in a temp folder: `packages/core` named `@jgengine/core`
 * with a couple of modules, and games under `games/`. Upstream detection, fork diffs and the
 * lift-as-is rules all read it the way they read this monorepo.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ENGINE: Record<string, string> = {
  "packages/core/package.json": JSON.stringify({ name: "@jgengine/core" }),
  "packages/core/src/ai/creatureDriver.ts": "export interface CreatureDriver { step(): void }\nexport function createCreatureDriver(): CreatureDriver {\n  return { step() {} };\n}\n",
  "packages/core/src/world/geometry.ts": "export type Vec2 = readonly [number, number];\n",
  "packages/core/src/meta/proposal.ts": "export function defineEngineProposal<T>(proposal: T): T {\n  return proposal;\n}\n",
};

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "jg-propose-"));
  dirs.push(root);
  for (const [path, text] of Object.entries({ ...ENGINE, ...files })) write(root, path, text);
  return root;
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function proposal(fields: Record<string, unknown>, body = ""): string {
  return [
    'import { defineEngineProposal } from "@jgengine/core/meta/proposal";',
    "",
    `export const proposal = defineEngineProposal(${JSON.stringify(fields, null, 2)});`,
    "",
    body,
  ].join("\n");
}

const TERRAIN = {
  id: "creature-terrain-mode",
  target: "@jgengine/core/ai/creatureDriver",
  need: "The creature driver only walks a flat plane; wandering creatures float over hills.",
  kind: "extend",
  exports: ["CreatureTerrainMode", "creatureTerrainHeight"],
};

const GAME = (name: string) => ({ [`games/${name}/package.json`]: JSON.stringify({ name }) });

describe("discovery and validation", () => {
  test("finds every *.engine.ts under the root, skipping node_modules", () => {
    const root = repo({
      ...GAME("alpha"),
      "games/alpha/src/terrain.engine.ts": proposal(TERRAIN, "export type CreatureTerrainMode = 'flat';\nexport function creatureTerrainHeight() { return 0; }\n"),
      "games/alpha/node_modules/dep/x.engine.ts": "nope",
    });
    const scan = scanProposals(join(root, "games"), engineProposalProblems);
    expect(scan.proposals.map((report) => [report.path, report.game, report.status, report.errors])).toEqual([["alpha/src/terrain.engine.ts", "alpha", "local", []]]);
    expect(checkFailures(scan)).toEqual([]);
  });

  test("invalid metadata, private engine paths, game files and aliases all fail", () => {
    const root = repo({
      ...GAME("alpha"),
      "games/alpha/src/player.ts": "export const speed = 3;\n",
      "games/alpha/src/bad.engine.ts": proposal(
        { id: "Bad_Id", target: "@jgengine/core/ai/x", need: "x", kind: "fork", exports: ["a"] },
        [
          'import { speed } from "./player";',
          'import { createCreatureDriver } from "@jgengine/core/src/ai/creatureDriver";',
          'import { nothing } from "@jgengine/core/no/such";',
          'import { cfg } from "@/config";',
          'import * as THREE from "three";',
          'import type { Vec2 } from "@jgengine/core/world/geometry";',
          "export const a = speed;",
        ].join("\n"),
      ),
    });
    const [report] = scanProposals(join(root, "games"), engineProposalProblems).proposals;
    const errors = report!.errors.join("\n");
    expect(errors).toContain("id must be kebab-case");
    expect(errors).toContain("a fork names the engine file it copies");
    expect(errors).toContain('imports "./player" (alpha/src/player.ts), a game file');
    expect(errors).toContain('imports "@jgengine/core/src/ai/creatureDriver", a file inside the package');
    expect(errors).toContain('imports "@jgengine/core/no/such", which @jgengine/core does not export');
    expect(errors).toContain('imports "@/config", a game path alias');
    expect(errors).not.toContain("three");
    expect(errors).not.toContain("geometry");
  });

  test("a proposal may import other proposals, and a folder proposal owns its folder", () => {
    const root = repo({
      ...GAME("alpha"),
      "games/alpha/src/shared.ts": "export const x = 1;\n",
      "games/alpha/src/height.engine.ts": proposal({ ...TERRAIN, id: "height", exports: ["height"] }, "export const height = 1;\n"),
      "games/alpha/src/cave/cave.engine.ts": proposal({ ...TERRAIN, id: "cave", target: "@jgengine/core/cave/caveLayout", kind: "new", exports: ["caveLayout"] }, 'import { height } from "../height.engine";\nexport * from "./caveLayout";\n'),
      "games/alpha/src/cave/caveLayout.ts": 'import { mesh } from "./mesh";\nexport const caveLayout = mesh;\n',
      "games/alpha/src/cave/mesh.ts": 'import { x } from "../shared";\nexport const mesh = x;\n',
    });
    expect(ownedFolder(join(root, "games/alpha/src/cave/cave.engine.ts"))).toBe(join(root, "games/alpha/src/cave"));
    expect(ownedFolder(join(root, "games/alpha/src/height.engine.ts"))).toBeNull();
    const scan = scanProposals(join(root, "games"), engineProposalProblems);
    const cave = scan.proposals.find((report) => report.path.endsWith("cave.engine.ts"))!;
    expect(cave.files.map((file) => file.slice(root.length + 1))).toEqual(["games/alpha/src/cave/cave.engine.ts", "games/alpha/src/cave/caveLayout.ts", "games/alpha/src/cave/mesh.ts"]);
    expect(cave.errors).toEqual(['alpha/src/cave/mesh.ts imports "../shared" (alpha/src/shared.ts), a game file: a proposal lifts into the engine as-is, so it imports only public @jgengine paths, other *.engine.ts files and packages']);
  });

  test("a fork must name an engine file that exists", () => {
    const root = repo({
      ...GAME("alpha"),
      "games/alpha/src/driver.engine.ts": proposal({ ...TERRAIN, kind: "fork", fork: "packages/core/src/ai/missing.ts" }, "export const CreatureTerrainMode = 1; export const creatureTerrainHeight = 2;"),
    });
    const [report] = scanProposals(join(root, "games"), engineProposalProblems).proposals;
    expect(report!.errors).toEqual(["fork names packages/core/src/ai/missing.ts, which is not in the engine"]);
  });

  test("TODO fields left by --migrate fail the check", () => {
    const root = repo({ ...GAME("alpha"), "games/alpha/src/x.engine.ts": proposal({ ...TERRAIN, need: "TODO: say why" }, "") });
    expect(checkFailures(scanProposals(join(root, "games"), engineProposalProblems))).toEqual([
      "alpha/src/x.engine.ts: need still holds a TODO: fill in what the engine is missing before filing",
    ]);
  });
});

describe("upstream detection", () => {
  const files = {
    ...GAME("alpha"),
    "games/alpha/src/terrain.engine.ts": proposal(TERRAIN, "export type CreatureTerrainMode = 'flat';\nexport function creatureTerrainHeight() { return 0; }\n"),
    "games/alpha/src/creatures.ts": 'import { creatureTerrainHeight } from "./terrain.engine";\nexport const h = creatureTerrainHeight();\n',
  };

  test("local, then partial, then upstream as the engine gains the exports", () => {
    const root = repo(files);
    const scan = () => scanProposals(join(root, "games"), engineProposalProblems).proposals[0]!;
    expect(scan()).toMatchObject({ status: "local", missingExports: ["CreatureTerrainMode", "creatureTerrainHeight"] });

    write(root, "packages/core/src/ai/terrainMode.ts", "export type CreatureTerrainMode = 'flat' | 'follow';\n");
    write(root, "packages/core/src/ai/creatureDriver.ts", `${ENGINE["packages/core/src/ai/creatureDriver.ts"]}export * from "./terrainMode";\n`);
    expect(scan()).toMatchObject({ status: "partial", upstreamExports: ["CreatureTerrainMode"], missingExports: ["creatureTerrainHeight"] });

    write(root, "packages/core/src/ai/creatureDriver.ts", `${ENGINE["packages/core/src/ai/creatureDriver.ts"]}export * from "./terrainMode";\nexport function creatureTerrainHeight() { return 1; }\n`);
    const report = scan();
    expect(report.status).toBe("upstream");
    expect(report.importers.map((file) => file.slice(root.length + 1))).toEqual(["games/alpha/src/creatures.ts"]);
    expect(checkFailures({ root: join(root, "games"), proposals: [report], errors: [] })).toEqual([
      "alpha/src/terrain.engine.ts: upstream exists at @jgengine/core/ai/creatureDriver; switch imports and delete alpha/src/terrain.engine.ts (imported by alpha/src/creatures.ts)",
    ]);
  });

  test("an installed package's declarations count, as an outside project sees them", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-propose-outside-"));
    dirs.push(root);
    write(root, "package.json", JSON.stringify({ name: "my-game" }));
    write(root, "node_modules/@jgengine/core/package.json", JSON.stringify({ name: "@jgengine/core" }));
    write(root, "node_modules/@jgengine/core/dist/ai/creatureDriver.d.ts", "export declare function createCreatureDriver(): void;\nexport type CreatureTerrainMode = 'flat';\nexport declare function creatureTerrainHeight(): number;\n");
    write(root, "node_modules/@jgengine/core/dist/meta/proposal.d.ts", "export {};\n");
    write(root, "src/terrain.engine.ts", proposal(TERRAIN, "export const creatureTerrainHeight = 0; export type CreatureTerrainMode = 'flat';"));
    const [report] = scanProposals(root, engineProposalProblems).proposals;
    expect(report).toMatchObject({ game: basename(root), status: "upstream", errors: [] });
  });
});

describe("duplicate ids", () => {
  test("two games carrying one id must move it upstream", () => {
    const body = "export type CreatureTerrainMode = 1; export const creatureTerrainHeight = 1;";
    const root = repo({
      ...GAME("alpha"),
      ...GAME("beta"),
      "games/alpha/src/terrain.engine.ts": proposal(TERRAIN, body),
      "games/beta/src/world/terrain.engine.ts": proposal(TERRAIN, body),
    });
    expect(checkFailures(scanProposals(join(root, "games"), engineProposalProblems))).toEqual([
      "proposal creature-terrain-mode is carried by 2 games (alpha/src/terrain.engine.ts, beta/src/world/terrain.engine.ts): a second adopter moves it upstream to @jgengine/core/ai/creatureDriver; build it there and switch both games",
    ]);
  });
});

describe("issue output", () => {
  test("title, need, target, kind, the full file and the landing step", () => {
    const text = proposal(TERRAIN, "export type CreatureTerrainMode = 'flat';\nexport function creatureTerrainHeight() { return 0; }\n");
    const root = repo({ ...GAME("alpha"), "games/alpha/src/terrain.engine.ts": text });
    const [report] = scanProposals(join(root, "games"), engineProposalProblems).proposals;
    const issue = proposalIssue(report!, join(root, "games"));
    expect(issue.title).toBe("Engine proposal: creature-terrain-mode");
    expect(issue.body).toContain(`## Need\n\n${TERRAIN.need}`);
    expect(issue.body).toContain("| Target | `@jgengine/core/ai/creatureDriver` |");
    expect(issue.body).toContain("| Kind | extend |");
    expect(issue.body).toContain("| Exports | `CreatureTerrainMode`, `creatureTerrainHeight` |");
    expect(issue.body).toContain(`\`\`\`ts\n${text}\`\`\``);
    expect(issue.body).toContain("deletes `alpha/src/terrain.engine.ts`");
    expect(issue.body).not.toContain("## Diff");
    expect(issue.body).not.toContain("## Open problems");
  });

  test("a fork carries a unified diff against the engine file", () => {
    const forked = `${ENGINE["packages/core/src/ai/creatureDriver.ts"]!.replace("step() {}", "step() { terrain(); }")}`;
    const text = proposal({ ...TERRAIN, kind: "fork", fork: "packages/core/src/ai/creatureDriver.ts", exports: ["createCreatureDriver"] }, forked);
    const root = repo({ ...GAME("alpha"), "games/alpha/src/creatureDriver.engine.ts": text });
    const [report] = scanProposals(join(root, "games"), engineProposalProblems).proposals;
    const issue = proposalIssue(report!, join(root, "games"));
    expect(issue.body).toContain("| Forks | `packages/core/src/ai/creatureDriver.ts` |");
    expect(issue.body).toContain("## Diff against `packages/core/src/ai/creatureDriver.ts`");
    expect(issue.body).toContain("--- a/packages/core/src/ai/creatureDriver.ts\n+++ b/alpha/src/creatureDriver.engine.ts");
    expect(issue.body).toContain("-  return { step() {} };\n+  return { step() { terrain(); } };");
    expect(issue.body).toContain('+import { defineEngineProposal } from "@jgengine/core/meta/proposal";');
  });

  test("a fence longer than any backtick run keeps the file whole", () => {
    const text = proposal(TERRAIN, "export type CreatureTerrainMode = 1;\nexport const creatureTerrainHeight = 1;\n// ```ts inside a comment\n");
    const root = repo({ ...GAME("alpha"), "games/alpha/src/t.engine.ts": text });
    const [report] = scanProposals(join(root, "games"), engineProposalProblems).proposals;
    expect(proposalIssue(report!, join(root, "games")).body).toContain(`\`\`\`\`ts\n${text}\`\`\`\``);
  });
});

describe("--migrate", () => {
  const files = {
    ...GAME("alpha"),
    "games/alpha/src/engine-local/creatureBody/bodyPlan.ts": 'import type { Vec2 } from "@jgengine/core/world/geometry";\nexport interface BodyPlan { at: Vec2 }\nexport function bodyPlan(): BodyPlan { return { at: [0, 0] }; }\nexport function unusedHelper() {}\n',
    "games/alpha/src/engine-local/creatureBody/gait.ts": 'import { bodyPlan } from "./bodyPlan";\nexport const gait = () => bodyPlan();\n',
    "games/alpha/src/engine-local/creatureBody/gait.test.ts": 'import { gait } from "./gait";\ngait();\n',
    "games/alpha/src/engine-local/creatureBody/Body.draw.tsx": 'import * as THREE from "three";\nimport type { BodyPlan } from "./bodyPlan";\nexport function drawBody(plan: BodyPlan) { return new THREE.Object3D(); }\n',
    "games/alpha/src/game/creature.ts": 'import { bodyPlan, type BodyPlan } from "../engine-local/creatureBody/bodyPlan";\nimport { gait } from "../engine-local/creatureBody/gait.js";\nexport const plan: BodyPlan = bodyPlan();\nexport const step = gait;\n',
    "games/alpha/src/game/View.tsx": '// keeps its comment\nimport { drawBody } from "../engine-local/creatureBody/Body.draw";\nexport const view = drawBody;\n',
    "games/alpha/scripts/bake.ts": 'import * as plans from "../src/engine-local/creatureBody/bodyPlan";\nexport const all = plans;\n',
  };

  test("writes model and draw entries with inferred metadata and moves the game's imports", () => {
    const root = repo(files);
    const dir = join(root, "games/alpha/src/engine-local/creatureBody");
    const plan = planMigration(dir);
    applyMigration(plan);

    const model = readFileSync(join(dir, "creatureBody.engine.ts"), "utf8");
    expect(model).toContain('id: "creature-body",');
    expect(model).toContain('target: "@jgengine/core/creatureBody/bodyPlan",');
    expect(model).toContain('need: "TODO: one or two sentences: what the engine is missing and why alpha needs it.",');
    expect(model).toContain('kind: "new",');
    // The namespace import in scripts/bake.ts pulls every bodyPlan export.
    expect(model).toContain('exports: ["BodyPlan", "bodyPlan", "gait", "unusedHelper"],');
    expect(model).toContain('export * from "./bodyPlan";\nexport * from "./gait";');
    const draw = readFileSync(join(dir, "creatureBody.draw.engine.ts"), "utf8");
    expect(draw).toContain('id: "creature-body-draw",');
    expect(draw).toContain('target: "@jgengine/core/creatureBody/Body.draw",');
    expect(draw).toContain('export * from "./Body.draw";');

    expect(readFileSync(join(root, "games/alpha/src/game/creature.ts"), "utf8")).toBe(
      'import { bodyPlan, type BodyPlan } from "../engine-local/creatureBody/creatureBody.engine";\nimport { gait } from "../engine-local/creatureBody/creatureBody.engine.js";\nexport const plan: BodyPlan = bodyPlan();\nexport const step = gait;\n',
    );
    expect(readFileSync(join(root, "games/alpha/src/game/View.tsx"), "utf8")).toBe('// keeps its comment\nimport { drawBody } from "../engine-local/creatureBody/creatureBody.draw.engine";\nexport const view = drawBody;\n');
    expect(readFileSync(join(root, "games/alpha/scripts/bake.ts"), "utf8")).toContain('from "../src/engine-local/creatureBody/creatureBody.engine"');
    expect(readFileSync(join(dir, "gait.test.ts"), "utf8")).toBe('import { gait } from "./gait";\ngait();\n');

    // Migrated, the proposals pass every rule but the TODOs left to fill.
    const scan = scanProposals(join(root, "games"), engineProposalProblems);
    expect(scan.proposals.map((report) => report.errors)).toEqual([
      ["need still holds a TODO: fill in what the engine is missing before filing"],
      ["need still holds a TODO: fill in what the engine is missing before filing"],
    ]);
    expect(scan.proposals.flatMap((report) => report.importers.map((file) => file.slice(root.length + 1))).sort()).toEqual([
      "games/alpha/scripts/bake.ts",
      "games/alpha/src/game/View.tsx",
      "games/alpha/src/game/creature.ts",
    ]);
  });

  test("refuses a folder already in proposal form", () => {
    const root = repo(files);
    const dir = join(root, "games/alpha/src/engine-local/creatureBody");
    applyMigration(planMigration(dir));
    expect(() => planMigration(dir)).toThrow(/already holds a \*\.engine\.ts proposal/);
    expect(() => planMigration(join(dir, "missing"))).toThrow(/not a folder/);
  });

  test("names what the author must still settle: default imports and export clashes", () => {
    const root = repo({
      ...GAME("alpha"),
      "games/alpha/src/engine-local/remains/a.ts": "export const same = 1;\nexport default function a() {}\n",
      "games/alpha/src/engine-local/remains/b.ts": "export const same = 2;\n",
      "games/alpha/src/game.ts": 'import a from "./engine-local/remains/a";\nimport { same } from "./engine-local/remains/b";\nexport const x = [a, same];\n',
    });
    const plan = planMigration(join(root, "games/alpha/src/engine-local/remains"));
    expect(plan.notes).toEqual([
      "src/engine-local/remains/a.ts is imported by its default export, which `export *` does not carry: give it a name",
      "same is exported by a.ts and b.ts: `export *` drops it, so re-export it by name in remains.engine.ts",
    ]);
  });
});

describe("runPropose", () => {
  function capture(): { out: () => string; err: () => string; restore: () => void } {
    const log = spyOn(console, "log").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    return {
      out: () => log.mock.calls.map((call) => call.join(" ")).join("\n"),
      err: () => error.mock.calls.map((call) => call.join(" ")).join("\n"),
      restore: () => {
        log.mockRestore();
        error.mockRestore();
      },
    };
  }

  test("defaults to games/ at the engine repo root", () => {
    const root = repo({ ...GAME("alpha") });
    expect(proposeRoot(null, root)).toBe(join(root, "games"));
    expect(proposeRoot(null, join(root, "games", "alpha"))).toBe(join(root, "games", "alpha"));
    expect(proposeRoot("games/alpha", root)).toBe(join(root, "games", "alpha"));
  });

  test("--list, --check and the issue mode", async () => {
    const root = repo({ ...GAME("alpha"), "games/alpha/src/terrain.engine.ts": proposal(TERRAIN, "export type CreatureTerrainMode = 1; export const creatureTerrainHeight = 1;") });
    const io = capture();
    try {
      expect(await runPropose(["--list"], root)).toBe(0);
      expect(io.out()).toContain("creature-terrain-mode  local  extend → @jgengine/core/ai/creatureDriver  alpha/src/terrain.engine.ts");
      expect(await runPropose(["--check"], root)).toBe(0);
      expect(io.out()).toContain("engine proposals: 1 ok under games");
      expect(await runPropose(["--json"], root)).toBe(0);
      const issues = JSON.parse(io.out().slice(io.out().indexOf("[\n"))) as { title: string; body: string; status: string }[];
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ title: "Engine proposal: creature-terrain-mode", status: "local" });
      expect(await runPropose(["--id", "nope"], root)).toBe(1);
      expect(await runPropose(["--list", "--check"], root)).toBe(1);
      expect(io.err()).toContain("pick one of --list, --check");
    } finally {
      io.restore();
    }
  });

  test("--check fails with the reasons", async () => {
    const root = repo({ ...GAME("alpha"), "games/alpha/src/x.engine.ts": proposal({ ...TERRAIN, id: "X" }, "") });
    const io = capture();
    try {
      expect(await runPropose(["--check"], root)).toBe(1);
      expect(io.err()).toContain("alpha/src/x.engine.ts: id must be kebab-case");
    } finally {
      io.restore();
    }
  });

  test("--migrate writes the entry and reports the TODOs", async () => {
    const root = repo({
      ...GAME("alpha"),
      "games/alpha/src/engine-local/remains/remains.ts": "export function createRemainsField() {}\n",
      "games/alpha/src/eggs.ts": 'import { createRemainsField } from "./engine-local/remains/remains";\ncreateRemainsField();\n',
    });
    const io = capture();
    try {
      expect(await runPropose(["--migrate", "games/alpha/src/engine-local/remains"], root)).toBe(0);
      expect(io.out()).toContain("created src/engine-local/remains/remains.engine.ts");
      expect(io.out()).toContain('src/eggs.ts: "./engine-local/remains/remains" → "./engine-local/remains/remains.engine"');
      expect(io.out()).toContain("need still holds a TODO");
      expect(existsSync(join(root, "games/alpha/src/engine-local/remains/remains.engine.ts"))).toBe(true);
    } finally {
      io.restore();
    }
  });
});
