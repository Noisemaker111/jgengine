import { join, resolve } from "node:path";

/** Sibling of `cli/` under `src/` (dev) or `dist/` (published) so reindex writes the tree consumers import. */
export function resolveGeneratedDir(cliDir: string): string {
  return join(resolve(cliDir, ".."), "generated");
}

export function resolvePackageTreeRoot(cliDir: string): string {
  return resolve(cliDir, "..");
}

export function resolvePackageRoot(cliDir: string): string {
  return resolve(cliDir, "..", "..");
}
