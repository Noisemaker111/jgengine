/**
 * The readiness rule every lane command runs first.
 *
 * A tree made by a plain `git worktree add` has no node_modules and no `Games`
 * link, so `verify:fast` refused it, `shoot` failed 35 s in with "vite is
 * missing", and `bun test` failed on a missing module - each of which reads as a
 * broken change. Documentation did not prevent it because the agent picks the
 * command, so the command itself repairs the tree instead: dependencies and
 * `Games` linked from the main checkout (instant) when the locks match, an
 * install when they do not, and one line naming what was linked and at which
 * commit. A tree that is already ready pays about 15 ms and prints nothing.
 *
 * It refuses to link from a main checkout whose own install is incomplete: a
 * disk that filled mid-install leaves a store that resolves nothing, and a
 * worktree linked to it fails later in confusing ways.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ensureWorktreeReady, mainCheckoutRoot } from "./agent-worktree";
import { EXIT_NOT_SET_UP } from "./checkout-ready";
import { gamesCheckout, type GamesCheckoutState } from "./games-scope";
import { dependencyPlan, probeInstall } from "./worktree-doctor";

/** Tools the first lane commands spawn: type-checks and the dev server. */
const REQUIRED_BINARIES = [
  ["node_modules", ".bin", "tsgo"],
  ["apps", "dev", "node_modules", ".bin", "vite"],
] as const;

export type LaneState = "main" | "ready" | "linked" | "installed" | "broken";

export interface LaneOutcome {
  state: LaneState;
  /** Main checkout this tree links from, or null when `cwd` is the main checkout. */
  mainRoot: string | null;
  /** Short sha of the main checkout's HEAD, read only when something was linked. */
  mainHead: string | null;
  /** Workspace-relative paths linked or installed by this call. */
  linked: string[];
  /** Which `Games` commit this tree now reads, and the pin it is measured against. */
  games: { head: string | null; pin: string | null; state: GamesCheckoutState } | null;
  /** One line for the caller to print; empty when the tree needed nothing. */
  message: string;
  /** Why the tree cannot be made ready; only set when `state` is `broken`. */
  problem?: string;
  /** The exact command that fixes it; only set when `state` is `broken`. */
  fix?: string;
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function hasBinary(root: string, parts: readonly string[]): boolean {
  const base = join(root, ...parts);
  return ["", ".exe", ".cmd"].some((suffix) => exists(base + suffix));
}

function missingBinaries(root: string): string[] {
  return REQUIRED_BINARIES.filter((parts) => !hasBinary(root, parts)).map((parts) => parts.join("/"));
}

function git(cwd: string, args: string[]): string | null {
  try {
    const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", timeout: 60_000 });
    return result.exitCode === 0 ? (result.stdout?.toString() ?? "").trim() : null;
  } catch {
    return null;
  }
}

/** Entries `git status` reports, so linking can prove it added none of them. */
function dirtyEntries(cwd: string): string[] {
  return (git(cwd, ["status", "--porcelain"]) ?? "").split(/\r?\n/).filter(Boolean);
}

function short(sha: string | null): string {
  return sha === null || sha === "" ? "unknown" : sha.slice(0, 8);
}

export interface LaneReadyOptions {
  /** Called when dependencies cannot be linked; must install or throw. */
  install?: (target: string) => void;
  /** Ignored-file listing used to find dev-runner assets (test seam). */
  ignored?: (mainRoot: string) => string[];
}

/**
 * Make `cwd` able to run the lane's first command, or explain why it cannot.
 * Idempotent: a ready tree costs a handful of stats plus one install probe.
 */
export function ensureLaneReady(cwd: string, options: LaneReadyOptions = {}): LaneOutcome {
  const mainRoot = mainCheckoutRoot(cwd);
  if (mainRoot === null) {
    return { state: "main", mainRoot: null, mainHead: null, linked: [], games: null, message: "" };
  }

  const needed = missingBinaries(cwd);
  const gamesMissing = existsSync(join(mainRoot, "Games")) && !existsSync(join(cwd, "Games"));
  const sharedStore = (() => {
    try {
      return lstatSync(join(cwd, "node_modules")).isSymbolicLink();
    } catch {
      return false;
    }
  })();

  const mainProbe = probeInstall(mainRoot, dependencyPlan(mainRoot));
  const mainBroken = mainProbe.missing.length > 0;
  if (mainBroken && (needed.length > 0 || sharedStore)) {
    const sample = mainProbe.missing.slice(0, 3).join(", ");
    const more = mainProbe.missing.length > 3 ? ` (+${mainProbe.missing.length - 3} more)` : "";
    return {
      state: "broken",
      mainRoot,
      mainHead: null,
      linked: [],
      games: null,
      message: "",
      problem: `${mainProbe.missing.length} of ${mainProbe.expected} packages are missing from the main checkout's install (${sample}${more}), so this worktree has nothing sound to link`,
      fix: `cd ${mainRoot} && bun run worktree:doctor --repair`,
    };
  }

  if (needed.length === 0 && !gamesMissing) {
    return { state: "ready", mainRoot, mainHead: null, linked: [], games: null, message: "" };
  }

  const before = dirtyEntries(cwd);
  let installed = false;
  let readiness;
  try {
    readiness = ensureWorktreeReady(cwd, {
      install: (target) => {
        installed = true;
        (options.install ?? defaultInstall)(target);
      },
      ignored: options.ignored,
    });
  } catch (error) {
    return {
      state: "broken",
      mainRoot,
      mainHead: null,
      linked: [],
      games: null,
      message: "",
      problem: `linking failed: ${(error as Error).message}`,
      fix: `cd ${cwd} && bun install`,
    };
  }
  if (readiness === null) {
    return { state: "main", mainRoot: null, mainHead: null, linked: [], games: null, message: "" };
  }

  const added = dirtyEntries(cwd).filter((entry) => !before.includes(entry));
  if (added.length > 0) {
    return {
      state: "broken",
      mainRoot,
      mainHead: null,
      linked: [],
      games: null,
      message: "",
      problem: `linking left ${added.length} untracked path(s) that git does not ignore (${added.slice(0, 3).join(", ")})`,
      fix: `cd ${cwd} && git status`,
    };
  }

  const stillMissing = missingBinaries(cwd);
  if (stillMissing.length > 0) {
    return {
      state: "broken",
      mainRoot,
      mainHead: null,
      linked: [],
      games: null,
      message: "",
      problem: `still missing ${stillMissing.join(", ")} after linking, so this install is partial`,
      fix: `cd ${cwd} && bun run worktree:doctor --repair`,
    };
  }

  const mainHead = git(mainRoot, ["rev-parse", "--short", "HEAD"]);
  const checkout = gamesCheckout(cwd);
  const linked = [...readiness.deps, ...readiness.assets];
  const did = installed
    ? `installed dependencies (bun.lock differs from ${short(mainHead)} in the main checkout)`
    : `linked ${linked.join(", ")} from the main checkout at ${short(mainHead)}`;
  const gamesNote =
    checkout.state === "at-pin"
      ? `Games at ${short(checkout.head)} (the pin)`
      : `Games at ${short(checkout.head)}, pin is ${short(checkout.pin)}`;
  const message = `lane-ready: ${did}; ${gamesNote}${installed ? "" : "; git status unchanged"}`;

  return {
    state: installed ? "installed" : "linked",
    mainRoot,
    mainHead,
    linked,
    games: { head: checkout.head, pin: checkout.pin, state: checkout.state },
    message,
  };
}

function defaultInstall(target: string): void {
  const install = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], {
    cwd: target,
    stdout: "inherit",
    stderr: "inherit",
    timeout: 900_000,
  });
  if (install.exitCode !== 0) throw new Error(`bun install --frozen-lockfile failed (exit ${install.exitCode ?? 1})`);
}

