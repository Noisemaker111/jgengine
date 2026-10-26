import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cliVersion, findUp, readPackageJson } from "./pkg";
import { browserLibMjs, driveMjs, shootMjs } from "./templates/harnessScripts";

/**
 * `jgengine shoot` / `jgengine drive` — the browser capture + play-driving rungs
 * as CLI verbs, so a game project made with `npx jgengine create` can screenshot
 * and playtest itself with no monorepo tooling. The game carries no copy: the CLI
 * writes its dependency-free harness to a temp folder and runs it against the
 * project's dev server, so a newer CLI brings a newer harness. Chrome/Chromium is
 * the only capture engine; no Playwright, no npm deps travel with the CLI.
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

/** Write the dependency-free harness (shared `browser.mjs` + the `shoot`/`drive` CLI) into a fresh temp dir and return that dir. */
export function materializeHarness(kind: HarnessKind): string {
  const dir = mkdtempSync(join(tmpdir(), `jgengine-${kind}-`));
  writeFileSync(join(dir, "browser.mjs"), browserLibMjs);
  writeFileSync(join(dir, `${kind}.mjs`), HARNESS_SOURCE[kind]);
  return dir;
}

/** Short content hash of the bundled harness, printed on every run so a stale copy is visible. @internal */
export function harnessRevision(kind: HarnessKind): string {
  return createHash("sha256").update(browserLibMjs).update(HARNESS_SOURCE[kind]).digest("hex").slice(0, 8);
}

export type HarnessPlan = { ok: true; script: string; cwd: string } | { ok: false; error: string };

/**
 * Decide how to run the `kind` harness from `cwd`: the bundled harness, run in the
 * nearest game project. `allowNoProject` lets `--help` render without one on disk.
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
  const dir = materializeHarness(kind);
  return { ok: true, script: join(dir, `${kind}.mjs`), cwd: root ?? cwd };
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
    console.error(`jgengine ${kind}: using the bundled ${kind} harness (jgengine ${cliVersion()}, harness ${harnessRevision(kind)}) — cwd ${plan.cwd}`);
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
