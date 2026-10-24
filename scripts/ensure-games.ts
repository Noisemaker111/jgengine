import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Keeps ./Games on the Noisemaker111/JGengine-games commit pinned in scripts/games-ref.txt, so gates and tests
 * that read Games/ only change when a PR here bumps the pin, never on a games-repo push.
 *
 *   bun run games:clone          clone at the pin, or move an existing clone to it (never keeps an older tree)
 *   bun run games:update         the same for an existing clone
 *   bun run games:bump           write the games repo's current stable SHA into the pin, then update
 *   bun scripts/ensure-games.ts --check   report whether Games/ matches the pin; exit 1 when it does not
 *
 * GAMES_REF=<sha|branch> overrides the pin for a one-off local try.
 */

const GAMES_REPO = "https://github.com/Noisemaker111/JGengine-games.git";

export function gamesRepoUrl(token = process.env.GAMES_CLONE_TOKEN?.trim()): string {
  if (!token) return GAMES_REPO;
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/Noisemaker111/JGengine-games.git`;
}

/** The commit Games/ must hold: `GAMES_REF` when set, else the SHA in scripts/games-ref.txt. */
export function pinnedRef(repoRoot: string, override = process.env.GAMES_REF?.trim()): string {
  if (override) return override;
  const refFile = join(repoRoot, "scripts", "games-ref.txt");
  const ref = readFileSync(refFile, "utf8").trim();
  if (!/^[0-9a-f]{40}$/.test(ref)) throw new Error(`ensure-games: ${refFile} must hold a full commit SHA (got "${ref}")`);
  return ref;
}

export type CloneAction = "cloned" | "moved" | "already";

export interface CloneResult {
  action: CloneAction;
  /** Commit Games/ held before this call, when it existed. */
  from: string | null;
  /** Commit Games/ holds now. */
  to: string;
}

function git(args: string[], cwd: string, stdio: "inherit" | "pipe" = "pipe"): { ok: boolean; out: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio });
  return { ok: result.status === 0, out: (result.stdout ?? "").trim() };
}

/** Shallow-fetches one ref (GitHub serves any reachable SHA) and detaches Games/ onto it. */
function fetchAndCheckout(gamesDir: string, ref: string, url: string): string | null {
  if (!git(["fetch", "--depth", "1", url, ref], gamesDir, "inherit").ok) return null;
  const sha = git(["rev-parse", "FETCH_HEAD"], gamesDir).out;
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;
  return git(["checkout", "--detach", sha], gamesDir, "inherit").ok ? sha : null;
}

/**
 * Put `Games/` at `ref`, cloning when it is absent and moving it when it is not.
 *
 * A clone left at another commit is the failure this exists for (#2228): every gate
 * then measured an old tree and reported defects the games repo had already fixed.
 * Local work in Games/ is never discarded - a checkout that would clobber it fails
 * and throws with both commits named, which is the loud outcome the old no-op hid.
 */
export function ensureGames(repoRoot: string, ref: string, options: { url?: string } = {}): CloneResult {
  const gamesDir = join(repoRoot, "Games");
  const url = options.url ?? gamesRepoUrl();
  const pinned = /^[0-9a-f]{40}$/.test(ref);
  if (!existsSync(gamesDir)) {
    console.log(`ensure-games: cloning Games/ at ${ref.slice(0, 7)}…`);
    if (!git(["init", "--quiet", gamesDir], repoRoot).ok || !git(["remote", "add", "origin", GAMES_REPO], gamesDir).ok) {
      throw new Error("ensure-games: clone failed");
    }
    const sha = fetchAndCheckout(gamesDir, ref, url);
    if (sha === null) throw new Error("ensure-games: clone failed");
    return { action: "cloned", from: null, to: sha };
  }

  const head = git(["rev-parse", "HEAD"], gamesDir).out || null;
  if (pinned && head === ref) {
    console.log(`ensure-games: Games/ already at ${ref.slice(0, 7)} — nothing to do`);
    return { action: "already", from: head, to: ref };
  }
  if (head === null) {
    throw new Error(`ensure-games: Games/ is not a git checkout and cannot be moved to ${ref.slice(0, 7)} — remove it and run bun run games:clone`);
  }
  console.log(`ensure-games: Games/ is at ${head.slice(0, 7)}, pin is ${ref.slice(0, 7)} — moving it…`);
  const moved = fetchAndCheckout(gamesDir, ref, url);
  if (moved === null) {
    throw new Error(
      `ensure-games: could not check out ${ref.slice(0, 7)} in Games/ (it stayed at ${head.slice(0, 7)}; local changes?) — commit or discard them there, then rerun`,
    );
  }
  return { action: "moved", from: head, to: moved };
}

function main(): void {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const args = process.argv.slice(2);
  const refFile = join(repoRoot, "scripts", "games-ref.txt");

  if (args.includes("--bump")) {
    const line = git(["ls-remote", gamesRepoUrl(), "refs/heads/stable"], repoRoot).out;
    const sha = line.split(/\s+/)[0];
    if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
      console.error("ensure-games: could not read JGengine-games stable");
      process.exit(1);
    }
    writeFileSync(refFile, `${sha}\n`);
    console.log(`ensure-games: pinned ${sha} in scripts/games-ref.txt — commit it`);
  }

  let ref: string;
  try {
    ref = pinnedRef(repoRoot);
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  }

  if (args.includes("--check")) {
    if (!existsSync(join(repoRoot, "Games"))) {
      console.error(`ensure-games: Games/ not found (pin ${ref.slice(0, 7)}) — run bun run games:clone`);
      process.exit(1);
    }
    const head = git(["rev-parse", "HEAD"], join(repoRoot, "Games")).out || null;
    if (head === ref) {
      console.log(`ensure-games: Games/ at pinned ${ref.slice(0, 7)}`);
      process.exit(0);
    }
    console.error(
      `ensure-games: Games/ is at ${head?.slice(0, 7) ?? "unknown"}, pin is ${ref.slice(0, 7)} — every gate would measure the wrong tree; run bun run games:update`,
    );
    process.exit(1);
  }

  try {
    ensureGames(repoRoot, ref);
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  }
  console.log("ensure-games: done — Games/ ready");
}

if (import.meta.main) main();
