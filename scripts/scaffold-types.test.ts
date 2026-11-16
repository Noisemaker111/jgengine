import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GAME_TEMPLATES, type GameTemplate, PROJECT_CONFIG_FILE, renderProjectConfig, starterCredits } from "../packages/jgengine/src/projectConfig";
import { gameTemplate } from "../packages/jgengine/src/templates";
import { tsgoBin } from "./checkout-ready";

/**
 * What `jgengine create` writes must type-check against the engine it ships with. create-output.test
 * checks that each engine import exists; this catches a field the engine no longer takes (a top-level
 * `look` that belongs under `rendering` shipped in every new 3D game because nothing compiled it).
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, ".scratch", "scaffold-types");

/** Engine paths as the monorepo resolves them, rebased from the root tsconfig onto the scaffold. */
const BASE = JSON.parse(await Bun.file(join(ROOT, "tsconfig.base.json")).text()) as { compilerOptions: { paths: Record<string, string[]> } };
const paths = Object.fromEntries(Object.entries(BASE.compilerOptions.paths).map(([key, targets]) => [key, targets.map((target) => join(ROOT, target))]));

function writeScaffold(template: GameTemplate): string {
  const dir = join(OUT, template);
  rmSync(dir, { recursive: true, force: true });
  const files = gameTemplate({
    id: "probe-game",
    name: "Probe Game",
    variant: "standalone",
    engineVersion: "0.0.0",
    ...(template === "2d" ? { dimension: "2d" as const } : {}),
    ...(template === "builder" ? { shape: "shared-world-builder" as const } : {}),
  });
  for (const file of files) {
    mkdirSync(dirname(join(dir, file.path)), { recursive: true });
    writeFileSync(join(dir, file.path), file.contents);
  }
  // create writes jgengine.json after the template; the credits menu imports it.
  writeFileSync(join(dir, PROJECT_CONFIG_FILE), renderProjectConfig({ name: "Probe Game", id: "probe-game", template, engine: [], credits: starterCredits("Probe Game", template !== "2d") }));
  // The scaffold's own compiler options, with engine imports pointed at source and its npm-only
  // type packages (vite, node) taken from the monorepo's installs.
  writeFileSync(
    join(dir, "tsconfig.check.json"),
    JSON.stringify({
      extends: "./tsconfig.json",
      compilerOptions: { paths, resolveJsonModule: true, types: ["node"], typeRoots: [join(ROOT, "node_modules", "@types")] },
      files: [join(ROOT, "apps", "web", "node_modules", "vite", "client.d.ts")],
      exclude: ["**/*.test.ts"],
    }),
  );
  return dir;
}

/** A module this harness cannot install (a scaffold's own npm dependency such as convex) is not a template bug. */
const harnessOnly = (line: string): boolean => /error TS2307: Cannot find module '(?!@jgengine\/)/.test(line);

describe("a new game type-checks against the engine", () => {
  for (const template of GAME_TEMPLATES) {
    test(`the ${template} template`, () => {
      const dir = writeScaffold(template);
      const run = spawnSync(tsgoBin(ROOT), ["--noEmit", "-p", join(dir, "tsconfig.check.json")], { encoding: "utf8", timeout: 120_000 });
      const errors = `${run.stdout}${run.stderr}`.split("\n").filter((line) => line.includes("error TS") && !harnessOnly(line));
      expect(errors).toEqual([]);
    });
  }
});
