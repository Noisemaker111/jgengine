// A lane in a worktree that has no dependencies used to learn it the slow way: a
// raw `command not found` from a spawn, or a module-resolution error from inside a
// test file, both of which read as a broken change instead of an unset-up checkout.
// The probe is one stat on the marker `bun install` writes, run before any work.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Distinct from 1/2/3: this checkout is not set up, the change was never checked. */
export const EXIT_NOT_SET_UP = 78;

export interface CheckoutProblem {
  /** What is missing, in the checkout's own words. */
  detail: string;
  /** The exact command that fixes it. */
  fix: string;
}

/**
 * Cheap readiness probe: `bun install` writes this binary, so its absence means the
 * checkout was never installed (or lost its store), not that a test failed.
 */
export function checkoutProblem(root: string): CheckoutProblem | null {
  const modules = join(root, "node_modules");
  if (!existsSync(modules) || !statSync(modules).isDirectory()) {
    return { detail: "node_modules is missing", fix: "bun install" };
  }
  const tsgo = join(modules, ".bin", process.platform === "win32" ? "tsgo.exe" : "tsgo");
  if (!existsSync(tsgo)) {
    return { detail: "node_modules is incomplete (node_modules/.bin/tsgo is not there)", fix: "bun install" };
  }
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
  const target = process.env.JG_CHECKOUT_ROOT ?? root;
  const problem = checkoutProblem(target);
  if (problem === null) return;
  console.error(checkoutFixText(script, target, problem));
  process.exit(EXIT_NOT_SET_UP);
}
