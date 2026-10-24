/**
 * `--game-dir <path>` serves one game from a checkout outside this repo's `Games/`:
 *
 *   bun run shoot harbor-heat --game-dir ../jgengine-games/.claude/worktrees/lane/harbor-heat
 *
 * Everything that makes the dev-runner path worth using still holds: Vite aliases `@jgengine/*` to
 * this checkout's source (so the engine line names what renders), `--state`, `--view` and the
 * capture handshake come from the same runner app, and the game's own style, editor scene and
 * preview load from that directory. Without the flag nothing changes and `Games/<game>` is served.
 */
import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export const GAME_DIR_FLAG = "--game-dir";

/** The game directory this run serves, or null when the dev runner serves `Games/<game>`. */
export function servedGameDir(): string | null {
  const raw = process.env["JG_GAME_DIR"];
  return raw === undefined || raw.trim() === "" ? null : resolve(raw);
}

export interface GameDirOption {
  /** Every argv entry except `--game-dir <path>`, in order. */
  argv: string[];
  dir: string | null;
}

/**
 * Pull `--game-dir` out of argv before the shared capture parser sees it. The flag stays engine-only
 * because the portable harness has no `Games/` to swap and no second checkout to point at.
 */
export function splitGameDir(argv: string[]): GameDirOption {
  const rest: string[] = [];
  let dir: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === GAME_DIR_FLAG) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${GAME_DIR_FLAG} needs a path to a game folder`);
      dir = value;
      index += 1;
      continue;
    }
    if (arg.startsWith(`${GAME_DIR_FLAG}=`)) {
      dir = arg.slice(GAME_DIR_FLAG.length + 1);
      continue;
    }
    rest.push(arg);
  }
  return { argv: rest, dir };
}

/**
 * Make the launcher and every later `ensureDevServer` call in this process serve `dir`. The game id
 * must be the folder's own name: the dev runner looks a game up by id and the folder names it.
 */
export function serveGameDir(dir: string, game: string | undefined): string {
  const resolved = resolve(dir);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`${GAME_DIR_FLAG}: no directory at ${resolved}`);
  }
  if (!existsSync(resolve(resolved, "src", "index.tsx"))) {
    throw new Error(`${GAME_DIR_FLAG}: ${resolved} is not a game folder - it has no src/index.tsx`);
  }
  const id = basename(resolved);
  if (game !== undefined && game !== id) {
    throw new Error(`${GAME_DIR_FLAG}: ${resolved} is game "${id}", not "${game}"; pass --game-dir to that folder or name ${id}`);
  }
  process.env["JG_GAME_DIR"] = resolved;
  process.env["VITE_JG_GAME_DIR"] = resolved.replace(/\\/g, "/");
  // The identity line compares the served engine with the pin of the games checkout this game
  // belongs to, which is the folder above it, not this repo's `Games/`.
  process.env["JG_GAMES_DIR"] = dirname(resolved);
  return resolved;
}

/** Refuse a second target for a run that already serves one directory. */
export function assertOneTarget(options: { served: string | null; url?: string; site?: string }): void {
  if (options.served === null) return;
  if (options.url !== undefined) throw new Error(`${GAME_DIR_FLAG} serves the game itself; --url points at a page instead - pass one`);
  if (options.site !== undefined) throw new Error(`${GAME_DIR_FLAG} serves a game, not a website; --site renders a web page - pass one`);
}
