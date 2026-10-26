// Layer rules for the engine packages, read from imports instead of package walls. A feature folder in
// core holds every layer of its feature, so the file name says the layer:
//
//   model  core files with no suffix: plain TypeScript; no React, no three.js, no view or draw file
//   view   `*.view.ts(x)` in core, and all of @jgengine/react: React UI; no three.js, no draw file
//   draw   `*.draw.ts(x)` in core, and all of @jgengine/shell: three.js / react-three-fiber
//
// Nothing below the editor imports @jgengine/editor. Tests are exempt: a test may render any layer.
//
//   bun run check layers
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked, type Usage } from "./script-help";

export type Layer = "model" | "view" | "draw";

/** What an import pulls in, as far as the layer rules care. */
type Reach = Layer | "react" | "three" | "editor" | null;

export interface LayerViolation {
  file: string;
  specifier: string;
  detail: string;
}

const ENGINE_SOURCE = /^packages\/(core|react|shell)\/src\/.+\.tsx?$/;
const EXEMPT = /\.(test|spec)\.tsx?$|(^|\/)testFixtures(\.tsx?$|\/)|\.d\.ts$/;

/** The layer a file belongs to, or null when the rules do not apply to it. */
export function layerOfFile(path: string): Layer | null {
  const match = ENGINE_SOURCE.exec(path);
  if (match === null || EXEMPT.test(path)) return null;
  if (match[1] === "react") return "view";
  if (match[1] === "shell") return "draw";
  if (/\.view\.tsx?$/.test(path)) return "view";
  if (/\.draw\.tsx?$/.test(path)) return "draw";
  return "model";
}

/** The layer a module name names: by package, then by the `.view` / `.draw` suffix of its file. */
function layerOfModule(packageName: string, subpath: string): Layer {
  if (packageName === "react") return "view";
  if (packageName === "shell") return "draw";
  if (/\.view$/.test(subpath)) return "view";
  if (/\.draw$/.test(subpath)) return "draw";
  return "model";
}

/** What one import specifier reaches, seen from `file`. */
export function reachOf(file: string, specifier: string): Reach {
  if (/^(react|react-dom)(\/|$)/.test(specifier)) return "react";
  if (/^(three|three-stdlib)(\/|$)|^@react-three\//.test(specifier)) return "three";
  const engine = /^@jgengine\/([^/]+)(?:\/(.+))?$/.exec(specifier);
  if (engine !== null) {
    if (engine[1] === "editor") return "editor";
    if (engine[1] === "core" || engine[1] === "react" || engine[1] === "shell") return layerOfModule(engine[1], engine[2] ?? "index");
    return null;
  }
  if (!specifier.startsWith(".")) return null;
  const pkg = ENGINE_SOURCE.exec(file)?.[1] ?? "core";
  const parts = file.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  const resolved = parts.join("/");
  const inPackage = /^packages\/(core|react|shell)\/src\/(.+)$/.exec(resolved);
  if (inPackage === null) return null;
  return layerOfModule(inPackage[1] ?? pkg, inPackage[2]!.replace(/\.tsx?$/, ""));
}

const FORBIDDEN: Record<Layer, ReadonlySet<Exclude<Reach, null>>> = {
  model: new Set(["react", "three", "view", "draw", "editor"]),
  view: new Set(["three", "draw", "editor"]),
  draw: new Set(["editor"]),
};

const RULE: Record<Layer, string> = {
  model: "model code imports no React, three.js, view or draw file",
  view: "view code imports no three.js or draw file",
  draw: "draw code imports no editor code",
};

/** `source` with block and line comments blanked, so a doc example's `import("…")` is not an import. */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+|\brequire\(\s*)["']([^"']+)["']/gm;

/** Every layer rule `source` (the text of `file`) breaks. */
export function violationsIn(file: string, source: string): LayerViolation[] {
  const layer = layerOfFile(file);
  if (layer === null) return [];
  const found: LayerViolation[] = [];
  for (const match of withoutComments(source).matchAll(IMPORT)) {
    const specifier = match[1]!;
    const reach = reachOf(file, specifier);
    if (reach === null || !FORBIDDEN[layer].has(reach)) continue;
    found.push({ file, specifier, detail: `${layer} file imports ${reach} (${specifier}): ${RULE[layer]}` });
  }
  return found;
}

/** Every violation in the tracked and untracked engine source under `root`. */
export function scanLayers(root: string): { files: number; violations: LayerViolation[] } {
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "packages/core/src", "packages/react/src", "packages/shell/src"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0) throw new Error(`git ls-files: ${listed.stderr}`);
  const files = listed.stdout.split("\n").filter((path) => layerOfFile(path) !== null);
  const violations: LayerViolation[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    violations.push(...violationsIn(file, source));
  }
  return { files: files.length, violations };
}

const USAGE: Usage = {
  summary: "fail when engine code imports across layers: model imports no React/three.js, view imports no three.js",
  usage: "bun run check layers",
  flags: [],
  example: "bun run check layers",
  exits: ["0 clean", "1 a file imports a layer it may not"],
};

function main(argv: readonly string[]): number {
  if (printHelpIfAsked("check:layers", USAGE, argv)) return 0;
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { files, violations } = scanLayers(root);
  if (violations.length === 0) {
    console.log(`layers ok: ${files} engine files keep their layer (model / view / draw)`);
    return 0;
  }
  console.error(`check:layers failed (README "Layering"):`);
  for (const violation of violations) console.error(`  ${violation.file}: ${violation.detail}`);
  return 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
