// How far the engine has moved onto its parts (AGENTS.md "Build from the parts"): for each part home,
// how many non-test source files in packages/core/src and in games/*/src import it; the number of
// `export function create` in core; and the number of core top-level folders.
//
//   bun run part-stats               the table (also printed by `bun run gen`)
//   bun run part-stats --worklist    the private copies of parts that remain, by pattern, with file:line
//
// A report, not a gate: exit 0 always.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked, type Usage } from "./script-help";

const USAGE: Usage = {
  summary: "Show how many files import each part home, the core create* count and the core folder count.",
  usage: "bun run part-stats [--worklist]",
  flags: [{ flag: "--worklist", detail: "list the private copies of parts that remain, by pattern, with file:line" }],
  example: "bun run part-stats --worklist",
};

const CORE_SRC = "packages/core/src/";
const CORE_PACKAGE = "@jgengine/core/";

/** Part homes, relative to `packages/core/src`, without the extension. */
export const PART_HOMES: readonly string[] = [
  "stats/statPool",
  "threshold/thresholds",
  "time/stateSchedule",
  "time/pacedSchedule",
  "time/refillSlots",
  "time/cooldown",
  "world/spatialSample",
  "game/spawnPoints",
  "random/pick",
  "rules/predicate",
  "progression/statGraph",
  "inheritance/inheritance",
  "movement/motionTrack",
];

/** A repository file the counts read: its path from the repo root and its text. */
export interface Source {
  path: string;
  text: string;
}

export type Layer = "core" | "game";

const COUNTED = /\.tsx?$/;
const NOT_COUNTED = /\.(test|spec)\.tsx?$|\.d\.ts$/;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["']([^"'\n]+)["']/gm;
const CREATE = /\bexport function create/g;

/** Which count a source file belongs to, or null when it is neither core source nor game source. */
export function layerOf(path: string): Layer | null {
  if (!COUNTED.test(path) || NOT_COUNTED.test(path)) return null;
  if (path.startsWith(CORE_SRC)) return "core";
  if (/^games\/[^/]+\/src\//.test(path)) return "game";
  return null;
}

/** The part home a module specifier reaches from `from`, or null when it reaches none. */
export function homeOf(specifier: string, from: string): string | null {
  let target: string;
  if (specifier.startsWith(".")) target = posix.normalize(posix.join(posix.dirname(from), specifier));
  else if (specifier.startsWith(CORE_PACKAGE)) target = CORE_SRC + specifier.slice(CORE_PACKAGE.length);
  else return null;
  if (!target.startsWith(CORE_SRC)) return null;
  return target.slice(CORE_SRC.length).replace(/\.tsx?$/, "");
}

/** Every part home a source file imports, each once. */
export function importedHomes(source: Source): Set<string> {
  const homes = new Set<string>();
  for (const match of source.text.matchAll(SPECIFIER)) {
    const home = homeOf(match[1] ?? "", source.path);
    if (home !== null) homes.add(home);
  }
  return homes;
}

export interface PartCount {
  home: string;
  core: number;
  games: number;
}

export function countImporters(sources: readonly Source[]): PartCount[] {
  const counts = new Map<string, { core: number; games: number }>(PART_HOMES.map((home) => [home, { core: 0, games: 0 }]));
  for (const source of sources) {
    const layer = layerOf(source.path);
    if (layer === null) continue;
    for (const home of importedHomes(source)) {
      const row = counts.get(home);
      if (row === undefined) continue;
      if (layer === "core") row.core += 1;
      else row.games += 1;
    }
  }
  return PART_HOMES.map((home) => ({ home, core: counts.get(home)?.core ?? 0, games: counts.get(home)?.games ?? 0 }));
}

/** How many `export function create` core source holds. */
export function countCreates(sources: readonly Source[]): number {
  let total = 0;
  for (const source of sources) {
    if (layerOf(source.path) !== "core") continue;
    total += [...source.text.matchAll(CREATE)].length;
  }
  return total;
}

/** The top-level folders of core source: each folder a feature can own. */
export function coreFolders(sources: readonly Source[]): string[] {
  const folders = new Set<string>();
  for (const source of sources) {
    if (layerOf(source.path) !== "core") continue;
    const rest = source.path.slice(CORE_SRC.length);
    const slash = rest.indexOf("/");
    if (slash > 0) folders.add(rest.slice(0, slash));
  }
  return [...folders].sort();
}

export function renderTable(counts: readonly PartCount[], creates: number, folders: number): string {
  const width = Math.max(...counts.map((row) => row.home.length), "part home".length) + 2;
  const lines = [`${"part home".padEnd(width)}${"core".padStart(6)}${"games".padStart(7)}`];
  for (const row of counts) lines.push(`${row.home.padEnd(width)}${String(row.core).padStart(6)}${String(row.games).padStart(7)}`);
  lines.push("", `export function create* in core: ${creates}`, `core top-level folders: ${folders}`);
  return lines.join("\n");
}

/** Repository paths `git` knows about (tracked, or untracked and not ignored) that the counts read. */
export function trackedSourcePaths(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "--", "packages/core/src", "games"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ls-files: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => layerOf(line) !== null);
}

export function readSources(root: string, paths: readonly string[]): Source[] {
  return paths.filter((path) => layerOf(path) !== null).map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));
}

export function main(argv: readonly string[], root = repoRoot()): number {
  if (printHelpIfAsked("part-stats", USAGE, argv)) return 0;
  const sources = readSources(root, trackedSourcePaths(root));
  console.log(renderTable(countImporters(sources), countCreates(sources), coreFolders(sources).length));
  return 0;
}

function repoRoot(): string {
  return fileURLToPath(new URL("..", import.meta.url));
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
