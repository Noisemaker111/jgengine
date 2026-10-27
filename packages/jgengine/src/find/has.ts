import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findCapabilities, loadAllCapabilities, type CapabilityEntry } from "./capabilities";
import { engineRoot, indexCode, listInstalledFiles, listRepoFiles, locateIn, type CodeFile, type IndexedFile } from "./codeMap";
import { queryTokens, rowWords, tokenHits } from "./words";

/**
 * `jgengine has`: many feature questions answered in one call, from the same generated capability
 * index and code map `find` reads, so planning a game is one lookup instead of a search per feature.
 */

/** How much of a feature the engine already ships. */
export type HasVerdict = "covered" | "partial" | "gap";

/** One feature's answer. */
export interface HasAnswer {
  feature: string;
  /** `covered`: a shipped capability carries every word; `partial`: only some words, or only a folder; `gap`: nothing. */
  verdict: HasVerdict;
  /** Engine folders named for the feature, core first. */
  folders: string[];
  /** Best shipped capabilities, at most {@link HAS_PER_FEATURE}. */
  capabilities: { skill: string; slug: string; description: string; import: string | null }[];
}

/** Capability rows kept per feature. */
export const HAS_PER_FEATURE = 3;

/** What `has` searches: the capability rows and the engine's code, indexed once. */
export interface HasSources {
  capabilities: readonly CapabilityEntry[];
  code: readonly IndexedFile[];
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
 * ("supply drops" finds `airdrops/`). Doc comments are weak evidence ("bow" of a boat, a terrain
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
 * Folder and file names plus the tails of their compound words, so "drops" reaches `airdrops/` and
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

/** True when a text's words carry the query word. */
function carries(text: { words: ReadonlySet<string>; raw: string }, token: string): boolean {
  return tokenHits(token, text.words, text.raw);
}

/**
 * The capabilities answering one feature, best first, and whether they carry only some of its words.
 * A capability whose names carry every word covers it. Failing that, one whose names carry some word
 * covers it when a single doc comment in its code carries every word: "hunger thirst" finds the decay
 * meter whose field doc reads "hunger/thirst", while a stray "fly" elsewhere in a mount's file does not
 * make it "flying mounts".
 */
function matchFeature(searched: readonly CodeWords[], feature: string): { matches: CapabilityEntry[]; partial: boolean } {
  const byName = findCapabilities(searched.map((words) => words.named), feature);
  if (byName.matches.length > 0 && !byName.partial) return byName;
  const tokens = queryTokens(feature);
  const byDocs = searched.filter((words) => {
    const raw = `${words.named.slug} ${words.named.symbols.join(" ")} ${words.named.description}`;
    const named = { words: rowWords(raw), raw: raw.toLowerCase() };
    return tokens.some((token) => carries(named, token)) && words.docs.some((doc) => tokens.every((token) => carries(doc, token)));
  });
  if (byDocs.length > 0) return { matches: byDocs.map((words) => words.named), partial: false };
  return byName;
}

/** Answer each feature against one set of sources. */
export function answerHas(features: readonly string[], sources: HasSources): HasAnswer[] {
  const searched = withCodeWords(sources.capabilities, sources.code);
  const original = new Map(searched.map((words) => [words.named, words.entry]));
  return features.map((feature) => {
    const found = matchFeature(searched, feature);
    const matches = found.matches.map((entry) => original.get(entry)!);
    const { partial } = found;
    const folders = locateIn(sources.code, queryTokens(feature)).map((home) => home.home);
    const verdict: HasVerdict = matches.length > 0 && !partial ? "covered" : matches.length > 0 || folders.length > 0 ? "partial" : "gap";
    return {
      feature,
      verdict,
      folders,
      capabilities: matches.slice(0, HAS_PER_FEATURE).map((entry) => ({
        skill: entry.skill,
        slug: entry.slug,
        description: entry.description,
        import: entry.imports[0] ?? null,
      })),
    };
  });
}

/** The capability index and code map of this checkout, or of the installed packages outside one. */
export function loadHasSources(cwd: string = process.cwd()): HasSources {
  const root = engineRoot(cwd);
  const capabilities = loadAllCapabilities(root);
  if (root !== null) {
    return { capabilities, code: indexCode(listRepoFiles(root), (file: CodeFile) => readFileSync(join(root, file.path), "utf8")) };
  }
  const installed = listInstalledFiles(cwd);
  if (installed === null) return { capabilities, code: [] };
  return { capabilities, code: indexCode(installed.files, (file: CodeFile) => readFileSync(join(installed.root, file.path), "utf8")) };
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
