/**
 * Every `bun run perf` run on a clean tree keeps its record under the commit it measured, so the
 * "before" side of a comparison is measured once per game and commit, not again on every
 * `--compare`. A builder runs `bun run perf <game>` before editing, edits, then runs
 * `bun run perf <game> --compare HEAD`: the before side is read from the cache in a second.
 *
 * A record is only reused under the same run conditions (viewport, tier, clock, path, window,
 * scene, settings), because a number from a different setup is not the same measurement.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** What makes two runs of one game the same measurement. */
export interface PerfConditions {
  size: { width: number; height: number };
  quality: string | undefined;
  draft: boolean;
  frameClock: string;
  path: string;
  seconds: number;
  telemetry: string;
  state: string | undefined;
  params: readonly (readonly [string, string])[];
  settings: readonly { id: string; value: unknown }[];
}

/** A short stable name for a set of run conditions. */
export function conditionsKey(conditions: PerfConditions): string {
  const canonical = JSON.stringify([
    `${conditions.size.width}x${conditions.size.height}`,
    conditions.quality ?? "game-default",
    conditions.draft,
    conditions.frameClock,
    conditions.path,
    conditions.seconds,
    conditions.telemetry,
    conditions.state ?? null,
    conditions.params,
    conditions.settings.map((setting) => [setting.id, setting.value]),
  ]);
  return createHash("sha1").update(canonical).digest("hex").slice(0, 10);
}

/** Where the cached record of `game` at `commit` under `key` lives. */
export function baselinePath(root: string, game: string, commit: string, key: string): string {
  return join(root, ".scratch", "perf", "baselines", game, `${commit}-${key}.json`);
}

function git(root: string, args: string[]): string | null {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10_000 });
  return run.status === 0 ? run.stdout.trim() : null;
}

/** The commit a git ref names, short form; null when it names none. */
export function resolveCommit(root: string, ref: string): string | null {
  const commit = git(root, ["rev-parse", "--verify", "--quiet", "--short=8", `${ref}^{commit}`]);
  return commit === null || commit.length === 0 ? null : commit;
}

/**
 * The commit this run measures when nothing it serves has uncommitted edits (the engine packages,
 * the dev runner and this game); null when something does, since then no commit names the source.
 */
export function cleanCommitFor(root: string, game: string): string | null {
  const status = git(root, ["status", "--porcelain", "--", "packages", "apps/dev", join("games", game)]);
  if (status === null || status.length > 0) return null;
  return resolveCommit(root, "HEAD");
}

/** Keep a clean run's record as the baseline of its commit. */
export function saveBaseline(path: string, record: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}

/** The cached record's text at `path`, or null when that side was never measured. */
export function readBaselineAt(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
