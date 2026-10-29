// A lane in a worktree that has no dependencies used to learn it the slow way: a
// raw `command not found` from a spawn, or a module-resolution error from inside a
// test file, both of which read as a broken change instead of an unset-up checkout.
// The probe is one stat on the marker `bun install` writes, run before any work.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { dependencyPlan, probeInstall } from "./worktree-doctor";

/** Distinct from 1/2/3: this checkout is not set up, the change was never checked. */
export const EXIT_NOT_SET_UP = 78;

export interface CheckoutProblem {
  /** What is missing, in the checkout's own words. */
  detail: string;
  /** The exact command that fixes it. */
  fix: string;
}

/**
 * The binary `bun install` writes for tsgo: `tsgo.exe` on Windows, `tsgo` elsewhere. Every
 * "is this checkout installed" question asks this one path; a check that looked for `tsgo` on
 * Windows never found it, so every worktree ran a full install instead of sharing the main one.
 */
export function tsgoBin(root: string): string {
  return join(root, "node_modules", ".bin", process.platform === "win32" ? "tsgo.exe" : "tsgo");
}

/** True when `root` has an install at all (or a linked one). Whether it is complete is `missingDependencies`. */
export function hasInstall(root: string): boolean {
  return existsSync(tsgoBin(root));
}

/**
 * Every package a `package.json` in this checkout declares that its `node_modules` cannot resolve,
 * as `<workspace>/<package>`. One `tsgo` binary said "installed" while a game's own packages were
 * missing: a branch checked out or rebased after the install adds a dependency (`@react-three/drei`
 * in `games/scrap-signal`), or a linked worktree copies the main checkout's older per-game folders.
 * About 700 `existsSync` calls, so every readiness check can afford it.
 */
export function missingDependencies(root: string): string[] {
  try {
    return probeInstall(root, dependencyPlan(root)).missing;
  } catch {
    return [];
  }
}

export function missingText(missing: readonly string[]): string {
  const shown = missing.slice(0, 3).join(", ");
  return `${missing.length} declared package(s) are not installed (${shown}${missing.length > 3 ? ", ..." : ""})`;
}

/**
 * Readiness probe: `bun install` writes the tsgo binary, so its absence means the checkout was
 * never installed (or lost its store); a declared package that does not resolve means the tree
 * changed after its install. Either is an unset-up checkout, not a failed change.
 */
export function checkoutProblem(root: string): CheckoutProblem | null {
  const modules = join(root, "node_modules");
  if (!existsSync(modules) || !statSync(modules).isDirectory()) {
    return { detail: "node_modules is missing", fix: "bun install" };
  }
  if (!hasInstall(root)) {
    return { detail: "node_modules is incomplete (node_modules/.bin/tsgo is not there)", fix: "bun install" };
  }
  const missing = missingDependencies(root);
  if (missing.length > 0) return { detail: missingText(missing), fix: "bun scripts/ensure-ready.ts --install-only" };
  return null;
}

export function checkoutFixText(script: string, root: string, problem: CheckoutProblem): string {
  return [
    `${script}: this checkout cannot run that yet - ${problem.detail}.`,
    `Fix: ${problem.fix}`,
    `  in ${root}`,
    "A cold checkout or a fresh worktree can also use: bun run agent:bootstrap",
    `Then run: bun run ${script}`,
  ].join("\n");
}

/**
 * Prints the fix and exits 78 when the checkout is not installed. Returns normally
 * otherwise, so a genuine failure later still fails on its own.
 * `JG_CHECKOUT_ROOT` points the probe at another checkout for tests.
 */
export function assertCheckoutReady(script: string, root = process.cwd()): void {
  const target = process.env["JG_CHECKOUT_ROOT"] ?? root;
  let problem = checkoutProblem(target);
  if (problem === null) return;
  // An installed tree that lost some packages is repaired here rather than handed back as a wall:
  // ten sessions in two days stopped on the same missing package and found the same fix.
  if (hasInstall(target) && existsSync(join(target, "scripts", "ensure-ready.ts"))) {
    console.error(`${script}: ${problem.detail}; installing them first`);
    const repaired = Bun.spawnSync(["bun", "scripts/ensure-ready.ts", "--install-only"], {
      cwd: target,
      stdout: "inherit",
      stderr: "inherit",
      timeout: 600_000,
    });
    problem = repaired.exitCode === 0 ? checkoutProblem(target) : problem;
    if (problem === null) return;
  }
  console.error(checkoutFixText(script, target, problem));
  process.exit(EXIT_NOT_SET_UP);
}
