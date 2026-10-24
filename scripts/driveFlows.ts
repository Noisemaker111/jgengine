/**
 * Where a game's flows, docs/ and proof shots live, and how a named flow is read. Kept apart from
 * the drive runner so the lookup and its failure messages are testable without a browser or a
 * checkout: a lane on a fresh games worktree must find `<cwd>/<game>/proofs/flows`, and a game with
 * no flow folder must say so instead of running nothing.
 */
import { basename, join } from "node:path";
import type { FlowFile, FlowSource } from "../packages/jgengine/src/templates/captureArgs";
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
 * engine's own `Games/` clone, so a fresh games worktree proves things about its own flows and
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
  return join(engineRoot, "Games", target.game);
}

/** The flow folder a game owns. */
export function flowsDirOf(projectDir: string): string {
  return join(projectDir, "proofs", "flows");
}

/** Flow names in a folder, sorted; empty when there is no folder (a game with no flows yet). */
export function listFlowNames(dir: string, readdir: (dir: string) => string[]): string[] {
  let entries: string[];
  try {
    entries = readdir(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -".json".length)).sort();
}

/** What a run says when a game has no flow folder: the folder, and what to write in it. */
export function missingFlowsMessage(dir: string): string {
  return "no flows at " + dir + " — write <game>/proofs/flows/<name>.json with the route and the arrival it asserts";
}

/** Read a named flow; a missing name lists the ones that do exist, so the next agent picks a route instead of guessing. */
export function flowSourceFrom(dir: string, read: (path: string) => string, names: () => string[]): FlowSource {
  return (name: string): FlowFile | undefined => {
    const path = join(dir, name + ".json");
    let text: string;
    try {
      text = read(path);
    } catch {
      const available = names();
      throw new Error("no flow named \"" + name + "\" in " + dir + " (" + (available.length === 0 ? missingFlowsMessage(dir) : "available: " + available.join(", ")) + ")");
    }
    try {
      return { json: JSON.parse(text), source: path };
    } catch (error) {
      throw new Error("flow \"" + name + "\" at " + path + " is not valid JSON (" + (error instanceof Error ? error.message : String(error)) + ")");
    }
  };
}
