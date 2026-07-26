import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Sibling of `cli/` under `src/` (dev) or `dist/` (published) so reindex writes the tree consumers import.
 * @internal
 */
export function resolveGeneratedDir(cliDir: string): string {
  return join(resolve(cliDir, ".."), "generated");
}

/** Sprite-pack counterpart of `resolveGeneratedDir` — a separate generated tree, same sibling layout.
 * @internal
 */
export function resolveGeneratedSpritesDir(cliDir: string): string {
  return join(resolve(cliDir, ".."), "generated-sprites");
}

/** @internal */
export function resolvePackageTreeRoot(cliDir: string): string {
  return resolve(cliDir, "..");
}

/** @internal */
export function resolvePackageRoot(cliDir: string): string {
  return resolve(cliDir, "..", "..");
}

/**
 * The default output root a bare `assets pull` / `assets add` writes into.
 *
 * Inside the jgengine monorepo the dev server serves models, sprites, and
 * materials from `apps/dev/public`, so a plain pull must land bytes there — not
 * in a cwd-relative `public/` that diverges from what the runner serves (the
 * footgun where `bun --cwd=packages/assets ... pull` dropped GLBs into
 * `packages/assets/public`, invisible to every game). When the package is
 * installed as a dependency outside the monorepo that served root does not
 * exist, so we fall back to the historical cwd-relative `public`, preserving
 * downstream behavior. Callers can always override with `--dir`.
 *
 * @internal
 */
export function resolveDefaultOutputRoot(cliDir: string): string {
  const servedRoot = resolve(cliDir, "..", "..", "..", "..", "apps", "dev", "public");
  if (existsSync(servedRoot)) return servedRoot;
  return resolve("public");
}

/**
 * Where a bare `assets reindex` / `reindex-sprites` (no explicit dir arg) reads
 * from. It must be the same served root {@link resolveDefaultOutputRoot} writes
 * to — otherwise `assets pull` lands GLBs in `apps/dev/public/models` while a
 * plain `assets reindex` scans a cwd-relative `public/models` that never
 * received them, regenerating an index blind to the freshly pulled pack. Kept in
 * lockstep with the pull default so the two never disagree on where packs live.
 *
 * @internal
 */
export function resolveDefaultReindexDir(cliDir: string, kind: "models" | "sprites"): string {
  return join(resolveDefaultOutputRoot(cliDir), kind);
}
