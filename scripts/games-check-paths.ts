import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** `@jgengine/<pkg>` and `@jgengine/<pkg>/*` → this checkout's `packages/<pkg>/src`, like the dev runner's aliases. */
export function engineSourcePaths(packagesDir: string): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const pkg of readdirSync(packagesDir).sort()) {
    const src = join(packagesDir, pkg, "src");
    if (!existsSync(src)) continue;
    if (existsSync(join(src, "index.ts"))) paths[`@jgengine/${pkg}`] = [join(src, "index.ts")];
    paths[`@jgengine/${pkg}/*`] = [join(src, "*")];
  }
  return paths;
}

/** Engine mappings win over a game's own entries for `@jgengine/*`; every other game alias is kept. */
export function mergeGamePaths(
  game: Record<string, string[]>,
  engine: Record<string, string[]>,
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const [key, targets] of Object.entries(game)) if (!key.startsWith("@jgengine/")) merged[key] = targets;
  return { ...merged, ...engine };
}
