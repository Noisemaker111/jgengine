import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * A game's stylesheet declares where Tailwind scans for class names. Games run the engine from
 * package source (see vite-engine-source.test.ts), so a `@source` that names a package's `dist`
 * resolves to nothing and the engine shell's utilities are never generated: the play surface
 * collapses to zero height, the canvas never configures and the scene warmup waits forever
 * (#3097, Deepward's desktop depth-run). Every declared source must name a path that exists.
 */

const repo = resolve(import.meta.dir, "..", "..");
const gamesDir = join(repo, "games");

function gameStylesheets(): string[] {
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const src = join(gamesDir, entry.name, "src");
      if (!existsSync(src)) return [];
      return readdirSync(src, { withFileTypes: true })
        .filter((file) => file.isFile() && file.name.endsWith(".css"))
        .map((file) => join(src, file.name));
    });
}

/** Quoted paths a stylesheet hands Tailwind: `@source "..."` and `source("...")` on the tailwind import. */
function declaredSources(css: string): string[] {
  const paths: string[] = [];
  for (const match of css.matchAll(/@source\s+["']([^"']+)["']/g)) paths.push(match[1]!);
  for (const match of css.matchAll(/@import\s+["']tailwindcss["'][^;]*?source\(\s*["']([^"']+)["']\s*\)/g)) paths.push(match[1]!);
  return paths;
}

describe("every game's stylesheet sources exist", () => {
  for (const file of gameStylesheets()) {
    test(`${relative(repo, file)} declares only sources that resolve`, () => {
      const missing = declaredSources(readFileSync(file, "utf8"))
        .map((declared) => resolve(dirname(file), declared))
        .filter((path) => !existsSync(path));
      expect(missing.map((path) => relative(repo, path))).toEqual([]);
    });
  }
});
