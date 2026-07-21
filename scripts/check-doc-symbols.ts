import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Glob } from "bun";

import { Node, Project } from "ts-morph";

/**
 * Integrity gate for documented *symbol names*.
 *
 * `check-recipes` and `check-skill-sync` already prove that every `@jgengine/*`
 * import *path* a doc names is a real published subpath. Nothing, however,
 * proved that the *symbols* pulled from that path actually exist — so fictional
 * APIs (`applyToMyHealthStore`, `createWsBackend({ gameId })`, invented UI
 * components, `createPushToTalk` misattributed to `@jgengine/react/voice`) slid
 * into skill docs and the marketing samples unchallenged.
 *
 * This gate closes that hole. It extracts `import { X, Y as Z } from
 * "@jgengine/…"` statements from two doc surfaces —
 *
 *  1. hand-written skill markdown under `.claude/skills/ ** / *.md` (the
 *     generated `api.md` / `capabilities.md` are trustworthy by construction and
 *     skipped, mirroring `check-skill-sync`);
 *  2. the ``code:`` marketing/code template literals in
 *     `apps/web/src/routes/ ** / *.tsx` (scanned wholesale — real top-of-file
 *     imports there compile, so they pass, and the sample literals are the
 *     target);
 *
 * — and checks each imported symbol against the real exported surface of the
 * module it is attributed to. A symbol that the module does not export fails the
 * gate. This is a symbol-*existence* check only — signatures are not validated.
 *
 * The exported surface is resolved *syntactically* from source: direct `export`
 * declarations, `export { A, B as C }` specifiers, and transitive `export *`
 * barrels. This is deliberate — the type-checker-driven
 * `getExportedDeclarations()` (what `extractPackageSurface`/`gen-skill-api` use)
 * silently drops exports when cross-package types don't fully resolve, which
 * would make this gate false-positive on real APIs. A "symbol does not exist"
 * verdict must never rest on an incomplete surface.
 */

const root = process.cwd();
const packagesDir = join(root, "packages");

function rel(path: string): string {
  return path.replace(root + "/", "").replaceAll("\\", "/");
}

