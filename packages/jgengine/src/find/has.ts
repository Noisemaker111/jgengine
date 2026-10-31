import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadAllCapabilities, type CapabilityEntry } from "./capabilities";
import { engineRoot, indexCode, listInstalledFiles, listRepoFiles, locateIn, type CodeFile, type IndexedFile } from "./codeMap";
import { queryTokens, rowWords, stem } from "./words";

/**
 * `jgengine has`: many feature questions answered in one call, from the same generated capability
 * index and code map `find` reads, so planning a game is one lookup instead of a search per feature.
 */

/** How much of a feature the engine already ships. */
export type HasVerdict = "covered" | "partial" | "gap";

/** One feature's answer. */
export interface HasAnswer {
  feature: string;
  /** `covered`: a part or a capability whose names carry the words; `partial`: only a folder is named for it; `gap`: nothing scores above the bar. */
  verdict: HasVerdict;
  /** Engine folders named for the feature, core first. */
  folders: string[];
  /** Best shipped capabilities, at most {@link HAS_PER_FEATURE}. */
  capabilities: { skill: string; slug: string; description: string; import: string | null }[];
}

/** Capability rows kept per feature. */
export const HAS_PER_FEATURE = 3;

/** One engine part: its doc line (name and what it covers) and the home it re-exports. */
export interface PartRow {
  line: string;
  home: string;
}

/** What `has` searches: the capability rows, the engine's code and the parts barrel, indexed once. */
export interface HasSources {
  capabilities: readonly CapabilityEntry[];
  code: readonly IndexedFile[];
  /** The doc line and home of each part, read from `parts.ts`. */
  parts?: readonly PartRow[];
}

/** The parts a `parts.ts` barrel names: each doc comment followed by the `export * from` it describes. */
export function parsePartRows(text: string): PartRow[] {
  const rows: PartRow[] = [];
  for (const match of text.matchAll(/\/\*\*\s*([^*]+?)\s*\*\/\s*export\s+\*\s+from\s+"\.\/([^"]+)"/g)) {
    rows.push({ line: match[1]!.replace(/\s+/g, " "), home: match[2]! });
  }
  return rows;
}

/** A capability with the words its code says about it, at two strengths. */
export interface CodeWords {
  /** The capability as indexed. */
  entry: CapabilityEntry;
  /** The capability plus the folder and file name each of its exported symbols is declared in. */
  named: CapabilityEntry;
  /** Every doc comment in the files that declare its symbols, one per entry. */
  docs: IndexedFile["docs"];
}

/**
 * Each capability with the words its code says about it. Names are strong evidence on their own
 * ("state schedule" finds `stateSchedule/`). Doc comments are weak evidence ("bow" of a boat, a terrain
 * "saddle"), used only by {@link matchFeature} to finish a match the names started.
 */
export function withCodeWords(capabilities: readonly CapabilityEntry[], code: readonly IndexedFile[]): CodeWords[] {
  const declared = new Map<string, { file: IndexedFile; words: string }[]>();
  for (const indexed of code) {
    const name = indexed.file.rel.split("/").pop()!.replace(/\.[^.]+$/, "");
    for (const entry of indexed.exports) {
      const words = compoundTails(`${indexed.dir.replaceAll("/", " ")} ${name}`);
      declared.set(entry.name, [...(declared.get(entry.name) ?? []), { file: indexed, words }]);
    }
  }
  return capabilities.map((entry) => {
    const found = entry.symbols.flatMap((symbol) => declared.get(symbol) ?? []);
    if (found.length === 0) return { entry, named: entry, docs: [] };
    const named = { ...entry, description: `${entry.description} ${found.map((hit) => hit.words).join(" ")}` };
    return { entry, named, docs: [...new Set(found.map((hit) => hit.file))].flatMap((file) => file.docs) };
  });
}

/**
 * Folder and file names plus the tails of their compound words, so "schedule" reaches `stateSchedule` and
 * "building" reaches `basebuilding`. Only names get tails: in prose, "rate" would reach "generate".
 */
function compoundTails(names: string): string {
  const tails = [...rowWords(names)].filter((word) => word.length >= 7).flatMap((word) => {
    const cuts: string[] = [];
    for (let at = 3; at <= word.length - 4; at += 1) cuts.push(word.slice(at));
    return cuts;
  });
  return `${names} ${tails.join(" ")}`;
}

/** True when a text's words carry the query word, by whole word (stem equality), never by prefix. */
function carries(words: ReadonlySet<string>, token: string): boolean {
  const target = stem(token);
  for (const word of words) if (word === token || stem(word) === target) return true;
  return false;
}

/** Below this a capability is a stray word, not an answer. */
const BAR = 10;
const NAME_HIT = 10;
const DESCRIPTION_HIT = 2;

/**
 * Score one capability. Names (slug, symbols, the folder and file of its code) carry the weight. A word
 * found only in a description counts only when the description and names together carry every word, so
 * "metal tools" does not reach a row that says "tools" alone. A doc comment in its code can finish a match
 * when a single comment carries every word ("hunger thirst" finds the decay meter whose field doc reads
 * "hunger/thirst"). Some words in a name without the rest is `partial`.
 */
