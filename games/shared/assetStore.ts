import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * One on-disk store for every pulled model, material and sprite, shared by the main checkout and
 * every worktree. A game's `public/<kind>/<id>` is a link into it, so a pack is downloaded once per
 * machine instead of once per worktree. `JG_ASSET_STORE` moves it; the default sits beside the main
 * checkout's `.git` as `.asset-store/` (gitignored), with the same `models/`, `materials/`,
 * `sprites/` layout a game's `public/` has.
 */
export function assetStoreRoot(repoRoot: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const override = env.JG_ASSET_STORE;
  if (override !== undefined && override !== "") return resolve(override);
  return join(mainCheckoutOf(repoRoot) ?? repoRoot, ".asset-store");
}

/** The main checkout a linked worktree belongs to (`.git` is a file there), or null for the main checkout itself. */
export function mainCheckoutOf(repoRoot: string): string | null {
  const dotGit = join(repoRoot, ".git");
  try {
    if (!lstatSync(dotGit).isFile()) return null;
    const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
    if (match === null) return null;
    const main = dirname(dirname(dirname(resolve(repoRoot, match[1]!.trim()))));
    return existsSync(join(main, ".git")) ? main : null;
  } catch {
    return null;
  }
}

export function dirHasEntries(dir: string): boolean {
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

function lexists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy an already-pulled real directory into the store when the store lacks it, so packs a checkout
 * pulled before the store existed are never downloaded again. `candidates` are full paths to the
 * same `<kind>/<id>` folder elsewhere (another game's `public/`, the main checkout's).
 */
export function seedStore(storeDir: string, candidates: readonly string[]): boolean {
  if (dirHasEntries(storeDir)) return true;
  for (const candidate of candidates) {
    if (!dirHasEntries(candidate)) continue;
    if (lstatSync(candidate).isSymbolicLink()) continue;
    mkdirSync(dirname(storeDir), { recursive: true });
    cpSync(candidate, storeDir, { recursive: true });
    return true;
  }
  return false;
}

/**
 * Point `publicPath` at `storeDir`. An empty folder or a dangling link in the way is replaced; a
 * populated real folder is left alone (it already serves the game). True when the path serves the
 * store's bytes afterwards.
 */
export function linkFromStore(storeDir: string, publicPath: string): boolean {
  if (!dirHasEntries(storeDir)) return false;
  if (dirHasEntries(publicPath)) return true;
  if (lexists(publicPath)) {
    if (lstatSync(publicPath).isSymbolicLink()) unlinkSync(publicPath);
    else rmdirSync(publicPath);
  }
  mkdirSync(dirname(publicPath), { recursive: true });
  symlinkSync(realpathSync(storeDir), publicPath, "junction");
  return true;
}

/** Every place a checkout may already hold `rel` (a `<kind>/<id>` path) as real pulled bytes. */
export function seedCandidates(roots: readonly string[], rel: string): string[] {
  const found: string[] = [];
  for (const root of [...new Set(roots)]) {
    found.push(join(root, "apps", "dev", "public", rel));
    const games = join(root, "games");
    if (!existsSync(games)) continue;
    for (const game of readdirSync(games)) found.push(join(games, game, "public", rel));
  }
  return found;
}
