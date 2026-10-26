import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findCapabilities, loadAllCapabilities, type CapabilityEntry } from "./capabilities";
import { engineRoot, indexCode, listInstalledFiles, listRepoFiles, locateIn, type CodeFile, type IndexedFile } from "./codeMap";
import { queryTokens } from "./words";

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

/** Answer each feature against one set of sources. */
export function answerHas(features: readonly string[], sources: HasSources): HasAnswer[] {
  return features.map((feature) => {
    const { matches, partial } = findCapabilities(sources.capabilities, feature);
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
