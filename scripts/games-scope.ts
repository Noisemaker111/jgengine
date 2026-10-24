import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The games this engine builds, read from the budgets the perf gate measures (`scripts/perf-budget.json`).
 * The Games/ clone is the whole JGengine-games repo at the pinned SHA, so it can hold other games that
 * repo is working on; the gates scan only the reference set and name the rest instead of failing on
 * another checkout's work. A tree without the budget file (a test fixture) is not this repo, so it keeps
 * the old behaviour and scans every folder with a `src`.
 */
export function referenceGames(root: string): string[] {
  const budget = join(root, "scripts", "perf-budget.json");
  if (!existsSync(budget)) return folders(root, (name) => existsSync(join(root, "Games", name, "src")));
  return Object.keys(JSON.parse(readFileSync(budget, "utf8")) as Record<string, unknown>).sort();
}

function folders(root: string, keep: (name: string) => boolean): string[] {
  const gamesDir = join(root, "Games");
  if (!existsSync(gamesDir)) return [];
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && keep(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** Games under Games/ that are not reference games, in name order — folders with a game's own entry. */
export function ignoredGames(root: string, games: readonly string[] = referenceGames(root)): string[] {
  return folders(root, (name) => {
    const dir = join(root, "Games", name);
    return (
      existsSync(join(dir, "index.html")) ||
      existsSync(join(dir, "src/index.tsx")) ||
      existsSync(join(dir, "src/game.config.ts"))
    );
  }).filter((game) => !games.includes(game));
}

/** The warning line for a gate that skipped games, or null when it skipped none. */
export function ignoredGamesWarning(gate: string, ignored: readonly string[]): string | null {
  if (ignored.length === 0) return null;
  return (
    `${gate}: ignoring ${ignored.length} game(s) this repo does not build — ` +
    `${ignored.join(", ")} (reference games: scripts/perf-budget.json)`
  );
}

/** One warning line naming every game a gate skipped, so an unexpected clone stays visible. */
export function warnIgnoredGames(gate: string, ignored: readonly string[]): void {
  const line = ignoredGamesWarning(gate, ignored);
  if (line !== null) console.warn(line);
}

/** The commit a Games/ gate must be reading: the pin in `scripts/games-ref.txt`. */
export function gamesPin(root: string): string | null {
  try {
    const raw = readFileSync(join(root, "scripts", "games-ref.txt"), "utf8").trim();
    return /^[0-9a-f]{40}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function readIfSha(path: string): string | null {
  try {
    const raw = readFileSync(path, "utf8").trim();
    return /^[0-9a-f]{40}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** HEAD of a git directory as a commit, or null when only `git` can resolve it (packed refs). */
function headOf(gitDir: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  } catch {
    return null;
  }
  if (/^[0-9a-f]{40}$/.test(raw)) return raw;
  const ref = /^ref:\s*(\S+)$/.exec(raw)?.[1];
  return ref === undefined ? null : readIfSha(join(gitDir, ...ref.split("/")));
}

/**
 * The commit `Games/` holds, from `.git/HEAD` (two file reads, no process) with a
 * single `git rev-parse` only when HEAD is a packed ref.
 */
export function gamesHead(root: string): string | null {
  const games = join(root, "Games");
  const dotGit = join(games, ".git");
  let gitDir = dotGit;
  try {
    if (lstatSync(dotGit).isFile()) {
      const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"))?.[1];
      if (pointer === undefined) return null;
      gitDir = join(games, pointer.trim());
    }
  } catch {
    return null;
  }
  const direct = headOf(gitDir);
  if (direct !== null) return direct;
  try {
    return execFileSync("git", ["-C", games, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

export type GamesCheckoutState = "at-pin" | "stale" | "absent" | "unknown-head" | "no-pin" | "override";

export interface GamesCheckout {
  path: string;
  present: boolean;
  /** Commit the gates are reading, or null when it cannot be named. */
  head: string | null;
  /** Commit `scripts/games-ref.txt` pins, or the `GAMES_REF` override when that is a commit. */
  pin: string | null;
  state: GamesCheckoutState;
  /** What the pin was read from, so the line can name it: `games-ref.txt` or `GAMES_REF`. */
  expected: string;
}

/**
 * Which Games/ commit a gate is about to measure, against the pin it should be.
 * `GAMES_REF` overrides the pin the way `ensure-games` does, and a branch name
 * there cannot be compared, so it is reported as an override instead of drift.
 */
export function gamesCheckout(root: string): GamesCheckout {
  const path = join(root, "Games");
  const present = existsSync(path);
  const head = present ? gamesHead(root) : null;
  const override = process.env.GAMES_REF?.trim() || null;
  let pin: string | null = null;
  let expected = "scripts/games-ref.txt";
  if (override !== null) {
    expected = "GAMES_REF";
    pin = /^[0-9a-f]{40}$/.test(override) ? override : null;
  } else {
    pin = gamesPin(root);
  }
  const state: GamesCheckoutState = !present
    ? "absent"
    : override !== null && pin === null
      ? "override"
      : pin === null
        ? "no-pin"
        : head === null
          ? "unknown-head"
          : head === pin
            ? "at-pin"
            : "stale";
  return { path, present, head, pin, state, expected };
}

const short = (sha: string | null): string => (sha === null ? "unknown" : sha.slice(0, 7));

/** One line naming the commit behind a gate's verdict, and the pin when they differ. */
export function gamesCheckoutLine(gate: string, checkout: GamesCheckout): string {
  const where = checkout.expected === "GAMES_REF" ? "GAMES_REF" : "pin";
  switch (checkout.state) {
    case "at-pin":
      return `${gate}: measuring Games/ at ${short(checkout.head)} (${where})`;
    case "stale":
      return `${gate}: Games/ is at ${short(checkout.head)}, ${where} is ${short(checkout.pin)} — measuring an unpinned checkout; run \`bun run games:update\``;
    case "absent":
      return `${gate}: no Games/ checkout (${where} ${short(checkout.pin)}) — nothing measured; run \`bun run games:clone\``;
    case "unknown-head":
      return `${gate}: Games/ has no git HEAD (${where} ${short(checkout.pin)}) — cannot name the commit being measured; run \`bun run games:clone\``;
    case "no-pin":
      return `${gate}: no pin in scripts/games-ref.txt — cannot name the expected Games/ commit`;
    case "override":
      return `${gate}: measuring Games/ at ${short(checkout.head)} for GAMES_REF=${process.env.GAMES_REF?.trim() ?? ""}`;
  }
}

/**
 * The gate's entry point: print the Games/ commit it measures, and exit 1 when that
 * commit is not the pin. A gate that reads an old clone reports defects the games
 * repo already fixed (#2228), and a gate that quietly skips an absent clone reports
 * nothing at all (#2111); `GAMES_ALLOW_STALE=1` is the deliberate opt-out.
 */
export function requireGamesAtPin(gate: string, root: string): GamesCheckout {
  const checkout = gamesCheckout(root);
  const line = gamesCheckoutLine(gate, checkout);
  if (checkout.state === "at-pin" || checkout.state === "override" || checkout.state === "no-pin") {
    console.log(line);
    return checkout;
  }
  if (process.env.GAMES_ALLOW_STALE === "1") {
    console.warn(`${line} (GAMES_ALLOW_STALE=1)`);
    return checkout;
  }
  console.error(line);
  process.exit(1);
}