// --- resolve a documented import path to its source file --------------------
// `@jgengine/<pkg>/<sub>` -> packages/<pkg>/src/<sub>{.ts,.tsx,/index.ts}
// mirroring how check-skill-sync resolves documented subpaths.
function fileFor(base: string): string | undefined {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function resolveModuleFile(importPath: string): string | undefined {
  const parts = importPath.split("/"); // ["@jgengine", "<pkg>", ...sub]
  const pkg = parts[1];
  if (pkg === undefined) return undefined;
  const sub = parts.slice(2).join("/");
  const srcRoot = join(packagesDir, pkg, "src");
  if (!existsSync(srcRoot)) return undefined;
  return fileFor(sub === "" ? join(srcRoot, "index") : join(srcRoot, sub));
}

// --- syntactic export surface of a source file (follows `export *`) ---------
const project = new Project({ skipAddingFilesFromTsConfig: true, useInMemoryFileSystem: false });
const exportsCache = new Map<string, Set<string>>();

function resolveRelativeReexport(fromFile: string, spec: string): string | undefined {
  if (spec.startsWith(".")) return fileFor(resolve(dirname(fromFile), spec));
  if (spec.startsWith("@jgengine/")) return resolveModuleFile(spec);
  return undefined; // third-party barrels contribute no @jgengine surface we validate
}

function exportsOfFile(file: string, visiting: Set<string> = new Set()): Set<string> {
  const cached = exportsCache.get(file);
  if (cached !== undefined) return cached;
  const names = new Set<string>();
  exportsCache.set(file, names); // seed before recursion to break cycles
  if (visiting.has(file)) return names;
  visiting.add(file);

  const sourceFile = project.addSourceFileAtPathIfExists(file);
  if (sourceFile === undefined) return names;

  // Directly-exported declarations (function/class/interface/type/enum/const/namespace).
  for (const decl of [
    ...sourceFile.getFunctions(),
    ...sourceFile.getClasses(),
    ...sourceFile.getInterfaces(),
    ...sourceFile.getTypeAliases(),
    ...sourceFile.getEnums(),
    ...sourceFile.getModules(),
  ]) {
    if (decl.hasExportKeyword() && !decl.isDefaultExport()) {
      const name = decl.getName();
      if (name !== undefined && name !== "") names.add(name);
    }
  }
  for (const stmt of sourceFile.getVariableStatements()) {
    if (!stmt.hasExportKeyword()) continue;
    for (const d of stmt.getDeclarations()) {
      const nameNode = d.getNameNode();
      // Only plain identifier bindings carry a named export; destructuring is rare here.
      if (Node.isIdentifier(nameNode)) names.add(nameNode.getText());
    }
  }

  // `export { A, B as C }` and `export { A } from "./x"` — the visible name is the alias if present.
  for (const exp of sourceFile.getExportDeclarations()) {
    const moduleSpec = exp.getModuleSpecifierValue();
    if (exp.isNamespaceExport()) {
      // `export * as NS from "./x"` names NS; bare `export * from "./x"` re-exports everything.
      const ns = exp.getNamespaceExport();
      if (ns !== undefined) {
        names.add(ns.getName());
      } else if (moduleSpec !== undefined) {
        const target = resolveRelativeReexport(file, moduleSpec);
        if (target !== undefined) for (const n of exportsOfFile(target, visiting)) names.add(n);
      }
      continue;
    }
    for (const spec of exp.getNamedExports()) {
      names.add((spec.getAliasNode() ?? spec.getNameNode()).getText());
    }
  }

  return names;
}

// --- collect the two documented sources ------------------------------------
interface DocSource {
  file: string;
  text: string;
}

function docSources(): DocSource[] {
  const out: DocSource[] = [];

  // 1. hand-written skill markdown (skip generated api.md / capabilities.md)
  const skillsRoot = join(root, ".claude", "skills");
  if (existsSync(skillsRoot)) {
    for (const file of new Glob("**/*.md").scanSync({ cwd: skillsRoot, absolute: true })) {
      const name = basename(file);
      if (name === "api.md" || name === "capabilities.md") continue;
      out.push({ file, text: readFileSync(file, "utf8") });
    }
  }

  // 2. web route source (code: template literals live inline here)
  const routesRoot = join(root, "apps", "web", "src", "routes");
  if (existsSync(routesRoot)) {
    for (const file of new Glob("**/*.tsx").scanSync({ cwd: routesRoot, absolute: true })) {
      out.push({ file, text: readFileSync(file, "utf8") });
    }
  }

  return out;
}

// --- parse `import { ... } from "@jgengine/..."` (multi-line, type, alias) ---
interface ImportedSymbol {
  symbol: string;
  importPath: string;
  line: number;
}

// Matches the named-import form, tolerating multi-line braces:
//   import { A, type B, C as D } from "@jgengine/pkg/sub"
// Namespace (`import * as X`), default, and side-effect imports carry no
// per-symbol claim about the module surface and are intentionally ignored.
const NAMED_IMPORT = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["'](@jgengine\/[^"']+)["']/g;

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

function extractImports(source: DocSource): ImportedSymbol[] {
  const found: ImportedSymbol[] = [];
  for (const match of source.text.matchAll(NAMED_IMPORT)) {
    const clause = match[1] ?? "";
    const importPath = match[2]!;
    const line = lineOf(source.text, match.index ?? 0);
    for (const raw of clause.split(",")) {
      let spec = raw.trim();
      if (spec === "") continue;
      spec = spec.replace(/^type\s+/, ""); // per-specifier `type` modifier
      // `X as Y` — the module must export X (the local alias Y is doc-local)
      const source0 = spec.split(/\s+as\s+/)[0]!.trim();
      if (source0 === "") continue;
      found.push({ symbol: source0, importPath, line });
    }
  }
  return found;
}

// --- run --------------------------------------------------------------------
const sources = docSources();

const problems: string[] = [];
let checked = 0;

for (const source of sources) {
  for (const { symbol, importPath, line } of extractImports(source)) {
    const file = resolveModuleFile(importPath);
    // If the module path doesn't resolve to a source file, the *path* gates
    // (check-recipes / check-skill-sync) own that failure; here we only judge
    // symbols against a module we can actually resolve, so we never
    // false-positive on a path our resolver can't map.
    if (file === undefined) continue;
    const symbols = exportsOfFile(file);
    checked++;
    if (!symbols.has(symbol)) {
      problems.push(
        `${rel(source.file)}:${line}: "${symbol}" is not exported from ${importPath} — fictional or misattributed symbol (checked against the real export surface of packages/${importPath.split("/")[1]}/src)`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    `\ncheck-doc-symbols: ${problems.length} fictional/misattributed symbol(s) in docs:\n` +
      problems.map((p) => `  ${p}`).join("\n") +
      `\n\nDocs and marketing samples may only import symbols a module actually\n` +
      `exports. Fix the symbol name, correct the module it is attributed to, or\n` +
      `implement + export it. Import paths are validated separately by\n` +
      `check-recipes / check-skill-sync.\n`,
  );
  process.exit(1);
}

console.log(
  `check-doc-symbols: clean — ${checked} documented @jgengine symbol import(s) across ${sources.length} doc source(s) resolve to real exports`,
);
