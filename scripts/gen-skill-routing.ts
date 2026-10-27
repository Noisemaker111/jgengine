// Writes `scripts/skill-routing.json`: which skill documents each core feature folder
// (`packages/core/src/<folder>/`) and each routed top-level barrel (`src/<name>.ts`).
//
// The folder says it: one `// @skill <skill>` line in any of its source files. That line is the only
// place the choice lives; this file collects them. A folder with no tag gets one written for it: the
// skill whose folders its code reads most like (file and export names, doc comments), plus the skills
// of the folders it imports or that import it. The tag lands in the diff, so the guess is reviewed
// where the folder is, and changing it is a one-line edit in that folder.
//
//   bun run gen skill-routing
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked } from "./script-help";
import { CORE_INTERNAL_DOMAINS, MAIN, ROUTING_FILE, SKILL_DIRS } from "./skillRouting";

/** `// @skill jgengine-world` (or the same inside a doc comment): the skill that documents this folder. */
export const SKILL_TAG = /^\s*(?:\/\/|\/?\*+)\s*@skill\s+([a-z][\w-]*)\s*(?:\*\/)?\s*$/m;

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

/** Lower-case words of three letters or more, with camelCase split: `lootTable` -> `loot`, `table`. */
export function words(text: string): string[] {
  return text.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().match(/[a-z]{3,}/g) ?? [];
}

/** What one folder is, as far as routing can read: its tag, its words and its imports. */
export interface FolderProfile {
  name: string;
  /** Every distinct `@skill` tag in the folder; more than one is an error. */
  tags: string[];
  /** The file and line a tag was found in, for messages. */
  taggedIn: string[];
  /** Folder, file and exported names and doc comment words. */
  words: string[];
  /** Other routed folders it imports. */
  imports: string[];
  /** Where gen writes a tag for an untagged folder. */
  tagTarget: string;
}

function sourceFiles(dir: string, depth: number): { path: string; depth: number }[] {
  const out: { path: string; depth: number }[] = [];
  for (const name of readdirSync(dir).sort()) { // walk-ok: one core feature folder, bounded
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path, depth + 1));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push({ path, depth });
  }
  return out;
}

/** The file a new tag goes in: `<folder>/<folder>.ts(x)`, else `index.ts`, else the first file at the folder's root. */
function tagTargetFor(dir: string, name: string, files: readonly { path: string; depth: number }[]): string {
  for (const candidate of [`${name}.ts`, `${name}.tsx`, "index.ts"]) {
    if (existsSync(join(dir, candidate))) return join(dir, candidate);
  }
  return (files.find((file) => file.depth === 1) ?? files[0])!.path;
}

/**
 * Profile every feature folder under `src`, and every top-level file (`src/<name>.ts`) that carries a
 * tag: a barrel routes only when it says so.
 */
export function readProfiles(src: string): FolderProfile[] {
  const entries = readdirSync(src).sort();
  const folders = entries.filter((name) => statSync(join(src, name)).isDirectory() && !CORE_INTERNAL_DOMAINS.has(name));
  const barrels = entries.filter(
    (name) => /^[a-z]\w*\.ts$/i.test(name) && !/\.test\.ts$/.test(name) && SKILL_TAG.test(readFileSync(join(src, name), "utf8")),
  );
  const names = new Set([...folders, ...barrels.map((name) => name.replace(/\.ts$/, ""))]);
  const profiles: FolderProfile[] = [];
  for (const folder of folders) {
    const dir = join(src, folder);
    const files = sourceFiles(dir, 1);
    if (files.length === 0) continue;
    const profile: FolderProfile = { name: folder, tags: [], taggedIn: [], words: [folder, folder], imports: [], tagTarget: tagTargetFor(dir, folder, files) };
    const imports = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file.path, "utf8");
      const tag = SKILL_TAG.exec(source);
      if (tag !== null) {
        if (!profile.tags.includes(tag[1]!)) profile.tags.push(tag[1]!);
        profile.taggedIn.push(file.path);
      }
      for (const other of importedFolders(source, file.depth)) if (other !== folder && names.has(other)) imports.add(other);
      profile.words.push(...words(file.path.split(/[\\/]/).pop()!.replace(/\.tsx?$/, "")));
      for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/g)) profile.words.push(...words(match[1]!));
      for (const match of source.matchAll(/\/\*\*([\s\S]*?)\*\//g)) profile.words.push(...words(match[1]!));
    }
    profile.imports = [...imports].sort();
    profiles.push(profile);
  }
  for (const barrel of barrels) {
    const path = join(src, barrel);
    const tag = SKILL_TAG.exec(readFileSync(path, "utf8"))!;
    profiles.push({ name: barrel.replace(/\.ts$/, ""), tags: [tag[1]!], taggedIn: [path], words: [], imports: [], tagTarget: path });
  }
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

type Vector = Map<string, number>;

