import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, parse, relative, sep } from "node:path";

import { PROPOSAL_FILE } from "./proposals";
import { exportedNames, importRefs, nearestPackageDir, resolveRelative, walkFiles } from "./source";

/**
 * `jgengine propose --migrate <dir>`: turn an `engine-local/<name>/` folder (engine code a game
 * wrote for itself with no trail back to the engine) into proposal form. The folder keeps its
 * files; a `<name>.engine.ts` entry beside them carries the metadata and re-exports what the game
 * uses, and the game's imports move onto that entry. Model and draw code get separate entries, as
 * the engine keeps them in separate files.
 */

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const DRAW_FILE = /\.(?:draw|view)\.[cm]?[jt]sx?$/;

export interface MigrationWrite {
  path: string;
  contents: string;
}

/** One game import moved onto a proposal entry. */
export interface MigrationRewrite {
  file: string;
  from: string;
  to: string;
}

export interface MigrationPlan {
  /** New entry files. */
  writes: MigrationWrite[];
  /** Game files whose imports change, with their new contents. */
  edits: MigrationWrite[];
  rewrites: MigrationRewrite[];
  /** What the author still has to decide, beyond the TODO fields. */
  notes: string[];
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

/** `creatureBody` → `creature-body`. */
export function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function moduleSpecifier(fromDir: string, file: string): string {
  const rel = posix(relative(fromDir, file)).replace(/\.[cm]?[jt]sx?$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function inside(file: string, dir: string): boolean {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !/^[A-Za-z]:/.test(rel);
}

interface Use {
  file: string;
  specifier: string;
  at: number;
  target: string;
  names: string[];
}

/** What migrating `dir` would write, without writing anything. */
export function planMigration(dir: string): MigrationPlan {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`not a folder: ${dir}`);
  const name = basename(dir);
  const own = walkFiles(dir, SOURCE_FILE);
  if (own.some((file) => PROPOSAL_FILE.test(file))) throw new Error(`${dir} already holds a *.engine.ts proposal`);
  if (own.length === 0) throw new Error(`${dir} holds no source files`);
  const gameDir = nearestPackageDir(dirname(dir), parse(dir).root);

  const uses: Use[] = [];
  const texts = new Map<string, string>();
  for (const file of walkFiles(gameDir, SOURCE_FILE)) {
    if (inside(file, dir)) continue;
    const text = readFileSync(file, "utf8");
    for (const ref of importRefs(text)) {
      if (!ref.specifier.startsWith(".")) continue;
      const target = resolveRelative(file, ref.specifier);
      if (target === null || !inside(target, dir)) continue;
      texts.set(file, text);
      uses.push({ file, specifier: ref.specifier, at: ref.at, target, names: ref.names });
    }
  }

  const notes: string[] = [];
  const modules = uses.length > 0 ? [...new Set(uses.map((use) => use.target))] : own.filter((file) => !TEST_FILE.test(file));
  if (uses.length === 0) notes.push(`nothing outside ${name}/ imports it: the entry re-exports every module; trim exports to the part worth upstreaming`);
  const groups = [
    { suffix: "", idSuffix: "", files: modules.filter((file) => !DRAW_FILE.test(file)) },
    { suffix: ".draw", idSuffix: "-draw", files: modules.filter((file) => DRAW_FILE.test(file)) },
  ].filter((group) => group.files.length > 0);

  const writes: MigrationWrite[] = [];
  const entryFor = new Map<string, string>();
  for (const group of groups) {
    const entry = join(dir, `${name}${group.suffix}.engine.ts`);
    const names = new Set<string>();
    const reexports: string[] = [];
    const byUse = new Map<string, number>();
    for (const file of group.files) {
      entryFor.set(file, entry);
      const fileUses = uses.filter((use) => use.target === file);
      byUse.set(file, new Set(fileUses.map((use) => use.file)).size);
      const all = exportedNames(file);
      const used = fileUses.length === 0 ? [...all] : fileUses.flatMap((use) => (use.names.includes("*") ? [...all] : use.names));
      for (const usedName of used) {
        if (usedName === "default") {
          notes.push(`${posix(relative(gameDir, file))} is imported by its default export, which \`export *\` does not carry: give it a name`);
          continue;
        }
        names.add(usedName);
      }
      reexports.push(`export * from "${moduleSpecifier(dir, file)}";`);
    }
    const clashes = new Map<string, string[]>();
    for (const file of group.files) for (const exported of exportedNames(file)) clashes.set(exported, [...(clashes.get(exported) ?? []), basename(file)]);
    for (const [exported, files] of clashes) {
      if (files.length > 1 && exported !== "default") notes.push(`${exported} is exported by ${files.join(" and ")}: \`export *\` drops it, so re-export it by name in ${basename(entry)}`);
    }
    if (names.has("proposal")) notes.push(`a module of ${name}/ exports \`proposal\`, which ${basename(entry)} defines: rename one`);
    const main = [...group.files].sort((a, b) => (byUse.get(b) ?? 0) - (byUse.get(a) ?? 0) || (a < b ? -1 : 1))[0]!;
    const targetModule = basename(main).replace(/\.[cm]?[jt]sx?$/, "");
    const exportsList = [...names].sort();
    const contents = [
      `// Engine proposal, migrated from ${posix(relative(gameDir, dir))}/ by \`jgengine propose --migrate\`.`,
      "// Fill in every TODO, then `jgengine propose --check`; `jgengine propose` prints the issue to file.",
      'import { defineEngineProposal } from "@jgengine/core/meta/proposal";',
      "",
      "export const proposal = defineEngineProposal({",
      `  id: "${kebab(name)}${group.idSuffix}",`,
      "  // TODO: confirm the public path this belongs at, and the kind (\"new\", \"extend\", or \"fork\" plus `fork: \"packages/<pkg>/src/<file>.ts\"`).",
      `  target: "@jgengine/core/${name}/${targetModule}",`,
      `  need: "TODO: one or two sentences: what the engine is missing and why ${basename(gameDir)} needs it.",`,
      '  kind: "new",',
      `  exports: [${exportsList.map((exported) => `"${exported}"`).join(", ")}],`,
      "});",
      "",
      ...reexports,
      "",
    ].join("\n");
    writes.push({ path: entry, contents });
  }

  const edits: MigrationWrite[] = [];
  const rewrites: MigrationRewrite[] = [];
  for (const [file, text] of texts) {
    let next = text;
    const fileUses = uses.filter((use) => use.file === file).sort((a, b) => b.at - a.at);
    for (const use of fileUses) {
      const entry = entryFor.get(use.target)!;
      const extension = /\.(?:[cm]?js|jsx?|tsx?)$/.exec(use.specifier)?.[0];
      const to = `${moduleSpecifier(dirname(file), entry)}${extension === undefined ? "" : extension.startsWith(".ts") ? ".ts" : ".js"}`;
      next = `${next.slice(0, use.at + 1)}${to}${next.slice(use.at + 1 + use.specifier.length)}`;
      rewrites.push({ file, from: use.specifier, to });
    }
    edits.push({ path: file, contents: next });
  }
  rewrites.reverse();
  return { writes, edits, rewrites, notes };
}

/** Write a plan: the entry files, then the game files with their moved imports. */
export function applyMigration(plan: MigrationPlan): void {
  for (const write of [...plan.writes, ...plan.edits]) writeFileSync(write.path, write.contents);
}
