import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

/**
 * One on-disk store for every pulled model, material and sprite, shared by the main checkout and
 * every worktree. A game's `public/<kind>/<id>` is a link into it, so a pack is downloaded once per
 * machine instead of once per worktree. `JG_ASSET_STORE` moves it; the default sits beside the main
 * checkout's `.git` as `.asset-store/` (gitignored), with the same `models/`, `materials/`,
 * `sprites/` layout a game's `public/` has.
 * @internal
 */
export function assetStoreRoot(repoRoot: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const override = env["JG_ASSET_STORE"];
  if (override !== undefined && override !== "") return resolve(override);
  return join(mainCheckoutOf(repoRoot) ?? repoRoot, ".asset-store");
}

/**
 * The main checkout a linked worktree belongs to (`.git` is a file there), or null for the main checkout itself.
 * @internal
 */
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

/**
 * Whether `dir` exists and holds at least one entry.
 * @internal
 */
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
 * @internal
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
 * @internal
 */
export function linkFromStore(storeDir: string, publicPath: string): boolean {
  if (!dirHasEntries(storeDir)) return false;
  if (dirHasEntries(publicPath)) {
    // A link made before links were excluded gets its line now.
    if (lstatSync(publicPath).isSymbolicLink()) excludeFromGit(publicPath);
    return true;
  }
  if (lexists(publicPath)) {
    if (lstatSync(publicPath).isSymbolicLink()) unlinkSync(publicPath);
    else rmdirSync(publicPath);
  }
  mkdirSync(dirname(publicPath), { recursive: true });
  symlinkSync(realpathSync(storeDir), publicPath, "junction");
  excludeFromGit(publicPath);
  return true;
}

/** The checkout `path` sits in (the nearest folder with a `.git` file or folder) and its git common dir. */
function checkoutOf(path: string): { top: string; commonDir: string } | null {
  for (let dir = dirname(resolve(path)); ; dir = dirname(dir)) {
    const dotGit = join(dir, ".git");
    if (lexists(dotGit)) {
      if (!lstatSync(dotGit).isFile()) return { top: dir, commonDir: dotGit };
      const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
      if (match?.[1] === undefined) return null;
      const gitDir = resolve(dir, match[1].trim());
      const common = join(gitDir, "commondir");
      return { top: dir, commonDir: existsSync(common) ? resolve(gitDir, readFileSync(common, "utf8").trim()) : gitDir };
    }
    if (dirname(dir) === dir) return null;
  }
}

/**
 * Keep a store link out of git wherever it is made. Git follows the link and lists the store's files
 * as new, and `.gitignore` only covered the kinds someone remembered (fonts were committed twice), so
 * each link is written to the repository's own `info/exclude` as it is created. That file is never
 * committed and every worktree of the repository reads it.
 * @internal
 */
export function excludeFromGit(linkPath: string): void {
  const checkout = checkoutOf(linkPath);
  if (checkout === null) return;
  const rel = relative(checkout.top, resolve(linkPath)).split(sep).join("/");
  if (rel === "" || rel.startsWith("..")) return;
  const exclude = join(checkout.commonDir, "info", "exclude");
  const line = `/${rel}`;
  const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (current.split(/\r?\n/).includes(line)) return;
  mkdirSync(dirname(exclude), { recursive: true });
  appendFileSync(exclude, `${current.length > 0 && !current.endsWith("\n") ? "\n" : ""}${line}\n`);
}

/**
 * Every place a checkout may already hold `rel` (a `<kind>/<id>` path) as real pulled bytes.
 * @internal
 */
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

/** One pack or library model a game needs on disk. */
export interface PullJob {
  /** The `assets pull` target: a pack id, or `model:<name>` for a library model. */
  target: string;
  /** Where it lands, relative to the game's `public/` (`models/<pack>`, `models/library/<name>`). */
  dir: string;
}

/** What {@link provisionJobs} did with each target. */
export interface ProvisionResult {
  /** Targets now served from the shared store through a link. */
  linked: string[];
  /** Targets downloaded into the store by this call. */
  pulled: string[];
  /** Targets a download was tried for and failed. */
  failed: string[];
  /** Targets the store lacks and this call was told not to download (`download: false`). */
  absent: string[];
}

/** How {@link provisionJobs} fetches a target the store lacks: `assets pull <target> --dir <outRoot>`, true on success. */
export type PullTarget = (target: string, outRoot: string) => Promise<boolean>;

/**
 * Serve each job to the game from the shared store: link it when the store has it, seed the store
 * from a copy any checkout already pulled, and only then download into the store. A job the game's
 * `public/` already holds is linked in place without work. `download: false` links what the store
 * has and downloads nothing.
 * @internal
 */
export async function provisionJobs(
  gameDir: string,
  jobs: readonly PullJob[],
  options: { pull: PullTarget; log?: ((line: string) => void) | undefined; download?: boolean | undefined; env?: Readonly<Record<string, string | undefined>> | undefined },
): Promise<ProvisionResult> {
  const log = options.log ?? console.log;
  const repoRoot = resolve(gameDir, "..", "..");
  const store = assetStoreRoot(repoRoot, options.env);
  const roots = [repoRoot, mainCheckoutOf(repoRoot) ?? repoRoot];
  const result: ProvisionResult = { linked: [], pulled: [], failed: [], absent: [] };
  for (const job of jobs) {
    const storeDir = join(store, job.dir);
    if (!seedStore(storeDir, seedCandidates(roots, job.dir))) {
      if (options.download === false) {
        result.absent.push(job.target);
        continue;
      }
      log(`${basename(gameDir)}: pulling ${job.target} into the shared asset store ${store}`);
      if (!(await options.pull(job.target, store))) {
        result.failed.push(job.target);
        continue;
      }
      result.pulled.push(job.target);
    }
    if (linkFromStore(storeDir, join(gameDir, "public", job.dir))) result.linked.push(job.target);
    else result.failed.push(job.target);
  }
  return result;
}
