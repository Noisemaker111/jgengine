import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findUp, readPackageJson } from "./pkg";
import { browserLibMjs, driveMjs, shootMjs } from "./templates/gameFiles";

/**
 * `jgengine shoot` / `jgengine drive` — the browser capture + play-driving rungs
 * as first-class CLI verbs, so a standalone project (scaffolded with
 * `npx jgengine create`, outside this monorepo) can screenshot and playtest its
 * own game with no monorepo-only tooling. This is the CLI companion to the
 * `scripts/shoot.mjs` / `scripts/drive.mjs` a fresh scaffold ships: run inside a
 * project that already has those scripts and the verb delegates to them (parity
 * with `bun run shoot`); run in one that lacks them (an older scaffold, or one
 * whose scripts were removed) and it materializes the same dependency-free
 * harness — the very source the scaffold embeds — and drives the project's dev
 * server. Chrome/Chromium is the only capture engine; no Playwright, no npm deps
 * travel with the published CLI.
 */
export type HarnessKind = "shoot" | "drive";

const HARNESS_SOURCE: Record<HarnessKind, string> = { shoot: shootMjs, drive: driveMjs };

/**
 * Nearest ancestor directory (including `startDir`) whose `package.json` declares
 * an `@jgengine/*` dependency — i.e. a JGengine game project. This is the same
 * "is this a game project" signal `jgengine versions` uses.
 */
export function findProjectRoot(startDir: string): string | null {
  return findUp(startDir, (dir) => {
    const pkg = readPackageJson(join(dir, "package.json"));
    if (pkg === null) return false;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Object.keys(deps).some((name) => name.startsWith("@jgengine/"));
  });
}

/**
 * Write the dependency-free harness (shared `browser.mjs` + the `shoot`/`drive`
 * CLI) into a fresh temp dir and return that dir. Used when the project has no
 * `scripts/<kind>.mjs` of its own — the bundled copy is byte-identical to what a
 * scaffold embeds, so behavior matches `bun run <kind>`.
 */
export function materializeHarness(kind: HarnessKind): string {
  const dir = mkdtempSync(join(tmpdir(), `jgengine-${kind}-`));
  writeFileSync(join(dir, "browser.mjs"), browserLibMjs);
  writeFileSync(join(dir, `${kind}.mjs`), HARNESS_SOURCE[kind]);
  return dir;
}

export type HarnessPlan =
  | { ok: true; script: string; cwd: string; source: "project" | "bundled" }
  | { ok: false; error: string };

/**
 * Decide how to run the `kind` harness from `cwd`: delegate to the project's own
 * `scripts/<kind>.mjs` when present, otherwise materialize the bundled harness.
 * `allowNoProject` lets `--help` render without a game project on disk.
 */
export function planHarness(
  kind: HarnessKind,
  cwd: string,
  opts: { allowNoProject?: boolean } = {},
): HarnessPlan {
  const root = findProjectRoot(cwd);
  if (root === null && opts.allowNoProject !== true) {
    return {
      ok: false,
      error:
        `jgengine ${kind}: run this inside a JGengine game project ` +
        "(a folder whose package.json depends on @jgengine/*).\n" +
        '  scaffold one first:  npx jgengine create "My Game"',
    };
  }
  if (root !== null) {
    const projectScript = join(root, "scripts", `${kind}.mjs`);
    if (existsSync(projectScript)) {
      return { ok: true, script: projectScript, cwd: root, source: "project" };
    }
  }
  const dir = materializeHarness(kind);
  return { ok: true, script: join(dir, `${kind}.mjs`), cwd: root ?? cwd, source: "bundled" };
}

/** @internal */
export function runHarness(kind: HarnessKind, argv: string[], cwd: string = process.cwd()): number {
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const plan = planHarness(kind, cwd, { allowNoProject: wantsHelp });
  if (!plan.ok) {
    console.error(plan.error);
    return 1;
  }
  if (!wantsHelp) {
    const where =
      plan.source === "project"
        ? `using this project's scripts/${kind}.mjs`
        : `using the bundled ${kind} harness`;
    console.error(`jgengine ${kind}: ${where} — cwd ${plan.cwd}`);
  }
  const result = spawnSync(process.execPath, [plan.script, ...argv], {
    cwd: plan.cwd,
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    console.error(`jgengine ${kind}: failed to launch — ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}
