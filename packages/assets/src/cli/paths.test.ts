import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { resolveDefaultOutputRoot } from "./paths";

/**
 * These cases build a small directory tree on disk to exercise the
 * monorepo-vs-dependency branch of {@link resolveDefaultOutputRoot}, so give
 * them an explicit generous budget rather than the default 5s that a contended
 * `test:all` run can blow past.
 */
const HEAVY_CASE_TIMEOUT_MS = 30_000;

/** Hermetic scratch root, seeded under a controlled base so it never depends on ambient `/tmp` state. */
function makeRoot(): string {
  const base = join(tmpdir(), "jgengine-assets-paths-tests");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, "root-"));
}

/**
 * Regression guard for the pull/dev-runner path contract (#1499): a bare
 * `assets pull` / `assets add` must land bytes where the dev runner serves them.
 * Inside the monorepo that is `apps/dev/public`; installed as a dependency (no
 * such tree above the CLI) it falls back to the historical cwd-relative `public`.
 * Before the fix a plain pull wrote to a cwd-relative `public/models` that the
 * `apps/dev` dev server never served, 404ing the editor dev runner until the
 * pack was hand-copied.
 */
describe("resolveDefaultOutputRoot (pull → dev-served dir contract)", () => {
  test("inside the monorepo, resolves to the dev-served apps/dev/public root", () => {
    const root = makeRoot();
    try {
      // Mirror the real layout: packages/assets/src/cli is four levels below repo root.
      const cliDir = join(root, "packages", "assets", "src", "cli");
      mkdirSync(cliDir, { recursive: true });
      const served = join(root, "apps", "dev", "public");
      mkdirSync(served, { recursive: true });

      expect(resolveDefaultOutputRoot(cliDir)).toBe(resolve(served));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, HEAVY_CASE_TIMEOUT_MS);

  test("the published dist/cli layout resolves to the same dev-served root", () => {
    const root = makeRoot();
    try {
      // The compiled CLI lives in dist/cli — also four levels below repo root.
      const cliDir = join(root, "packages", "assets", "dist", "cli");
      mkdirSync(cliDir, { recursive: true });
      const served = join(root, "apps", "dev", "public");
      mkdirSync(served, { recursive: true });

      expect(resolveDefaultOutputRoot(cliDir)).toBe(resolve(served));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, HEAVY_CASE_TIMEOUT_MS);

  test("installed as a dependency (no apps/dev/public above the CLI), falls back to cwd-relative public", () => {
    const root = makeRoot();
    try {
      // node_modules/@jgengine/assets/dist/cli — four levels up is node_modules, which has no apps/dev/public.
      const cliDir = join(root, "node_modules", "@jgengine", "assets", "dist", "cli");
      mkdirSync(cliDir, { recursive: true });

      expect(resolveDefaultOutputRoot(cliDir)).toBe(resolve("public"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, HEAVY_CASE_TIMEOUT_MS);
});
