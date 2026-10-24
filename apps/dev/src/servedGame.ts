/**
 * The dev runner's games come from `Games/*` through `import.meta.glob`, which is fixed when the
 * server boots. A run that serves a game from another checkout (`--game-dir`, which reaches here as
 * `VITE_JG_GAME_DIR`) adds that one directory beside the glob's games, loaded through the dev
 * server's own module pipeline (`/@fs/<path>`) so the same plugins, aliases and HMR apply.
 */
const RAW = import.meta.env.VITE_JG_GAME_DIR;

function toPosix(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export interface ServedGame {
  /** The folder's own name, which is the id the runner looks the game up by. */
  id: string;
  /** Absolute path, forward slashes, without a trailing separator. */
  root: string;
}

/** The served game implied by a `VITE_JG_GAME_DIR` value, or null for the in-repo `Games/`. */
export function servedGameFrom(raw: string | undefined): ServedGame | null {
  if (raw === undefined || raw.trim() === "") return null;
  const root = toPosix(raw);
  return { id: root.split("/").at(-1)!, root };
}

export const servedGame: ServedGame | null = servedGameFrom(RAW);

/** One file of the served game, as the browser would fetch it through the dev server. */
export function servedModule<T>(relative: string): Promise<T> {
  if (servedGame === null) return Promise.reject(new Error("no served game: pass --game-dir"));
  return import(/* @vite-ignore */ `/@fs/${servedGame.root}/${relative}`) as Promise<T>;
}
