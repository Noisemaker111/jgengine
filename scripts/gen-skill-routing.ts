// Writes `scripts/skill-routing.json`: which skill documents each core feature folder
// (`packages/core/src/<folder>/`). Nobody edits a list when a folder is added: a new folder takes the
// skill most of its imports already belong to, a removed one leaves the file, and every folder routed
// before keeps its skill. To move a folder to another skill, change its entry; gen keeps it.
//
//   bun run gen skill-routing
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked } from "./script-help";
import { CORE_INTERNAL_DOMAINS, MAIN, ROUTING_FILE, SKILL_DIRS } from "./skillRouting";

/** Skills a folder can inherit, in tie-break order. The router skill is never inherited by import. */
export const INHERITABLE = ["jgengine-gameplay", "jgengine-world", "jgengine-ui", "jgengine-combat", "jgengine-assets", "jgengine-editor", "jgengine-multiplayer"] as const;
/** A folder whose imports name no routed folder. */
export const DEFAULT_SKILL = "jgengine-gameplay";

const IMPORT = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

/** The core folders a source file imports: `../x/...`, `../../x/...` or `@jgengine/core/x...`. */
export function importedFolders(source: string, depth: number): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(IMPORT)) {
    const spec = match[1]!;
    const pkg = /^@jgengine\/core\/([^/"']+)/.exec(spec);
    if (pkg !== null) {
      found.add(pkg[1]!);
      continue;
    }
    if (!spec.startsWith(".")) continue;
    const parts = spec.split("/");
    const ups = parts.filter((part) => part === "..").length;
    // A file `depth` folders under src/ reaches src/ with `depth` `..` segments; the next one is the folder.
    if (ups === depth && parts[ups] !== undefined) found.add(parts[ups]!);
  }
  return [...found];
}

/**
 * Route every folder: existing entries stay, new folders inherit the skill most of their routed
 * imports carry (ties go to the earlier {@link INHERITABLE} skill), repeated until a chain of new
 * folders settles; a folder with nothing to inherit gets {@link DEFAULT_SKILL}.
 */
export function routeFolders(
  folders: readonly string[],
  existing: Readonly<Record<string, string>>,
  imports: ReadonlyMap<string, readonly string[]>,
): Record<string, string> {
  const routed: Record<string, string> = {};
  for (const folder of folders) if (existing[folder] !== undefined) routed[folder] = existing[folder]!;
  const pending = folders.filter((folder) => routed[folder] === undefined);
  for (let pass = 0; pass <= pending.length; pass += 1) {
    let changed = false;
    for (const folder of pending) {
      if (routed[folder] !== undefined) continue;
      const votes = new Map<string, number>();
      // Neighbours both ways: what the folder imports and what imports it.
      const neighbours = [...(imports.get(folder) ?? []), ...[...imports].filter(([, list]) => list.includes(folder)).map(([other]) => other)];
      for (const other of neighbours) {
        const skill = other === folder ? undefined : routed[other];
        if (skill !== undefined && (INHERITABLE as readonly string[]).includes(skill)) votes.set(skill, (votes.get(skill) ?? 0) + 1);
      }
      if (votes.size === 0) continue;
      const best = Math.max(...votes.values());
      routed[folder] = INHERITABLE.find((skill) => votes.get(skill) === best)!;
      changed = true;
    }
    if (!changed) break;
  }
  for (const folder of pending) routed[folder] ??= DEFAULT_SKILL;
  return Object.fromEntries(Object.keys(routed).sort().map((folder) => [folder, routed[folder]!]));
}

function sourceFiles(dir: string, depth: number): { path: string; depth: number }[] {
  const out: { path: string; depth: number }[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path, depth + 1));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push({ path, depth });
  }
  return out;
}

/** Routing for the core source tree at `src`, keeping `existing`. */
export function deriveRouting(src: string, existing: Readonly<Record<string, string>>): Record<string, string> {
  // Feature folders, plus the top-level barrel files (`src/<name>.ts`) already routed: barrels are a
  // curated handful, so a new one falls back to the router skill instead of inheriting one.
  const folders = readdirSync(src)
    .filter((name) =>
      statSync(join(src, name)).isDirectory()
        ? !CORE_INTERNAL_DOMAINS.has(name)
        : /^[a-z][\w]*\.ts$/i.test(name) && existing[name.replace(/\.ts$/, "")] !== undefined,
    )
    .map((name) => name.replace(/\.ts$/, ""))
    .sort();
  const imports = new Map<string, string[]>();
  for (const folder of folders) {
    const seen = new Set<string>();
    if (!existsSync(join(src, folder))) continue;
    for (const file of sourceFiles(join(src, folder), 1)) {
      for (const other of importedFolders(readFileSync(file.path, "utf8"), file.depth)) seen.add(other);
    }
    imports.set(folder, [...seen].filter((other) => folders.includes(other)));
  }
  return routeFolders(folders, existing, imports);
}

function main(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const file = join(root, ROUTING_FILE);
  const existing = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { domains: Record<string, string> }).domains : {};
  const known = new Set<string>([MAIN, ...SKILL_DIRS]);
  for (const [folder, skill] of Object.entries(existing)) {
    if (!known.has(skill)) throw new Error(`${ROUTING_FILE}: ${folder} routes to unknown skill ${skill}`);
  }
  const domains = deriveRouting(join(root, "packages", "core", "src"), existing);
  const added = Object.keys(domains).filter((folder) => existing[folder] === undefined);
  const removed = Object.keys(existing).filter((folder) => domains[folder] === undefined);
  writeFileSync(
    file,
    `${JSON.stringify({ generatedBy: "bun run gen skill-routing; a new core folder takes the skill most of its imports carry", domains }, null, 2)}\n`,
  );
  const changes = [...added.map((folder) => `+${folder} -> ${domains[folder]}`), ...removed.map((folder) => `-${folder}`)];
  console.log(`skill-routing OK - ${Object.keys(domains).length} core folders${changes.length > 0 ? `; ${changes.join(", ")}` : ""}`);
}

if (import.meta.main && !printHelpIfAsked("gen-skill-routing", {
  summary: "write scripts/skill-routing.json: the skill that documents each core feature folder",
  usage: "bun run gen skill-routing",
  flags: [],
  example: "bun run gen skill-routing",
})) main();
