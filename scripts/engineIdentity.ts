/**
 * Which engine a capture is actually rendering.
 *
 * The dev runner aliases every engine import to this checkout's package source, so a
 * capture never renders the version the game's catalog pins — it renders whatever source is on
 * disk. A lane that forgot to fast-forward this checkout proved its fix against an engine two
 * releases old and read the unchanged pixels as "the fix does not work".
 *
 * So every shoot/drive/perf run names the served engine and stops when it is older than the pin.
 * The version comes from `packages/core/package.json` and the commit from `git rev-parse`: both
 * already on disk, no build and no network.
 *
 * A source-served run ahead of the pin is the normal engine-lane state, so it proceeds and says so.
 * Serving older source on purpose needs `--allow-engine-mismatch`, and the run records that it did.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_PACKAGE = "@jgengine/core";
export const ALLOW_MISMATCH_FLAG = "--allow-engine-mismatch";

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

/** The engine version the game's catalog pins, and the file that says so. */
export interface EnginePin {
  package: string;
  version: string;
  path: string;
}

/** `match` and `ahead` proceed; `behind` stops unless the caller allowed it; `unknown` cannot be compared. */
export type EngineVerdict = "match" | "ahead" | "behind" | "unknown";

export interface EngineIdentity {
  served: ServedEngine | null;
  pin: EnginePin | null;
  verdict: EngineVerdict;
  /** False only when the run must stop. */
  allowed: boolean;
  /** True when the run continued only because `--allow-engine-mismatch` was passed. */
  mismatchAllowed: boolean;
  /** The one line every run prints. */
  line: string;
  /** The message the run stops with, or null. */
  refusal: string | null;
}

/** What a saved record carries, so a sidecar can be audited without re-reading the checkout. */
export interface EngineRecord {
  package: string;
  version: string;
  commit: string | null;
  dirty: boolean;
  path: string;
  pin: string | null;
  verdict: EngineVerdict;
  mismatchAllowed: boolean;
}

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

/** The engine version the games repo pins, from its workspace catalog, else the game's own dependency. */
export function readEnginePin(gamesDir: string, game?: string): EnginePin | null {
  const rootManifest = join(gamesDir, "package.json");
  let catalog: Record<string, string> = {};
  if (existsSync(rootManifest)) {
    try {
      const parsed = JSON.parse(readFileSync(rootManifest, "utf8")) as { workspaces?: { catalog?: Record<string, string> } };
      catalog = parsed.workspaces?.catalog ?? {};
    } catch {
      catalog = {};
    }
  }
  const pinned = catalog[ENGINE_PACKAGE];
  if (typeof pinned === "string" && pinned.length > 0) return { package: ENGINE_PACKAGE, version: pinned, path: rootManifest };
  if (game === undefined || game.length === 0) return null;
  const gameManifest = join(gamesDir, game, "package.json");
  if (!existsSync(gameManifest)) return null;
  try {
    const parsed = JSON.parse(readFileSync(gameManifest, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const wanted = parsed.dependencies?.[ENGINE_PACKAGE] ?? parsed.devDependencies?.[ENGINE_PACKAGE];
    if (typeof wanted !== "string" || wanted.length === 0) return null;
    if (wanted.startsWith("catalog:") || wanted.startsWith("workspace:")) return null;
    return { package: ENGINE_PACKAGE, version: wanted, path: gameManifest };
  } catch {
    return null;
  }
}

function core(version: string): { parts: number[]; pre: string | null } | null {
  const match = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(version);
  if (match === null) return null;
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null };
}

/** Semver order, enough for the pins here: a prerelease sorts below its release. */
export function compareEngineVersions(served: string, pinned: string): number | null {
  const a = core(served);
  const b = core(pinned);
  if (a === null || b === null) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index]! !== b.parts[index]!) return a.parts[index]! - b.parts[index]!;
  }
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return a.pre < b.pre ? -1 : 1;
}

/** `serving engine source 2f3b956a (@jgengine/core 0.38.1, C:\...\jgengine)` — one phrase, both facts. */
export function describeServedEngine(served: ServedEngine): string {
  const dirty = served.dirty ? " +uncommitted edits" : "";
  return `serving engine source ${served.commit ?? "unknown"}${dirty} (${served.package} ${served.version}, ${served.path})`;
}

function pinPhrase(pin: EnginePin | null): string {
  return pin === null ? "game pin unknown" : `game pins ${pin.package} ${pin.version}`;
}

/**
 * Resolve the identity, decide whether this run may proceed, and build both the printed line and
 * the refusal. `tool` prefixes the refusal so the lane knows which command stopped.
 */
export function resolveEngineIdentity(options: {
  root?: string;
  gamesDir?: string;
  game?: string;
  allowMismatch?: boolean;
  tool: string;
}): EngineIdentity {
  const root = options.root ?? repoRoot;
  // `JG_GAMES_DIR` points at a games checkout that does not sit at `<engine>/Games`.
  const gamesDir = options.gamesDir ?? process.env.JG_GAMES_DIR ?? join(root, "Games");
  const allowMismatch = options.allowMismatch === true;
  const served = readServedEngine(root);
  if (served === null) {
    return {
      served: null,
      pin: null,
      verdict: "unknown",
      allowed: true,
      mismatchAllowed: false,
      line: "engine: pin unknown — no engine checkout at " + root,
      refusal: null,
    };
  }
  const pin = readEnginePin(gamesDir, options.game);
  const order = pin === null ? null : compareEngineVersions(served.version, pin.version);
  const verdict: EngineVerdict = order === null ? "unknown" : order === 0 ? "match" : order > 0 ? "ahead" : "behind";
  const mismatchAllowed = verdict === "behind" && allowMismatch;
  const allowed = verdict !== "behind" || allowMismatch;

  const notes: string[] = [pinPhrase(pin)];
  if (verdict === "ahead") notes.push(`ahead of the pin, so this run proves source newer than ${pin!.version}`);
  if (verdict === "unknown" && pin !== null) notes.push(`cannot compare ${served.version} with the pin`);
  if (mismatchAllowed) notes.push(`older engine allowed by ${ALLOW_MISMATCH_FLAG}`);

  const line = `engine: ${describeServedEngine(served)} · ${notes.join(" · ")}`;

  const refusal = allowed
    ? null
    : [
        `${options.tool}: refusing to capture — ${describeServedEngine(served)}, ${pinPhrase(pin)}`,
        "  the dev runner serves engine source from this checkout, so this run would prove an older engine than the game runs on",
        `  update the checkout: git -C ${served.path} pull --ff-only origin beta`,
        `  or serve this older source deliberately: rerun with ${ALLOW_MISMATCH_FLAG} (recorded in the run's JSON)`,
      ].join("\n");

  return { served, pin, verdict, allowed, mismatchAllowed, line, refusal };
}

/** The audit record for a saved run; null when there is no served engine to name. */
export function engineRecord(identity: EngineIdentity): EngineRecord | null {
  if (identity.served === null) return null;
  return {
    package: identity.served.package,
    version: identity.served.version,
    commit: identity.served.commit,
    dirty: identity.served.dirty,
    path: identity.served.path,
    pin: identity.pin?.version ?? null,
    verdict: identity.verdict,
    mismatchAllowed: identity.mismatchAllowed,
  };
}
