import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findUp } from "./pkg";
import { RECIPES } from "./recipes";

/**
 * `jgengine find <intent>` — active discovery over the capability indexes that ship inside this CLI's
 * own tarball (`skills/<domain>/capabilities.md`, staged for every domain). An agent mid-build that is
 * about to hand-roll a bag, a window manager, a paperdoll, or a walk-cycle types one line and gets the
 * shipped drop-in and its import back, without loading a skill or opening a doc. The whole point: the
 * engine already ships more than a builder discovers on its own, so make "what's already there for X?"
 * a command, not a decision to go read something.
 */

/** One capability row parsed from a `capabilities.md` — a need mapped to the primitive that already does it. */
export interface CapabilityEntry {
  /** Owning skill/domain, e.g. `jgengine-ui`. */
  skill: string;
  /** The `## <slug>` capability id, e.g. `panel-host`. */
  slug: string;
  /** The one-line "what you need" description after the slug. */
  description: string;
  /** Import statements that provide the primitive (one per exported symbol). */
  imports: string[];
  /** Exported symbol names for the primitive. */
  symbols: string[];
}

/**
 * Parse one domain's `capabilities.md` into rows. The generated format is a `## slug — description`
 * heading followed by `` - `Symbol` (kind) · `import { Symbol } from "@jgengine/pkg"` `` bullets. The
 * slug ends at the FIRST ` — `; the description (which may itself contain ` — `) is the remainder.
 */
export function parseCapabilities(markdown: string, skill: string): CapabilityEntry[] {
  const entries: CapabilityEntry[] = [];
  // Everything before the first "## " is the H1 + generated-comment preamble.
  const blocks = markdown.split(/\n## /).slice(1);
  for (const block of blocks) {
    const newline = block.indexOf("\n");
    const heading = (newline === -1 ? block : block.slice(0, newline)).trim();
    const dash = heading.indexOf(" — ");
    if (dash === -1) continue;
    const slug = heading.slice(0, dash).trim();
    const description = heading.slice(dash + 3).trim();
    const imports: string[] = [];
    const symbols: string[] = [];
    const body = newline === -1 ? "" : block.slice(newline + 1);
    for (const line of body.split("\n")) {
      if (!line.startsWith("- ")) continue;
      const ticks = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
      if (ticks.length === 0) continue;
      symbols.push(ticks[0]!);
      const importTick = ticks.find((tick) => tick.startsWith("import "));
      if (importTick !== undefined) imports.push(importTick);
    }
    entries.push({ skill, slug, description, imports, symbols });
  }
  return entries;
}

const STOPWORDS = new Set(["a", "an", "the", "to", "for", "of", "with", "and", "or", "in", "on", "my", "i", "want"]);

/** @internal Strip a plural/gerund/past suffix so "targeting", "targets" and "target" compare equal. */
function stem(word: string): string {
  for (const suffix of ["ing", "es", "ed", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
  }
  return word;
}

/** @internal Every word in a row: raw alphanumeric runs plus their camelCase parts, lowercased. */
function rowWords(text: string): Set<string> {
  const words = new Set<string>();
  for (const run of text.split(/[^A-Za-z0-9]+/)) {
    if (run === "") continue;
    words.add(run.toLowerCase());
    for (const part of run.split(/(?<=[a-z0-9])(?=[A-Z])/)) words.add(part.toLowerCase());
  }
  return words;
}

/**
 * @internal A query token hits a word when their stems match, or when a 4+ letter stem prefixes the
 * word. Whole-word matching keeps "aim" off "claim" and "car" off "carry"; a token with punctuation
 * (an import path) falls back to substring.
 */
function tokenHits(token: string, words: ReadonlySet<string>, raw: string): boolean {
  if (/[^a-z0-9]/.test(token)) return raw.includes(token);
  const target = stem(token);
  for (const word of words) {
    if (word === token || stem(word) === target) return true;
    if (target.length >= 4 && word.startsWith(target)) return true;
  }
  return false;
}

interface IndexedRow {
  entry: CapabilityEntry;
  raw: string;
  words: Set<string>;
  nameWords: Set<string>;
}

function indexRow(entry: CapabilityEntry): IndexedRow {
  const name = `${entry.slug} ${entry.symbols.join(" ")}`;
  const raw = `${name} ${entry.description} ${entry.imports.join(" ")}`;
  return { entry, raw: raw.toLowerCase(), words: rowWords(raw), nameWords: rowWords(name) };
}

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== "" && !STOPWORDS.has(token));
}