/** Print the outcome, then the exit code a caller should use (0 unless broken). */
export function reportLaneReady(script: string, outcome: LaneOutcome, rerun = `bun run ${script}`): number {
  if (outcome.state === "broken") {
    console.error(`${script}: this worktree cannot be made ready - ${outcome.problem}.`);
    console.error(`Fix: ${outcome.fix}`);
    console.error(`Then run: ${rerun}`);
    return EXIT_NOT_SET_UP;
  }
  if (outcome.message !== "") console.log(outcome.message);
  return 0;
}

export type LaneExitOptions = LaneReadyOptions & { /** Command line to print as the retry. */ rerun?: string };

/** Heal, print, and exit 78 with the exact command when the tree cannot be made ready. */
export function ensureLaneReadyOrExit(script: string, cwd = process.cwd(), options: LaneExitOptions = {}): void {
  const code = reportLaneReady(script, ensureLaneReady(cwd, options), options.rerun);
  if (code !== 0) process.exit(code);
}

/**
 * A game's asset gaps: the packs it declares in its own source and the `art/` files
 * its models point at, neither of which a bare checkout necessarily has.
 *
 * `public/models` is gitignored and pulled by `bun run provision`, so a Games clone
 * that was never provisioned loads a scene with no models - which reads as a broken
 * game instead of a missing download. `art/` is committed, so a gap there means the
 * served clone is stale or partial.
 */
export interface GameAssetGap {
  kind: "pack" | "art";
  /** Pack id, or the art file's name. */
  name: string;
  /** Directory or file that should exist, relative to the game. */
  expected: string;
}

