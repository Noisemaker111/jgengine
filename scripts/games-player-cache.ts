import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cacheDir = join(root, "node_modules", ".cache", "jgengine-games-player");
const hashFile = join(cacheDir, "input-hash.txt");
const cachedOutput = join(cacheDir, "output");
const outputDir = join(root, "apps", "web", "public", "play");

const HASH_ROOTS = [
  "Games",
  "apps/dev/src",
  "apps/dev/index.html",
  "apps/dev/vite.config.ts",
  "apps/dev/package.json",
  "packages/core/src",
  "packages/react/src",
  "packages/shell/src",
  "packages/convex/src",
  "packages/editor/src",
  "bun.lock",
];

function collectFiles(path: string, out: string[]): void {
  const stat = statSync(path);
  if (!stat.isDirectory()) {
    out.push(path);
    return;
  }
  for (const entry of readdirSync(path).sort()) {
    if (entry === "node_modules" || entry === "dist") continue;
    collectFiles(join(path, entry), out);
  }
}

export function computeInputHash(): string {
  const files: string[] = [];
  for (const rel of HASH_ROOTS) {
    const abs = join(root, rel);
    if (existsSync(abs)) collectFiles(abs, files);
  }
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(relative(root, file));
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

/** Restores apps/web/public/play from the cache when the games-player inputs are unchanged. */
export function restoreFromCache(): boolean {
  if (!existsSync(hashFile) || !existsSync(cachedOutput)) return false;
  if (readFileSync(hashFile, "utf8").trim() !== computeInputHash()) return false;
  rmSync(outputDir, { recursive: true, force: true });
  cpSync(cachedOutput, outputDir, { recursive: true });
  return true;
}

export function saveToCache(): void {
  mkdirSync(cacheDir, { recursive: true });
  rmSync(cachedOutput, { recursive: true, force: true });
  cpSync(outputDir, cachedOutput, { recursive: true });
  writeFileSync(hashFile, computeInputHash());
}
