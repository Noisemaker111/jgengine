import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** A Vite `resolve.alias` entry; declared here so this file needs no `vite` install beside it. */
export interface Alias {
  find: string | RegExp;
  replacement: string;
}

const packagesDir = fileURLToPath(new URL("../../packages", import.meta.url));

/** The rendering libraries engine packages take as peers; the game's copy is the one copy. */
export const ENGINE_PEERS = ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei", "three-stdlib"] as const;

/** `@jgengine/<pkg>` and `@jgengine/<pkg>/<path>` resolved to `packages/<pkg>/src`, so a game runs the engine in this repo with no build. */
export function engineSourceAliases(dir = packagesDir): Alias[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "src")))
    .flatMap((entry) => {
      const manifest = join(dir, entry.name, "package.json");
      if (!existsSync(manifest)) return [];
      const name = (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name;
      if (name !== `@jgengine/${entry.name}`) return [];
      const src = join(dir, entry.name, "src").replaceAll("\\", "/");
      const index = join(dir, entry.name, "src", "index.ts");
      return [
        ...(existsSync(index) ? [{ find: new RegExp(`^${name}$`), replacement: `${src}/index.ts` }] : []),
        { find: new RegExp(`^${name}/(.*)$`), replacement: `${src}/$1` },
      ];
    });
}

/**
 * `resolve` for a game's Vite config: engine source aliases, and every engine peer the game
 * declares deduped to the game's own copy, so engine source and game code share one three.js
 * and one React even while the game sits on another in-range version.
 */
export function engineSource(gameDir: URL | string): { alias: Alias[]; dedupe: string[] } {
  const dir = typeof gameDir === "string" ? gameDir : fileURLToPath(gameDir);
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = { ...manifest.devDependencies, ...manifest.dependencies };
  return {
    alias: engineSourceAliases(),
    dedupe: ENGINE_PEERS.filter((pkg) => declared[pkg] !== undefined),
  };
}
