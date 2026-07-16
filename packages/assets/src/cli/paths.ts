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