function scoreCapability(words: CodeWords, tokens: readonly string[]): { score: number; complete: boolean; named: boolean } {
  const none = { score: 0, complete: false, named: false };
  if (tokens.length === 0) return none;
  const names = rowWords(`${words.entry.slug} ${words.entry.symbols.join(" ")} ${words.named.description.slice(words.entry.description.length)}`);
  const described = rowWords(words.entry.description);
  const nameHits = tokens.filter((token) => carries(names, token));
  const rest = tokens.filter((token) => !nameHits.includes(token));
  const desc = rest.filter((token) => carries(described, token));
  const documented = words.docs.some((doc) => tokens.every((token) => carries(doc.words, token)));
  const score = nameHits.length * NAME_HIT + desc.length * DESCRIPTION_HIT;
  const named = nameHits.length > 0;
  if (desc.length === rest.length) return { score: Math.max(score, BAR), complete: true, named };
  if (documented && (named || desc.length > 0)) return { score: Math.max(score, BAR), complete: true, named };
  const own = rowWords(`${words.entry.slug} ${words.entry.symbols.join(" ")}`);
  return tokens.some((token) => carries(own, token)) ? { score, complete: false, named } : none;
}

/** Part rows whose doc line carries every word. */
function matchParts(parts: readonly PartRow[], tokens: readonly string[]): PartRow[] {
  return parts.filter((part) => {
    const words = rowWords(part.line);
    return tokens.every((token) => carries(words, token));
  });
}

/** Answer each feature against one set of sources. */
export function answerHas(features: readonly string[], sources: HasSources): HasAnswer[] {
  const searched = withCodeWords(sources.capabilities, sources.code);
  return features.map((feature) => {
    const tokens = queryTokens(feature);
    const parts = tokens.length === 0 ? [] : matchParts(sources.parts ?? [], tokens);
    const scored = searched
      .map((words) => ({ entry: words.entry, ...scoreCapability(words, tokens) }))
      .filter((row) => row.score >= BAR && (parts.length === 0 || row.named));
    const complete = scored.some((row) => row.complete);
    const matches = scored
      .filter((row) => row.complete === complete)
      .sort((a, b) => b.score - a.score || a.entry.skill.localeCompare(b.entry.skill) || a.entry.slug.localeCompare(b.entry.slug))
      .map((row) => row.entry);
    const folders = locateIn(sources.code, tokens).map((home) => home.home);
    const verdict: HasVerdict = parts.length > 0 || (matches.length > 0 && complete) ? "covered" : matches.length > 0 || folders.length > 0 ? "partial" : "gap";
    return {
      feature,
      verdict,
      folders,
      capabilities: [
        ...parts.map((part) => ({ skill: "parts", slug: part.home, description: part.line, import: `@jgengine/core/${part.home}` })),
        ...matches.slice(0, HAS_PER_FEATURE).map((entry) => ({
          skill: entry.skill,
          slug: entry.slug,
          description: entry.description,
          import: entry.imports[0] ?? null,
        })),
      ],
    };
  });
}

/** The capability index and code map of this checkout, or of the installed packages outside one. */
export function loadHasSources(cwd: string = process.cwd()): HasSources {
  const root = engineRoot(cwd);
  const capabilities = loadAllCapabilities(root);
  if (root !== null) {
    const parts = readParts(join(root, "packages", "core", "src", "parts.ts"));
    return { capabilities, parts, code: indexCode(listRepoFiles(root), (file: CodeFile) => readFileSync(join(root, file.path), "utf8")) };
  }
  const installed = listInstalledFiles(cwd);
  if (installed === null) return { capabilities, code: [] };
  const parts = installed.files.filter((file) => /(^|\/)parts\.(ts|d\.ts)$/.test(file.path) && file.layer === "core").flatMap((file) => readParts(join(installed.root, file.path)));
  return { capabilities, parts, code: indexCode(installed.files, (file: CodeFile) => readFileSync(join(installed.root, file.path), "utf8")) };
}

function readParts(path: string): PartRow[] {
  try {
    return parsePartRows(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

const HELP = [
  'jgengine has <feature> [<feature> ...]   does the engine already ship these? one JSON answer for all',
  "",
  'example: jgengine has torpor riding "snap building" weather',
  "",
  "Quote a feature of several words. Each answer: verdict (covered | partial | gap), the engine folders",
  "named for it and the best shipped capabilities with their import. Same index as `jgengine find`.",
].join("\n");

/** `jgengine has` command entry. */
export function runHas(argv: readonly string[]): number {
  const features = argv.filter((arg) => !arg.startsWith("-")).map((arg) => arg.trim()).filter((arg) => arg !== "");
  if (features.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return features.length === 0 && !argv.includes("--help") && !argv.includes("-h") ? 1 : 0;
  }
  console.log(JSON.stringify(answerHas(features, loadHasSources()), null, 2));
  return 0;
}
