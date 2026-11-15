import { readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";

import { exportedNames, importRefs, nearestPackageDir, resolveRelative, walkFiles } from "./source";
import { engineRepoRoot, resolveEngineModule, splitEngineSpecifier, type ProposalRules } from "./engine";
import { readProposalLiteral } from "./literal";

/**
 * Find and judge every engine proposal under a root: each `<feature>.engine.ts` file's metadata,
 * whether it can be lifted into the engine as-is, whether the engine has caught up with it, and the
 * game files still importing it.
 */

/** A proposal entry file. */
export const PROPOSAL_FILE = /\.engine\.tsx?$/;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/** What the metadata says, once it parsed and passed the rules. */
export interface ProposalMetadata {
  id: string;
  target: string;
  need: string;
  kind: "new" | "extend" | "fork";
  fork?: string;
  exports: string[];
}

/**
 * - `local`: none of `exports` resolves at `target` yet.
 * - `partial`: some do.
 * - `upstream`: every name in `exports` resolves at `target`: the engine has it, the game should switch.
 * - `unknown`: the metadata is too broken to tell.
 */
export type ProposalStatus = "local" | "partial" | "upstream" | "unknown";

export interface ProposalReport {
  /** Absolute path of the `.engine.ts` entry file. */
  file: string;
  /** `file` relative to the scan root, with `/` separators. */
  path: string;
  /** The game carrying it: the nearest folder with a package.json, relative to the scan root (`.` for the root). */
  game: string;
  /** The parsed metadata as written (null when it could not be read). */
  raw: unknown;
  /** The metadata when it passed every rule. */
  metadata: ProposalMetadata | null;
  status: ProposalStatus;
  /** The module file `target` resolves to now, when it exists. */
  targetFile: string | null;
  /** Names of `exports` found at `target`, and the ones still missing. */
  upstreamExports: string[];
  missingExports: string[];
  /** Everything wrong with this proposal on its own, one sentence each. */
  errors: string[];
  /** The proposal's files: the entry, then the files of its folder it reaches. Absolute. */
  files: string[];
  /** Files of the game outside the proposal that import its entry. Absolute. */
  importers: string[];
}

export interface ProposalScan {
  root: string;
  proposals: ProposalReport[];
  /** Problems across proposals: an id carried twice. */
  errors: string[];
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

/**
 * The folder a proposal owns: `cave/cave.engine.ts` (and `cave/cave.draw.engine.ts`) own `cave/`,
 * so a proposal too big for one file keeps its parts beside it. Any other entry owns only itself.
 */
export function ownedFolder(entry: string): string | null {
  const stem = basename(entry).replace(PROPOSAL_FILE, "");
  const first = stem.split(".")[0];
  return first !== undefined && first === basename(dirname(entry)) ? dirname(entry) : null;
}

function inside(file: string, dir: string): boolean {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel);
}

const GAME_ALIAS = /^(?:#|@\/|~\/)/;
const PRIVATE_SUBPATH = /(?:^|\/)(?:src|dist|node_modules)(?:\/|$)/;

/** Walk a proposal's imports from its entry: its own files, and every import that would not lift into the engine. */
export function walkProposal(entry: string, root: string): { files: string[]; errors: string[] } {
  const folder = ownedFolder(entry);
  const files: string[] = [];
  const errors: string[] = [];
  const queue = [entry];
  const seen = new Set<string>(queue);
  const shown = (file: string): string => posix(relative(root, file));
  while (queue.length > 0) {
    const file = queue.shift()!;
    files.push(file);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      errors.push(`${shown(file)} cannot be read`);
      continue;
    }
    for (const { specifier } of importRefs(text)) {
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const target = resolveRelative(file, specifier);
        if (target === null) {
          errors.push(`${shown(file)} imports "${specifier}", which does not resolve`);
        } else if (PROPOSAL_FILE.test(target)) {
          // another proposal: lifts with it
        } else if (folder !== null && inside(target, folder)) {
          if (!seen.has(target)) {
            seen.add(target);
            queue.push(target);
          }
        } else {
          errors.push(
            `${shown(file)} imports "${specifier}" (${shown(target)}), a game file: a proposal lifts into the engine as-is, so it imports only public @jgengine paths, other *.engine.ts files and packages`,
          );
        }
        continue;
      }
      const engine = splitEngineSpecifier(specifier);
      if (engine !== null) {
        if (PRIVATE_SUBPATH.test(engine.subpath)) {
          errors.push(`${shown(file)} imports "${specifier}", a file inside the package: import its public path instead`);
          continue;
        }
        const resolved = resolveEngineModule(specifier, dirname(file));
        if (resolved.packageDir === null) errors.push(`${shown(file)} imports "${specifier}", but @jgengine/${engine.pkg} is not installed`);
        else if (resolved.file === null) errors.push(`${shown(file)} imports "${specifier}", which @jgengine/${engine.pkg} does not export`);
        continue;
      }
      if (GAME_ALIAS.test(specifier)) {
        errors.push(`${shown(file)} imports "${specifier}", a game path alias: a proposal lifts into the engine as-is, so it cannot reach the game's own files`);
      }
    }
  }
  return { files, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every string field of the metadata still holding a TODO left by `--migrate` or a draft. */
function todoFields(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  return Object.entries(raw)
    .filter(([, value]) => (typeof value === "string" ? /\bTODO\b/.test(value) : Array.isArray(value) && value.some((item) => typeof item === "string" && /\bTODO\b/.test(item))))
    .map(([key]) => key);
}

/** Which of `exports` the engine has at `target` now. */
export function upstreamState(target: unknown, exports: unknown, fromDir: string): Pick<ProposalReport, "status" | "targetFile" | "upstreamExports" | "missingExports"> {
  if (typeof target !== "string" || !Array.isArray(exports) || exports.some((name) => typeof name !== "string") || exports.length === 0) {
    return { status: "unknown", targetFile: null, upstreamExports: [], missingExports: [] };
  }
  const names = exports as string[];
  const targetFile = resolveEngineModule(target, fromDir).file;
  const present = targetFile === null ? new Set<string>() : exportedNames(targetFile);
  const upstreamExports = names.filter((name) => present.has(name));
  const missingExports = names.filter((name) => !present.has(name));
  const status: ProposalStatus = missingExports.length === 0 ? "upstream" : upstreamExports.length > 0 ? "partial" : "local";
  return { status, targetFile, upstreamExports, missingExports };
}

/** Relative imports of every source file in `dir`, resolved, read once per game. */
function importIndex(dir: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const file of walkFiles(dir, SOURCE_FILE)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const targets: string[] = [];
    for (const { specifier } of importRefs(text)) {
      if (!specifier.startsWith(".")) continue;
      const target = resolveRelative(file, specifier);
      if (target !== null) targets.push(target);
    }
    index.set(file, targets);
  }
  return index;
}

/** Judge one proposal entry file. */
export function analyzeProposal(file: string, root: string, rules: ProposalRules, gameImports: Map<string, string[]>, gameDir: string): ProposalReport {
  const path = posix(relative(root, file));
  const game = posix(relative(root, gameDir)) || ".";
  const errors: string[] = [];
  const literal = readProposalLiteral(readFileSync(file, "utf8"));
  const raw = literal.ok ? literal.value : null;
  if (!literal.ok) errors.push(literal.error);
  let metadata: ProposalMetadata | null = null;
  if (literal.ok) {
    const problems = rules(raw);
    errors.push(...problems);
    if (problems.length === 0) metadata = raw as ProposalMetadata;
  }
  const todos = todoFields(raw);
  if (todos.length > 0) errors.push(`${todos.join(", ")} still ${todos.length === 1 ? "holds" : "hold"} a TODO: fill in what the engine is missing before filing`);
  if (isRecord(raw) && raw["kind"] === "fork" && typeof raw["fork"] === "string") {
    const repo = engineRepoRoot(dirname(file));
    if (repo !== null && readFileOrNull(join(repo, raw["fork"])) === null) errors.push(`fork names ${raw["fork"]}, which is not in the engine`);
  }
  const walk = walkProposal(file, root);
  errors.push(...walk.errors);
  const owned = new Set(walk.files);
  const importers = [...gameImports.entries()].filter(([source, targets]) => !owned.has(source) && targets.includes(file)).map(([source]) => source);
  const upstream = isRecord(raw) ? upstreamState(raw["target"], raw["exports"], dirname(file)) : upstreamState(undefined, undefined, root);
  return { file, path, game, raw, metadata, ...upstream, errors, files: walk.files, importers };
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Every `*.engine.ts` file under `root`, judged, plus the ids two games share. */
export function scanProposals(root: string, rules: ProposalRules): ProposalScan {
  const entries = walkFiles(root, PROPOSAL_FILE);
  const indexes = new Map<string, Map<string, string[]>>();
  const proposals = entries.map((file) => {
    const gameDir = nearestPackageDir(dirname(file), root);
    let index = indexes.get(gameDir);
    if (index === undefined) {
      index = importIndex(gameDir);
      indexes.set(gameDir, index);
    }
    return analyzeProposal(file, root, rules, index, gameDir);
  });
  return { root, proposals, errors: duplicateIds(proposals) };
}

/** An id carried by more than one proposal: across games the second adopter moves it upstream; within one game it is a typo. */
export function duplicateIds(proposals: readonly ProposalReport[]): string[] {
  const byId = new Map<string, ProposalReport[]>();
  for (const report of proposals) {
    const id = isRecord(report.raw) && typeof report.raw["id"] === "string" ? report.raw["id"] : null;
    if (id === null) continue;
    byId.set(id, [...(byId.get(id) ?? []), report]);
  }
  const errors: string[] = [];
  for (const [id, reports] of byId) {
    if (reports.length < 2) continue;
    const games = [...new Set(reports.map((report) => report.game))];
    const where = reports.map((report) => report.path).join(", ");
    const target = isRecord(reports[0]!.raw) && typeof reports[0]!.raw["target"] === "string" ? reports[0]!.raw["target"] : "its target";
    errors.push(
      games.length > 1
        ? `proposal ${id} is carried by ${games.length} games (${where}): a second adopter moves it upstream to ${target}; build it there and switch both games`
        : `proposal id ${id} is used twice in ${games[0]} (${where}): ids are unique`,
    );
  }
  return errors;
}

/** Everything `jgengine propose --check` fails on: each proposal's errors, an upstream copy still in use, and shared ids. */
export function checkFailures(scan: ProposalScan): string[] {
  const failures: string[] = [];
  for (const report of scan.proposals) {
    for (const error of report.errors) failures.push(`${report.path}: ${error}`);
    if (report.status === "upstream") {
      const target = isRecord(report.raw) ? String(report.raw["target"]) : "its target";
      const users = report.importers.length > 0 ? ` (imported by ${report.importers.map((file) => posix(relative(scan.root, file))).join(", ")})` : "";
      failures.push(`${report.path}: upstream exists at ${target}; switch imports and delete ${report.path}${users}`);
    }
  }
  failures.push(...scan.errors);
  return failures;
}