function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [word, x] of a) {
    na += x * x;
    const y = b.get(word);
    if (y !== undefined) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** How many of the most alike routed folders of one skill count toward its score. */
const NEAREST = 3;
/** Weight of the skill's own docs (SKILL.md and recipes) against its nearest folders. */
const DOCS_WEIGHT = 3;

/**
 * The skill an untagged folder most likely belongs to: for each skill, how alike its nearest routed
 * folders read (TF-IDF over names and doc comments), plus how alike the skill's own docs read. Measured
 * leave-one-out against the tagged folders, this picks the tagged skill about 7 times in 10; the tag it
 * writes is reviewed in the diff.
 */
export function guessSkill(
  folder: FolderProfile,
  routed: ReadonlyMap<string, { profile: FolderProfile; skill: string }>,
  skillDocs: ReadonlyMap<string, string[]>,
  all: readonly FolderProfile[],
): string {
  const df = new Map<string, number>();
  for (const profile of all) for (const word of new Set(profile.words)) df.set(word, (df.get(word) ?? 0) + 1);
  const vector = (list: readonly string[]): Vector => {
    const counts = new Map<string, number>();
    for (const word of list) counts.set(word, (counts.get(word) ?? 0) + 1);
    const out: Vector = new Map();
    for (const [word, count] of counts) out.set(word, (1 + Math.log(count)) * Math.log((all.length + 1) / ((df.get(word) ?? 0) + 1)));
    return out;
  };
  const mine = vector(folder.words);
  let best = { skill: "jgengine-gameplay", score: -1 };
  for (const [skill, docs] of [...skillDocs].sort(([a], [b]) => a.localeCompare(b))) {
    const sims = [...routed.values()]
      .filter((entry) => entry.skill === skill && entry.profile.name !== folder.name && entry.profile.words.length > 0)
      .map((entry) => cosine(mine, vector(entry.profile.words)))
      .sort((a, b) => b - a)
      .slice(0, NEAREST);
    const score = sims.reduce((sum, value) => sum + value, 0) + DOCS_WEIGHT * cosine(mine, vector(docs));
    if (score > best.score) best = { skill, score };
  }
  return best.skill;
}

/** The words of each skill's own docs: its SKILL.md and recipes. */
export function readSkillDocs(skillsDir: string, skills: readonly string[]): Map<string, string[]> {
  const docs = new Map<string, string[]>();
  for (const skill of skills) {
    const dir = join(skillsDir, skill);
    const list: string[] = [];
    if (existsSync(join(dir, "SKILL.md"))) list.push(...words(readFileSync(join(dir, "SKILL.md"), "utf8")));
    const recipes = join(dir, "recipes");
    if (existsSync(recipes)) {
      for (const name of readdirSync(recipes)) if (name.endsWith(".md")) list.push(...words(readFileSync(join(recipes, name), "utf8")));
    }
    docs.set(skill, list);
  }
  return docs;
}

/**
 * Route every profile from its tag; return the untagged ones with their guesses. Throws on a folder
 * with two different tags or a tag naming a skill that does not exist.
 */
export function routeProfiles(
  profiles: readonly FolderProfile[],
  known: ReadonlySet<string>,
  skillDocs: ReadonlyMap<string, string[]>,
  root = "",
): { domains: Record<string, string>; guessed: Array<{ profile: FolderProfile; skill: string }> } {
  const routed = new Map<string, { profile: FolderProfile; skill: string }>();
  for (const profile of profiles) {
    const where = profile.taggedIn.map((path) => relative(root, path).replace(/\\/g, "/")).join(", ");
    if (profile.tags.length > 1) throw new Error(`core folder ${profile.name} has more than one @skill tag (${profile.tags.join(", ")} in ${where}); keep one`);
    const skill = profile.tags[0];
    if (skill === undefined) continue;
    if (!known.has(skill)) throw new Error(`${where}: @skill ${skill} is not a skill (known: ${[...known].join(", ")})`);
    routed.set(profile.name, { profile, skill });
  }
  const guessed: Array<{ profile: FolderProfile; skill: string }> = [];
  for (const profile of profiles) {
    if (routed.has(profile.name)) continue;
    guessed.push({ profile, skill: guessSkill(profile, routed, skillDocs, profiles) });
  }
  for (const entry of guessed) routed.set(entry.profile.name, entry);
  const domains = Object.fromEntries([...routed.keys()].sort().map((name) => [name, routed.get(name)!.skill]));
  return { domains, guessed };
}

/**
 * Put `// @skill <skill>` at the top of the folder's tag file: the first line, or the second when the
 * first is a `GENERATED` header, which its generator and its tests expect to stay first.
 */
export function writeTag(path: string, skill: string): void {
  const text = readFileSync(path, "utf8");
  const firstLine = text.slice(0, text.indexOf("\n") + 1);
  const keep = /^\/\/ GENERATED\b/.test(firstLine) ? firstLine : "";
  writeFileSync(path, `${keep}// @skill ${skill}\n${text.slice(keep.length)}`);
}

function main(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const src = join(root, "packages", "core", "src");
  const known = new Set<string>([MAIN, ...SKILL_DIRS]);
  const profiles = readProfiles(src);
  const docs = readSkillDocs(join(root, ".claude", "skills"), [...known].filter((skill) => skill !== MAIN));
  const { domains, guessed } = routeProfiles(profiles, known, docs, root);
  for (const { profile, skill } of guessed) {
    writeTag(profile.tagTarget, skill);
    console.log(`skill-routing: ${profile.name} had no @skill tag; guessed ${skill} and wrote it to ${relative(root, profile.tagTarget).replace(/\\/g, "/")} - change that line if the guess is wrong`);
  }
  writeFileSync(
    join(root, ROUTING_FILE),
    `${JSON.stringify({ generatedBy: "bun run gen skill-routing, from each core folder's // @skill tag", domains }, null, 2)}\n`,
  );
  console.log(`skill-routing OK - ${Object.keys(domains).length} core folders${guessed.length > 0 ? `, ${guessed.length} newly tagged` : ""}`);
}

if (import.meta.main && !printHelpIfAsked("gen-skill-routing", {
  summary: "write scripts/skill-routing.json from each core folder's // @skill tag, tagging a new folder with a guess",
  usage: "bun run gen skill-routing",
  flags: [],
  example: "bun run gen skill-routing",
})) main();
