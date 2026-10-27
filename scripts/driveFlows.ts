/**
 * Where a game's flows, docs/ and proof shots live, and how a named flow is read. Kept apart from
 * the drive runner so the lookup and its failure messages are testable without a browser or a
 * checkout: a lane on a fresh games worktree must find `<cwd>/<game>/proofs/flows`, and a game with
 * no flow folder must say so instead of running nothing.
 */
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { isProofFlow, type ProofFlow } from "../packages/core/src/play/flow";
import { servedGameDir } from "./servedGame";

/** What a run points at: a game id, a managed app route, or an external URL. */
export interface DriveTarget {
  game: string;
  site?: string;
  /** Set when `--url` selected an external page: its evidence lands in the working directory. */
  external?: boolean;
}

/**
 * The project directory a run reads and writes. A checkout you are standing in wins over the
 * engine's own `games/` clone, so a fresh games worktree proves things about its own flows and
 * writes shots next to them; only when neither matches does the engine checkout answer.
 */
export function driveProjectDir(
  target: DriveTarget,
  cwd: string,
  engineRoot: string,
  exists: (path: string) => boolean,
): string {
  if (target.external === true) return cwd;
  if (target.site !== undefined) {
    const local = join(cwd, "apps", "web", target.site);
    return exists(local) ? local : join(engineRoot, "apps", "web", target.site);
  }
  // A run serving the game from another checkout reads that checkout's flows and writes beside
  // them, so the bundle and the tree it describes stay in one place.
  const served = servedGameDir();
  if (served !== null && basename(served) === target.game) return served;
  if (exists(join(cwd, target.game))) return join(cwd, target.game);
  // Standing inside the game project itself: its own proofs/ and docs/ are the ones to read.
  if (basename(cwd) === target.game && exists(join(cwd, "package.json"))) return cwd;
  return join(engineRoot, "games", target.game);
}

/** The flow folder a game owns. */
export function flowsDirOf(projectDir: string): string {
  return join(projectDir, "proofs", "flows");
}

/** The file extension of a TypeScript proof flow. */
export const FLOW_EXTENSION = ".flow.ts";

/** Flow names in a folder, sorted; empty when there is no folder (a game with no flows yet). */
export function listFlowNames(dir: string, readdir: (dir: string) => string[]): string[] {
  let entries: string[];
  try {
    entries = readdir(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith(FLOW_EXTENSION)).map((name) => name.slice(0, -FLOW_EXTENSION.length)).sort();
}

/** What a run says when a game has no flow folder: the folder, and what to write in it. */
export function missingFlowsMessage(dir: string): string {
  return "no flows at " + dir + " — write <game>/proofs/flows/<name>" + FLOW_EXTENSION + " with defineFlow: the route and the arrival it expects";
}

/**
 * The file a named flow lives in. A missing name lists the ones that do exist, so the next agent picks
 * a route instead of guessing; a path or extension is refused, because a flow is named, not located.
 */
export function flowFileOf(dir: string, name: string, exists: (path: string) => boolean, names: () => string[]): string {
  if (name.includes("/") || name.includes("\\") || name.endsWith(".ts") || name.endsWith(".json")) {
    throw new Error("--flow takes a bare name; the file lives at " + join(dir, "<name>" + FLOW_EXTENSION) + " (got \"" + name + "\")");
  }
  const path = join(dir, name + FLOW_EXTENSION);
  if (exists(path)) return path;
  const available = names();
  throw new Error("no flow named \"" + name + "\" in " + dir + " (" + (available.length === 0 ? missingFlowsMessage(dir) : "available: " + available.join(", ")) + ")");
}

/** Import a named flow and check its default export is a `defineFlow` result. */
export async function loadFlow(dir: string, name: string): Promise<ProofFlow> {
  const path = flowFileOf(dir, name, existsSync, () => listFlowNames(dir, (folder) => readdirSync(folder)));
  const module: unknown = await import(pathToFileURL(path).href);
  const flow = typeof module === "object" && module !== null && "default" in module ? module.default : undefined;
  if (!isProofFlow(flow)) throw new Error(path + " must export default defineFlow(game, { run })");
  return flow;
}
