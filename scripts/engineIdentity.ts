/**
 * Which engine a capture is actually rendering.
 *
 * The dev runner aliases every engine import to this checkout's package source, so every
 * shoot/drive/perf run names the source it served: the version from
 * `packages/core/package.json` and the commit from `git rev-parse`, both already on disk, no build
 * and no network. Uncommitted edits under `packages/` are served too, so the line says so.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_PACKAGE = "@jgengine/core";

/** The checkout whose source the dev runner serves. */
export interface ServedEngine {
  package: string;
  version: string;
  /** Short commit of the served checkout; null when git could not read one. */
  commit: string | null;
  /** Uncommitted edits under `packages/` are served too, so the commit alone is not the whole story. */
  dirty: boolean;
  path: string;
}

export interface EngineIdentity {
  served: ServedEngine | null;
  /** The one line every run prints. */
  line: string;
}

/** What a saved record carries, so a sidecar can be audited without re-reading the checkout. */
export type EngineRecord = ServedEngine;

export const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function git(args: string[], cwd: string): string | null {
  try {
    const run = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 5_000 });
    return run.status === 0 ? run.stdout.trim() : null;
  } catch {
    return null;
  }
}

/** The engine this checkout serves, read from disk; null when there is no engine checkout here. */
export function readServedEngine(root: string = repoRoot): ServedEngine | null {
  const manifest = join(root, "packages", "core", "package.json");
  if (!existsSync(manifest)) return null;
  let version: string;
  try {
    version = (JSON.parse(readFileSync(manifest, "utf8")) as { version?: string }).version ?? "unknown";
  } catch {
    return null;
  }
  const head = git(["rev-parse", "--short=8", "HEAD"], root);
  const status = git(["status", "--porcelain", "--", "packages"], root);
  return {
    package: ENGINE_PACKAGE,
    version,
    commit: head === null || head.length === 0 ? null : head,
    dirty: status !== null && status.length > 0,
    path: root,
  };
}

/** `serving engine source 2f3b956a (@jgengine/core 0.38.1, C:\...\jgengine)` — one phrase, both facts. */
export function describeServedEngine(served: ServedEngine): string {
  const dirty = served.dirty ? " +uncommitted edits" : "";
  return `serving engine source ${served.commit ?? "unknown"}${dirty} (${served.package} ${served.version}, ${served.path})`;
}

/** The served engine and the line a run prints. */
export function resolveEngineIdentity(options: { root?: string } = {}): EngineIdentity {
  const root = options.root ?? repoRoot;
  const served = readServedEngine(root);
  return {
    served,
    line: served === null ? `engine: unknown — no engine checkout at ${root}` : `engine: ${describeServedEngine(served)}`,
  };
}

/** The audit record for a saved run; null when there is no served engine to name. */
export function engineRecord(identity: EngineIdentity): EngineRecord | null {
  return identity.served === null ? null : { ...identity.served };
}
