import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  findCapabilities,
  loadCapabilityIndex,
  loadSkillRecipes,
  MAX_RESULTS,
  recipeCapabilities,
  renderFindResults,
  resolveSkillsDir,
  type CapabilityEntry,
} from "./capabilities";
import { engineRoot, listInstalledFiles, listRepoFiles, locate, renderLocations, type CodeFile, type LayerHome } from "./codeMap";
import { parseTextSearchArgs, searchText } from "./textSearch";
import { queryTokens } from "./words";

const MAX_LIMIT = 100;
/** Any of these makes `find` a plain content search. */
const TEXT_FLAGS = new Set(["--text", "--in", "--kind", "--glob", "--files"]);
/** Capability rows shown under a code answer unless `--limit` asks for more. */
const CAPABILITIES_BESIDE_CODE = 8;

const HELP = [
  "jgengine find <words> [--json] [--limit N]   where a concept lives, and what already ships for it",
  "jgengine find --text <regex> [--in <dir>] [--kind ts,tsx] [--glob <glob>] [--files] [--limit N]",
  "",
  "examples: jgengine find hud",
  '          jgengine find "camera shake"',
  '          jgengine find "toggleable window" --json --limit 5',
  "          jgengine find --text useCameraShake --kind ts,tsx",
  "",
  "Words: the home folder in each layer (core = model, shell = draw, react = view, editor = author)",
  "with its files and exports, pieces found outside the home, the shipped capabilities and imports,",
  "and matching assets. Read from the code itself: folder names, exports and doc comments.",
  `--limit N: capability rows to show, 1-${MAX_LIMIT} (default ${MAX_RESULTS}).`,
  "--json: one document with layers, capabilities and assets.",
  "--text (or any of --in, --kind, --glob, --files): a plain ripgrep content search; exit 0 match, 1 none, 2 bad input.",
  "--: treat remaining arguments as words.",
].join("\n");

interface AssetLine {
  kind: string;
  line: string;
  score: number;
}

async function assetMatches(query: string): Promise<AssetLine[]> {
  try {
    const { describeAssetMatch, rankAssets } = await import("@jgengine/assets");
    return rankAssets(query, { limit: 4 })
      .filter((entry) => entry.score >= 45)
      .map((entry) => ({ kind: entry.match.kind, line: describeAssetMatch(entry.match), score: entry.score }));
  } catch {
    return [];
  }
}

function codeLocations(tokens: readonly string[]): { homes: LayerHome[]; source: "checkout" | "installed" | "none" } {
  const root = engineRoot(process.cwd());
  if (root !== null) {
    const files = listRepoFiles(root);
    return { homes: locate(files, (file: CodeFile) => readFileSync(join(root, file.path), "utf8"), tokens), source: "checkout" };
  }
  const installed = listInstalledFiles(process.cwd());
  if (installed === null) return { homes: [], source: "none" };
  return {
    homes: locate(installed.files, (file: CodeFile) => readFileSync(join(installed.root, file.path), "utf8"), tokens),
    source: "installed",
  };
}

function runText(argv: readonly string[]): number {
  try {
    const options = parseTextSearchArgs(argv.filter((arg) => arg !== "--text"));
    const result = searchText(options);
    if (!result.usedRipgrep) console.error("jgengine find: ripgrep not found; read the tree in this process instead (slower, and .gitignore is not applied)");
    if (result.lines.length === 0) {
      console.error(`jgengine find: no match for ${options.pattern ?? options.glob?.join(" ") ?? "--files"}`);
      return 1;
    }
    for (const line of result.lines) console.log(line);
    return 0;
  } catch (error) {
    console.error(`jgengine find: ${(error as Error).message}`);
    return 2;
  }
}

/** `jgengine find` command entry. */
export async function runFind(argv: string[]): Promise<number> {
  if (argv.some((arg) => TEXT_FLAGS.has(arg)) && !argv.includes("--help") && !argv.includes("-h")) return runText(argv);
  const words: string[] = [];
  let json = false;
  let help = false;
  let limit = MAX_RESULTS;
  let limitSeen = false;
  let positional = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (positional || !arg.startsWith("-")) {
      words.push(arg);
    } else if (arg === "--") {
      positional = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--json" && !json) {
      json = true;
    } else if (arg === "--limit" || arg.startsWith("--limit=")) {
      const value = arg === "--limit" ? argv[++i] : arg.slice("--limit=".length);
      if (limitSeen || value === undefined || !/^[1-9]\d*$/.test(value) || Number(value) > MAX_LIMIT) {
        console.error(`jgengine find: --limit must appear once with an integer from 1 to ${MAX_LIMIT}.`);
        return 1;
      }
      limit = Number(value);
      limitSeen = true;
    } else {
      console.error(`jgengine find: unknown or repeated option "${arg}".`);
      return 1;
    }
  }
  const query = words.join(" ").trim();
  if (query === "" || help) {
    console.log(HELP);
    return query === "" && !help ? 1 : 0;
  }
  const tokens = queryTokens(query);
  const { homes, source } = codeLocations(tokens);
  const checkout = engineRoot(process.cwd());
  const repoSkills = checkout === null ? null : join(checkout, ".claude", "skills");
  const skillsDir = resolveSkillsDir() ?? (repoSkills !== null && existsSync(repoSkills) ? repoSkills : null);
  const index: CapabilityEntry[] = skillsDir === null ? [] : [...loadCapabilityIndex(skillsDir), ...loadSkillRecipes(skillsDir), ...recipeCapabilities()];
  const { matches, partial } = findCapabilities(index, query);
  const assets = await assetMatches(query);
  if (json) {
    console.log(JSON.stringify({ query, source, layers: homes, capabilities: { total: matches.length, partial, truncated: matches.length > limit, matches: matches.slice(0, limit) }, assets }));
    return 0;
  }
  const out: string[] = [];
  if (homes.length > 0) {
    out.push(`jgengine find "${query}" — where it lives (${source === "installed" ? "installed @jgengine packages" : "this checkout"}):`, "");
    out.push(...renderLocations(homes), "");
  } else if (source !== "none") {
    out.push(`jgengine find "${query}" — no folder, file or export in the engine source names these words.`, "");
  }
  const shownCapabilities = limitSeen || homes.length === 0 ? limit : CAPABILITIES_BESIDE_CODE;
  if (matches.length > 0 || homes.length === 0) out.push(renderFindResults(matches, query, partial, shownCapabilities), "");
  if (assets.length > 0) {
    out.push("Assets (pull with `jgengine assets add <id>`):");
    for (const asset of assets) out.push(`  ${asset.line}`);
  }
  console.log(out.join("\n").trimEnd());
  return 0;
}