/** Result of a `find` search: `partial` is true when no row carried every token and the best partial hits were returned. */
export interface FindResult {
  matches: CapabilityEntry[];
  partial: boolean;
}

/**
 * Rank capability rows against a free-text intent. Tokens match whole words (stemmed, camelCase-split),
 * stopwords are dropped, and a multi-word query also tries its words joined ("pick up" → "pickup").
 * Rows carrying every token come first, name/slug hits ranked above description mentions. When no row
 * carries every token, the rows that carry the most tokens are returned with `partial: true`.
 */
export function findCapabilities(entries: readonly CapabilityEntry[], query: string): FindResult {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return { matches: [], partial: false };
  const joined = tokens.length > 1 ? tokens.join("") : null;
  const scored: { entry: CapabilityEntry; hits: number; score: number }[] = [];
  for (const entry of entries) {
    const row = indexRow(entry);
    const hitTokens = tokens.filter((token) => tokenHits(token, row.words, row.raw));
    const joinedHit = joined !== null && tokenHits(joined, row.words, row.raw);
    const hits = joinedHit ? tokens.length : hitTokens.length;
    if (hits === 0) continue;
    const nameHits = joinedHit && tokenHits(joined, row.nameWords, row.raw)
      ? tokens.length
      : hitTokens.filter((token) => tokenHits(token, row.nameWords, row.raw)).length;
    scored.push({ entry, hits, score: nameHits });
  }
  const full = scored.filter((row) => row.hits === tokens.length);
  const partial = full.length === 0 && tokens.length > 1;
  const best = partial ? Math.max(0, ...scored.map((row) => row.hits)) : tokens.length;
  const kept = partial ? scored.filter((row) => row.hits === best) : full;
  kept.sort(
    (a, b) =>
      b.score - a.score ||
      a.entry.skill.localeCompare(b.entry.skill) ||
      a.entry.slug.localeCompare(b.entry.slug),
  );
  return { matches: kept.map((row) => row.entry), partial: partial && kept.length > 0 };
}

/** Rows that carry every query token, best first — `findCapabilities` without the partial fallback. */
export function searchCapabilities(entries: readonly CapabilityEntry[], query: string): CapabilityEntry[] {
  const result = findCapabilities(entries, query);
  return result.partial ? [] : result.matches;
}

const MAX_RESULTS = 40;

/** Render matches as grouped `[skill] slug — description` blocks with the import line(s) beneath. */
export function renderFindResults(matches: readonly CapabilityEntry[], query: string, partial = false): string {
  if (matches.length === 0) {
    return [
      `jgengine find "${query}" — no shipped capability matched.`,
      "",
      "Try a broader term (an intent, not a symbol): windows, inventory, minimap, damage, camera, save.",
      "Browse everything: npx jgengine skills --all  (installs the full domain capability indexes).",
    ].join("\n");
  }
  const shown = matches.slice(0, MAX_RESULTS);
  const lines: string[] = [
    partial
      ? `jgengine find "${query}" — nothing matched every word; ${matches.length} closest ${matches.length === 1 ? "capability matches" : "capabilities match"} some of them:`
      : `jgengine find "${query}" — ${matches.length} shipped ${matches.length === 1 ? "capability" : "capabilities"} match${matches.length === 1 ? "es" : ""} (reach for these before hand-rolling):`,
    "",
  ];
  for (const entry of shown) {
    lines.push(`[${entry.skill}] ${entry.slug} — ${entry.description}`);
    for (const imp of entry.imports.length > 0 ? entry.imports : ["(see the skill for the import)"]) {
      lines.push(`  ${imp}`);
    }
    lines.push("");
  }
  if (matches.length > shown.length) {
    lines.push(`… ${matches.length - shown.length} more — narrow the intent to see them.`);
    lines.push("");
  }
  lines.push("Signatures: node_modules/@jgengine/<pkg>/dist/*.d.ts · wired examples: npx jgengine recipe");
  return lines.join("\n");
}

