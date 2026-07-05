import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const distDir = resolve(process.cwd(), process.argv[2] ?? "dist");

const SPECIFIER = /((?:from\s*|import\s*\(?\s*|export\s+\*\s+from\s*)["'])(\.\.?\/[^"']+)(["'])/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(js|d\.ts)$/.test(name) ? [full] : [];
  });
}

function fixSpecifier(fileDir: string, spec: string): string {
  if (/\.(js|json|mjs|cjs)$/.test(spec)) return spec;
  if (existsSync(join(fileDir, `${spec}.js`))) return `${spec}.js`;
  if (existsSync(join(fileDir, spec, "index.js"))) return `${spec}/index.js`;
  return spec;
}

let changed = 0;
for (const file of walk(distDir)) {
  const source = readFileSync(file, "utf8");
  const rewritten = source.replace(SPECIFIER, (whole, pre: string, spec: string, post: string) => {
    const fixed = fixSpecifier(dirname(file), spec);
    return fixed === spec ? whole : `${pre}${fixed}${post}`;
  });
  if (rewritten !== source) {
    writeFileSync(file, rewritten);
    changed++;
  }
}
console.log(`fix-extensions: rewrote ${changed} file(s) in ${distDir}`);