const ART_REF = /art\/([\w.-]+\.(?:glb|gltf|png|jpg|jpeg|svg|webp))/g;
const GAME_SOURCE = /\.(?:ts|tsx|json)$/;

function gameSourceText(dir: string): string {
  let text = "";
  const stack = [dir];
  // walk-ok: one game's own src (tens of files), not a repository scan.
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "dist") stack.push(path);
      } else if (GAME_SOURCE.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        text += readFileSync(path, "utf8");
      }
    }
  }
  return text;
}

function populated(dir: string): boolean {
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/** Packs are declared as ids in the game's source; the provisioner uses the same rule. */
export function gameAssetGaps(gameDir: string, sources: readonly { id: string; kind?: string }[]): GameAssetGap[] {
  const srcDir = join(gameDir, "src");
  if (!existsSync(srcDir)) return [];
  const text = gameSourceText(srcDir);
  const gaps: GameAssetGap[] = [];
  for (const source of sources) {
    if (!text.includes(`"${source.id}"`) && !text.includes(`'${source.id}'`) && !text.includes(`\`${source.id}\``)) continue;
    const subdir = source.kind === "material" ? "materials" : source.kind === "sprite" ? "sprites" : "models";
    const expected = `public/${subdir}/${source.id}`;
    if (!populated(join(gameDir, expected))) gaps.push({ kind: "pack", name: source.id, expected });
  }
  const art = new Set<string>();
  for (const match of text.matchAll(ART_REF)) art.add(match[1]!);
  for (const name of art) {
    const candidates = [`src/art/${name}`, `public/art/${name}`];
    if (!candidates.some((rel) => existsSync(join(gameDir, rel)))) {
      gaps.push({ kind: "art", name, expected: candidates[0]! });
    }
  }
  return gaps;
}

export interface GameAssetOutcome {
  ok: boolean;
  game: string;
  gaps: GameAssetGap[];
  /** What the fix command downloads, in plain words. */
  message: string;
}

/**
 * Refuse to serve a game whose assets are not on disk, naming the game, the missing
 * directory and the one command that fixes it. `JG_PROVISION_ASSETS=1` runs that
 * command instead, because it downloads packs.
 */
export function ensureGameAssets(
  game: string,
  gamesRoot: string,
  options: { sources?: readonly { id: string; kind?: string }[]; provision?: boolean } = {},
): GameAssetOutcome {
  const gameDir = join(gamesRoot, game);
  if (!existsSync(join(gameDir, "src"))) return { ok: true, game, gaps: [], message: "" };
  const sources = options.sources ?? assetSources();
  const gaps = gameAssetGaps(gameDir, sources);
  if (gaps.length === 0) return { ok: true, game, gaps: [], message: "" };

  const packs = gaps.filter((gap) => gap.kind === "pack").map((gap) => gap.name);
  const art = gaps.filter((gap) => gap.kind === "art");
  const what = [
    packs.length > 0 ? `${packs.length} pack(s): ${packs.join(", ")}` : "",
    art.length > 0 ? `art file(s): ${art.map((gap) => gap.name).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  const provision = `cd ${gamesRoot} && bun run provision ${game}`;

  if (options.provision === true && packs.length > 0) {
    const result = Bun.spawnSync(["bun", "run", "provision", game], {
      cwd: gamesRoot,
      stdout: "inherit",
      stderr: "inherit",
      timeout: 30 * 60_000,
    });
    const after = gameAssetGaps(gameDir, sources);
    if (result.exitCode === 0 && after.length === 0) {
      return { ok: true, game, gaps: [], message: `game-ready: provisioned ${game} (${packs.length} pack(s))` };
    }
    return {
      ok: false,
      game,
      gaps: after,
      message:
        `${game}: provisioning did not finish (exit ${result.exitCode ?? 1}); still missing ` +
        `${after.map((gap) => gap.expected).join(", ") || "nothing named"} - run \`${provision}\` and read its output`,
    };
  }

  return {
    ok: false,
    game,
    gaps,
    message:
      `${game}: assets are not on disk - ${gaps.map((gap) => gap.expected).join(", ")} missing. ` +
      `Fix: ${provision} (downloads ${what}, needs the network; ${packs.length > 0 ? "nothing is downloaded unless you run it" : "art is committed, so a git fetch may be enough"})`,
  };
}

/** The pack ids the asset package owns, loaded from the engine's own source. */
function assetSources(): readonly { id: string; kind?: string }[] {
  try {
    const index = join(import.meta.dir, "..", "packages", "assets", "src", "sources", "index.ts");
    const loaded = require(index) as { sources: readonly { id: string; kind?: string }[] };
    return loaded.sources;
  } catch {
    return [];
  }
}