/**
 * Locate the staged `skills/` directory that ships inside this CLI's tarball. In a published consumer
 * that is `node_modules/jgengine/skills`; in the monorepo it is `packages/jgengine/skills` (populated by
 * `bun run stage-skills`). Resolves by walking up from this module to the `jgengine` package root.
 */
export function resolveSkillsDir(fromDir: string = dirname(fileURLToPath(import.meta.url))): string | null {
  const packageRoot = findUp(fromDir, (dir) => existsSync(join(dir, "skills")) && existsSync(join(dir, "package.json")));
  if (packageRoot === null) return null;
  const skills = join(packageRoot, "skills");
  return existsSync(skills) ? skills : null;
}

/** Read and parse every `<skillsDir>/<domain>/capabilities.md` into a flat capability index. */
export function loadCapabilityIndex(skillsDir: string): CapabilityEntry[] {
  const entries: CapabilityEntry[] = [];
  let domains: string[];
  try {
    domains = readdirSync(skillsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch {
    return entries;
  }
  for (const domain of domains) {
    const file = join(skillsDir, domain, "capabilities.md");
    if (!existsSync(file)) continue;
    entries.push(...parseCapabilities(readFileSync(file, "utf8"), domain));
  }
  return entries;
}

/** CLI recipes (`npx jgengine recipe <name>`) as searchable rows. */
export function recipeCapabilities(): CapabilityEntry[] {
  return RECIPES.map((recipe) => ({
    skill: "recipe",
    slug: recipe.name,
    description: recipe.description,
    imports: [`npx jgengine recipe ${recipe.name}`],
    symbols: [],
  }));
}

/**
 * Skill recipe documents (`<skillsDir>/<domain>/recipes/*.md`) as searchable rows: the H1 (minus a
 * leading "Recipe —") plus the "What this wires" line, pointing at the installed path.
 */
export function loadSkillRecipes(skillsDir: string): CapabilityEntry[] {
  const entries: CapabilityEntry[] = [];
  let domains: string[];
  try {
    domains = readdirSync(skillsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch {
    return entries;
  }
  for (const domain of domains) {
    const dir = join(skillsDir, domain, "recipes");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".md")).sort()) {
      const text = readFileSync(join(dir, file), "utf8");
      const title = /^#\s+(.+)$/m.exec(text)?.[1]?.replace(/^Recipe\s*[—-]\s*/i, "").trim() ?? file;
      const wires = /\*\*What this wires:\*\*\s*(.+)$/m.exec(text)?.[1]?.trim();
      entries.push({
        skill: domain,
        slug: `recipe/${file.replace(/\.md$/, "")}`,
        description: wires === undefined ? title : `${title} — ${wires}`,
        imports: [`read .claude/skills/${domain}/recipes/${file}`],
        symbols: [],
      });
    }
  }
  return entries;
}

/** `jgengine find <intent>` command entry. */
export function runFind(argv: string[]): number {
  const query = argv.filter((arg) => !arg.startsWith("-")).join(" ").trim();
  if (query === "" || argv.includes("-h") || argv.includes("--help")) {
    console.log(
      [
        "jgengine find <intent> — search what the engine already ships, by intent.",
        "",
        'examples: npx jgengine find "toggleable window"',
        '          npx jgengine find inventory',
        '          npx jgengine find "character sheet paperdoll"',
        "",
        "Prints the drop-in primitive and its import so you don't hand-roll one that exists.",
      ].join("\n"),
    );
    return query === "" && !argv.includes("-h") && !argv.includes("--help") ? 1 : 0;
  }
  const skillsDir = resolveSkillsDir();
  if (skillsDir === null) {
    console.error(
      "jgengine find: could not locate the staged capability indexes (skills/ inside the jgengine package).\n" +
        "Reinstall the CLI, or browse with: npx jgengine skills --all",
    );
    return 1;
  }
  const index = [...loadCapabilityIndex(skillsDir), ...loadSkillRecipes(skillsDir), ...recipeCapabilities()];
  const { matches, partial } = findCapabilities(index, query);
  console.log(renderFindResults(matches, query, partial));
  return 0;
}
