import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

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

function readJson(path: string): Record<string, unknown> {
  // tsconfig allows trailing commas and comments; the games' files are plain JSON today.
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** The game's own `paths`, made absolute (paths resolve against the tsconfig that declares them). */
export function gamePaths(tsconfigPath: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let path: string | undefined = tsconfigPath;
  const chain: string[] = [];
  while (path !== undefined && existsSync(path)) {
    chain.unshift(path);
    const extendsValue: unknown = readJson(path).extends;
    path = typeof extendsValue === "string" ? resolve(dirname(path), extendsValue) : undefined;
  }
  for (const file of chain) {
    const options = (readJson(file).compilerOptions ?? {}) as { paths?: Record<string, string[]> };
    for (const [key, targets] of Object.entries(options.paths ?? {})) {
      out[key] = targets.map((target) => (isAbsolute(target) ? target : resolve(dirname(file), target)));
    }
  }
  return out;
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
