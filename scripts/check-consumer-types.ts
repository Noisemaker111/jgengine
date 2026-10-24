/**
 * A release is published only when a real adopter compiles against the packed tarballs.
 *
 * `check-release-artifacts` proves a published package installs and every declared subpath
 * resolves; it never compiles code that *uses* those types, so 0.38.2 shipped a patch that
 * narrowed `GameMenu.style`/`detailStyle` to `CSSProperties & Record<...>` and made
 * `SceneCaptureBinding`'s props parameter optional. Every tarball installed, every subpath
 * resolved, and Harbor Heat and Beacon Bastion then failed `check-types` on the games' `check-types`.
 *
 * This packs the release candidate, installs the tarballs into a scratch copy of the
 * `JGengine-games` checkout, and runs the games' own `check-types`. Nothing is published when it
 * fails, and a run that could not check (no games checkout, no install) is `unknown`, never a pass.
 *
 *   bun run check:consumer-types                     # the checkout's version, games beside the repo
 *   bun run check:consumer-types --games ../jgengine-games
 *   bun run check:consumer-types --version 0.38.4 --keep
 *   bun run check:consumer-types --json
 *
 * Exit codes: 0 the adopter compiles, 1 the adopter does not compile, 2 the check could not run.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { packageDir, publishedPackages } from "./exportManifest";
import { printHelpIfAsked } from "./script-help";

export const EXIT_PASS = 0;
export const EXIT_TYPE_FAILURE = 1;
export const EXIT_UNKNOWN = 2;

const SCOPE = "@jgengine/";
const INSTALL_TIMEOUT_MS = 900_000;
const TYPECHECK_TIMEOUT_MS = 900_000;

export type Outcome = "pass" | "type-failure" | "unknown";

export interface GamesCheckout {
  path: string;
  /** How the directory was found, for the log line. */
  source: string;
  /** The commit the adopter is copied from: the pin when the checkout is a git repo, else `HEAD`. */
  ref: string;
}

export interface ResolveGamesResult {
  checkout: GamesCheckout | null;
  tried: string[];
}

/** Where the games checkout is, in the order a release trusts it. */
export function resolveGames(options: {
  explicit?: string;
  env?: string;
  root: string;
  exists?: (path: string) => boolean;
  pin?: string | null;
}): ResolveGamesResult {
  const exists = options.exists ?? existsSync;
  const candidates: { path: string; source: string }[] = [];
  if (options.explicit !== undefined && options.explicit !== "") candidates.push({ path: resolve(options.explicit), source: "--games" });
  if (options.env !== undefined && options.env !== "") candidates.push({ path: resolve(options.env), source: "JGENGINE_GAMES_DIR" });
  const named = candidates.length;
  candidates.push({ path: join(options.root, "Games"), source: "Games/ at the pin in scripts/games-ref.txt" });
  candidates.push({ path: resolve(options.root, "..", "jgengine-games"), source: "jgengine-games beside this repo" });
  const pin = options.pin ?? null;
  const trusted = named > 0 ? candidates.slice(0, named) : candidates;
  for (const candidate of trusted) {
    if (!exists(join(candidate.path, "package.json"))) continue;
    return { checkout: { ...candidate, ref: pin ?? "HEAD" }, tried: candidates.map((entry) => entry.path) };
  }
  return { checkout: null, tried: trusted.map((entry) => entry.path) };
}

/** The games commit a release ships against: the engine's pin, never whatever a working copy happens to hold. */
export function readGamesPin(root: string, read: (path: string) => string = (path) => readFileSync(path, "utf8")): string | null {
  try {
    const ref = read(join(root, "scripts", "games-ref.txt")).trim();
    return /^[0-9a-f]{40}$/.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

export interface CatalogSwap {
  manifest: Record<string, unknown>;
  /** Catalog entries replaced with a packed tarball. */
  swapped: { name: string; from: string; to: string }[];
  /** Catalog entries left alone because this checkout packs no tarball for them. */
  kept: string[];
}

/**
 * Point every `@jgengine/*` catalog entry at the tarball packed from this checkout, so the adopter
 * compiles the exact bytes a release would publish. `tarballs` maps package name to a path that is
 * valid from the games root.
 */
/**
 * Point every `@jgengine/*` catalog entry at the tarball packed from this checkout, so the adopter
 * compiles the exact bytes a release would publish. `tarballs` maps package name to a path that is
 * expressed relative to the adopter root.
 *
 * The same names go into `overrides` because a packed tarball keeps its own `^<version>` dependency
 * ranges: `@jgengine/editor` depends on `@jgengine/core@^0.38.4`, and before the release is published
 * that range resolves against a registry that does not have it yet. Without the override the install
 * fails with `No version matching "^0.38.4"` and the release stops, which is what happened to 0.38.4's
 * first publish run.
 */
export function swapCatalog(manifest: Record<string, unknown>, tarballs: ReadonlyMap<string, string>): CatalogSwap {
  const next = structuredClone(manifest) as Record<string, any>;
  const catalog = next.workspaces?.catalog as Record<string, string> | undefined;
  const swapped: CatalogSwap["swapped"] = [];
  const kept: string[] = [];
  if (catalog === undefined) return { manifest: next, swapped, kept };
  const overrides = { ...(next.overrides as Record<string, string> | undefined) };
  for (const [name, current] of Object.entries(catalog)) {
    const tarball = tarballs.get(name);
    if (tarball === undefined) {
      if (name.startsWith(SCOPE)) kept.push(name);
      continue;
    }
    catalog[name] = tarball;
    swapped.push({ name, from: current, to: tarball });
  }
  // A packed package the adopter does not name directly (`@jgengine/navbake`, reached through
  // `@jgengine/editor`) still needs its `^<version>` range answered from the tarball.
  for (const [name, tarball] of tarballs) overrides[name] = tarball;
  if (Object.keys(overrides).length > 0) next.overrides = overrides;
  return { manifest: next, swapped, kept };
}

export interface TypeFailure {
  game: string;
  /** Workspace-relative file, so the report names the exact source. */
  file: string;
  line: number | null;
  code: string | null;
  message: string;
  /** The published package that declares the type the error is about, when one can be named. */
  owner: string | null;
  raw: string;
}

/**
 * Type errors from a `tsgo --noEmit` run, attributed to the workspace whose source they are in.
 * `bun --filter` prefixes each line with `<workspace> check-types:`.
 */
export function parseTypeFailures(output: string, workspaces: readonly string[] = []): TypeFailure[] {
  const failures: TypeFailure[] = [];
  for (const line of output.split(/\r?\n/)) {
    const at = line.indexOf("): error TS");
    if (at < 0) continue;
    const body = line.slice(0, at + 1);
    const match = /([^\s()]+\.(?:ts|tsx))\((\d+),(\d+)\)$/.exec(body);
    if (match === null) continue;
    const before = body.slice(0, body.length - match[0].length).replace(/:\s*$/, "").trim();
    const known = workspaces.find((name) => line.includes(`${name} check-types`));
    const codeAndMessage = /error (TS\d+): (.*)$/.exec(line.slice(at + 1));
    failures.push({
      game: known ?? (before === "" ? "" : (before.split(/\s+/).at(-1) ?? before)),
      file: match[1]!,
      line: Number(match[2]),
      code: codeAndMessage?.[1] ?? null,
      message: codeAndMessage?.[2] ?? line.slice(at + 2).trim(),
      owner: null,
      raw: line.trim(),
    });
  }
  return failures;
}

/**
 * Name the published package that declares the type an error is about, so the report says which
 * tarball narrowed it. Package names win over `react`'s own types because they are scanned first.
 */
export function attributeOwners(failures: TypeFailure[], packages: ReadonlyMap<string, string>): void {
  const wanted = new Set<string>();
  for (const failure of failures) for (const match of failure.message.matchAll(/\b([A-Z][A-Za-z0-9_]{2,})\b/g)) wanted.add(match[1]!);
  if (wanted.size === 0) return;
  const found = new Map<string, string>();
  for (const [name, dist] of packages) {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dist, { recursive: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = String(entry);
      if (!file.endsWith(".d.ts")) continue;
      const text = readFileSync(join(dist, file), "utf8");
      for (const identifier of wanted) {
        if (found.has(identifier)) continue;
        if (new RegExp(`\\b(?:interface|type|class|function|const|enum)\\s+${identifier}\\b`).test(text)) found.set(identifier, name);
      }
    }
  }
  for (const failure of failures) {
    for (const match of failure.message.matchAll(/\b([A-Z][A-Za-z0-9_]{2,})\b/g)) {
      const owner = found.get(match[1]!);
      if (owner !== undefined) {
        failure.owner = owner;
        break;
      }
    }
  }
}

export interface ProcResult {
  status: number;
  output: string;
}

export interface RunOptions {
  root: string;
  version?: string;
  games?: string;
  env?: string;
  ref?: string;
  scratchDir?: string;
  keep?: boolean;
  offline?: boolean;
  /** Test seam: package directories to pack instead of the published set. */
  packages?: readonly string[];
  log?: (line: string) => void;
  exists?: (path: string) => boolean;
  pack?: (dir: string, outDir: string) => string;
  install?: (cwd: string) => ProcResult;
  typecheck?: (cwd: string) => ProcResult;
  materialize?: (games: GamesCheckout, dest: string) => void;
  now?: () => number;
}

export interface RunReport {
  outcome: Outcome;
  version: string | null;
  /** The adopter checkout, when one was found. */
  games: string | null;
  /** The games commit the adopter was copied from. */
  pin: string | null;
  swapped: { name: string; from: string; to: string }[];
  kept: string[];
  failures: TypeFailure[];
  /** Why the check could not run, or what the adopter reported. */
  reason: string | null;
  scratch: string | null;
  /** Wall time by stage, in seconds. */
  seconds: Record<string, number>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function outputOf(result: { stdout?: string | null; stderr?: string | null }): string {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

/** `npm pack` in one package, returning the tarball's absolute path. */
export function packWithNpm(dir: string, outDir: string): string {
  const out = execFileSync("npm", ["pack", "--pack-destination", outDir, "--json"], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300_000,
  });
  const entry = (JSON.parse(out) as { filename: string }[])[0];
  if (entry === undefined) throw new Error(`npm pack in ${dir} named no tarball`);
  return join(outDir, entry.filename);
}

export function installWithBun(cwd: string, offline = false): ProcResult {
  const result = spawnSync("bun", ["install", ...(offline ? ["--offline"] : [])], {
    cwd,
    encoding: "utf8",
    timeout: INSTALL_TIMEOUT_MS,
    shell: process.platform === "win32",
  });
  return { status: result.status ?? 1, output: outputOf(result) };
}

export function typecheckWithBun(cwd: string): ProcResult {
  const result = spawnSync("bun", ["--filter=*", "run", "check-types"], {
    cwd,
    encoding: "utf8",
    timeout: TYPECHECK_TIMEOUT_MS,
    shell: process.platform === "win32",
  });
  return { status: result.status ?? 1, output: outputOf(result) };
}

/**
 * Copy the games checkout at `ref` — source only, never `node_modules` — so the adopter is the pin
 * a release ships against and the real checkout is never touched.
 */
export function materializeGames(games: GamesCheckout, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const archive = join(dest, "..", "games.tar");
  const hasObject = spawnSync("git", ["-C", games.path, "cat-file", "-e", `${games.ref}^{commit}`], { encoding: "utf8" });
  if (hasObject.status !== 0) {
    spawnSync("git", ["-C", games.path, "fetch", "--quiet", "--depth", "1", "origin", games.ref], { encoding: "utf8", timeout: 120_000 });
  }
  const archived = spawnSync("git", ["-C", games.path, "archive", "--format=tar", "-o", archive, games.ref], {
    encoding: "utf8",
    timeout: 300_000,
  });
  if (archived.status !== 0 || !existsSync(archive)) {
    rmSync(archive, { force: true });
    throw new Error(archived.stderr.trim() || `git archive ${games.ref} in ${games.path} failed`);
  }
  execFileSync("tar", ["-xf", "games.tar", "-C", dest.split(/[/\\]/).pop()!], {
    cwd: join(dest, ".."),
    timeout: 300_000,
  });
  rmSync(archive, { force: true });
}

/** Workspace package names, so a diagnostic line can name the game it came from. */
function workspaceNames(gamesRoot: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(gamesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = join(gamesRoot, entry.name, "package.json");
    if (!existsSync(manifest)) continue;
    try {
      const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string };
      if (typeof parsed.name === "string") names.push(parsed.name);
    } catch {
      continue;
    }
  }
  return names;
}

/**
 * Pack this checkout, install the tarballs into a scratch adopter, and compile it. Every path that
 * cannot prove the adopter compiles returns `unknown` rather than a pass.
 */
export function runConsumerTypes(options: RunOptions): RunReport {
  const log = options.log ?? (() => {});
  const now = options.now ?? Date.now;
  const exists = options.exists ?? existsSync;
  const seconds: Record<string, number> = {};
  const report: RunReport = {
    outcome: "unknown",
    version: options.version ?? null,
    games: null,
    pin: null,
    swapped: [],
    kept: [],
    failures: [],
    reason: null,
    scratch: null,
    seconds,
  };
  const stage = <T>(name: string, body: () => T): T => {
    const started = now();
    try {
      return body();
    } finally {
      seconds[name] = Math.round((now() - started) / 100) / 10;
    }
  };
  const unknown = (reason: string): RunReport => {
    report.outcome = "unknown";
    report.reason = reason;
    return report;
  };

  const games = resolveGames({ explicit: options.games, env: options.env, root: options.root, exists, pin: options.ref ?? readGamesPin(options.root) });
  if (games.checkout === null) {
    return unknown(`no JGengine-games checkout (tried ${games.tried.join(", ")})`);
  }
  report.games = games.checkout.path;
  report.pin = games.checkout.ref;
  log(`check-consumer-types: adopter ${games.checkout.path} at ${games.checkout.ref} (${games.checkout.source})`);

  const catalogPackages: { name: string; dir: string; version: string }[] = [];
  try {
    for (const dir of options.packages ?? publishedPackages.map((pkg) => packageDir(pkg))) {
      const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name: string; version: string };
      if (!exists(join(dir, "dist"))) continue;
      catalogPackages.push({ name: manifest.name, dir, version: manifest.version });
    }
  } catch (error) {
    return unknown(`reading this checkout's package manifests failed: ${message(error)}`);
  }
  const version = report.version ?? catalogPackages.find((pkg) => pkg.name === `${SCOPE}core`)?.version ?? null;
  report.version = version;
  if (version === null) return unknown("no version to check: packages/*/package.json holds none and --version was not given");

  const scratch = options.scratchDir ?? join(options.root, ".scratch", "consumer-types", version);
  report.scratch = options.keep === true ? scratch : null;
  rmSync(scratch, { recursive: true, force: true });
  const tarballDir = join(scratch, "tarballs");
  mkdirSync(tarballDir, { recursive: true });
  const gamesRoot = join(scratch, "games");

  try {
    stage("materialize", () => (options.materialize ?? materializeGames)(games.checkout!, gamesRoot));
  } catch (error) {
    return unknown(`copying ${games.checkout.path} at ${games.checkout.ref} failed: ${message(error)}`);
  }

  const manifestPath = join(gamesRoot, "package.json");
  if (!exists(manifestPath)) return unknown(`${gamesRoot} has no package.json after copying the games checkout`);
  let original: Record<string, unknown>;
  try {
    original = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    return unknown(`the games checkout at ${games.checkout.path} (@ ${games.checkout.ref}) has an unreadable package.json: ${message(error)}`);
  }
  const catalog = ((original.workspaces as any)?.catalog ?? {}) as Record<string, string>;
  // Every packed package is installed, not only the ones the adopter names: a catalog package's own
  // manifest depends on the rest of the lockstep set (`@jgengine/editor` on `navbake` and `assets`),
  // and an unpacked one would resolve against a registry that does not have this version yet.
  const unbuilt = Object.keys(catalog).filter(
    (name) => name.startsWith(SCOPE) && !catalogPackages.some((pkg) => pkg.name === name),
  );
  if (unbuilt.length > 0) {
    return unknown(`this checkout has no build for ${unbuilt.join(", ")}, which the games catalog installs; run bun run build`);
  }
  const toPack = catalogPackages;

  const packed = new Map<string, string>();
  try {
    stage("pack", () => {
      const pack = options.pack ?? packWithNpm;
      for (const pkg of toPack) packed.set(pkg.name, pack(pkg.dir, tarballDir));
    });
  } catch (error) {
    return unknown(`packing this checkout failed: ${message(error)}`);
  }
  log(`check-consumer-types: packed ${packed.size} package(s) at ${version}: ${[...packed.keys()].join(", ")}`);

  const relativeTarballs = new Map<string, string>();
  for (const [name, path] of packed) relativeTarballs.set(name, `file:${relativeFrom(gamesRoot, path)}`);
  const swap = swapCatalog(original, relativeTarballs);
  report.swapped = swap.swapped;
  report.kept = swap.kept;
  if (swap.swapped.length === 0) {
    return unknown(`the games catalog at ${games.checkout.path} names no package this checkout packs (catalog: ${Object.keys(catalog).join(", ")})`);
  }
  writeFileSync(manifestPath, `${JSON.stringify(swap.manifest, null, 2)}\n`);
  rmSync(join(gamesRoot, "bun.lock"), { force: true });
  log(`check-consumer-types: catalog -> ${swap.swapped.map((entry) => `${entry.name}@${version}`).join(", ")}`);

  const install = stage("install", () => (options.install ?? ((cwd: string) => installWithBun(cwd, options.offline)))(gamesRoot));
  if (install.status !== 0) return unknown(`installing the packed tarballs failed:\n${install.output.split(/\r?\n/).slice(-20).join("\n")}`);

  const notSwapped: string[] = [];
  let verified = 0;
  for (const entry of swap.swapped) {
    for (const game of readdirSync(gamesRoot, { withFileTypes: true })) {
      const installed = join(gamesRoot, game.name, "node_modules", ...entry.name.split("/"), "package.json");
      if (!exists(installed)) continue;
      const version = (JSON.parse(readFileSync(installed, "utf8")) as { version?: string }).version;
      if (version !== report.version) notSwapped.push(`${entry.name} is ${version ?? "versionless"} in ${game.name}`);
      else verified += 1;
    }
  }
  if (notSwapped.length > 0) {
    return unknown(`the adopter did not install the packed tarballs: ${notSwapped.join(", ")}`);
  }
  if (verified === 0) {
    return unknown(`the adopter installed none of the packed tarballs, so the install proved nothing: ${swap.swapped.map((entry) => entry.name).join(", ")}`);
  }

  const workspaces = workspaceNames(gamesRoot);
  const typecheck = stage("typecheck", () => (options.typecheck ?? typecheckWithBun)(gamesRoot));
  report.failures = parseTypeFailures(typecheck.output, workspaces);
  if (typecheck.status !== 0 && report.failures.length === 0) {
    return unknown(`the adopter's check-types failed without a type error to report:\n${typecheck.output.split(/\r?\n/).slice(-20).join("\n")}`);
  }
  if (report.failures.length > 0) {
    attributeOwners(
      report.failures,
      new Map(toPack.map((pkg) => [pkg.name, join(pkg.dir, "dist")])),
    );
  }
  report.outcome = report.failures.length > 0 ? "type-failure" : "pass";
  if (options.keep !== true) rmSync(scratch, { recursive: true, force: true });
  return report;
}

/** A path relative to `from`, with forward slashes, which npm's `file:` spec accepts on every OS. */
function relativeFrom(from: string, to: string): string {
  const base = resolve(from).replaceAll("\\", "/").replace(/\/$/, "");
  const target = resolve(to).replaceAll("\\", "/");
  const baseParts = base.split("/");
  const targetParts = target.split("/");
  if (baseParts[0]?.toLowerCase() !== targetParts[0]?.toLowerCase()) return target;
  let shared = 0;
  while (shared < baseParts.length && shared < targetParts.length && baseParts[shared]!.toLowerCase() === targetParts[shared]!.toLowerCase()) shared += 1;
  const up = new Array(baseParts.length - shared).fill("..");
  return [...up, ...targetParts.slice(shared)].join("/");
}

export function reportLines(report: RunReport): { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const cost = Object.entries(report.seconds).map(([name, value]) => `${name} ${value}s`).join(", ");
  if (report.outcome === "pass") {
    stdout.push(`check-consumer-types ok: ${report.games} compiled ${report.swapped.length} packed package(s) at ${report.version} against the adopter's check-types`);
  } else if (report.outcome === "type-failure") {
    stderr.push(`check-consumer-types FAILED at ${report.version}: the adopter does not compile against the packed tarballs, so nothing is published.`);
    for (const failure of report.failures) {
      const where = [failure.game, failure.file].filter((part) => part !== "").join(" ");
      const owner = failure.owner === null ? "" : ` in ${failure.owner}`;
      stderr.push(`  ${where}(${failure.line ?? "?"}): ${failure.code ?? "error"}: ${failure.message}${owner}`);
    }
    stderr.push("check-consumer-types: a public type narrowed in this release is the usual cause; widen it back or cut a major.");
  } else {
    stderr.push(`check-consumer-types UNKNOWN at ${report.version ?? "(no version)"}: ${report.reason}`);
    stderr.push("check-consumer-types: this run proved nothing about the adopter, so the release stops. Nothing is published on an unknown adopter.");
  }
  if (cost !== "") stdout.push(`check-consumer-types: ${cost}`);
  if (report.kept.length > 0) stdout.push(`check-consumer-types: not packed here, left at the catalog version: ${report.kept.join(", ")}`);
  if (report.scratch !== null) stdout.push(`check-consumer-types: kept the scratch adopter at ${report.scratch}`);
  return { stdout, stderr };
}

function main(): number {
  const args = process.argv.slice(2);
  if (
    printHelpIfAsked("check-consumer-types", {
      summary: "Publish only when a real adopter compiles against the packed tarballs.",
      usage: "bun run check:consumer-types [--version <x.y.z>] [--games <path>] [--offline] [--keep] [--json]",
      flags: [
        { flag: "--version <x.y.z>", detail: "version to pack and install (default: packages/core)" },
        { flag: "--games <path>", detail: "the JGengine-games checkout (default: Games/, then ../jgengine-games)" },
        { flag: "--offline", detail: "install from bun's cache only" },
        { flag: "--keep", detail: "keep the scratch adopter for inspection" },
        { flag: "--json", detail: "print the report as JSON" },
      ],
      example: "bun run check:consumer-types --games ../jgengine-games",
      exits: ["0 the adopter compiles", "1 the adopter does not compile", "2 the check could not run, which is never a pass"],
    })
  )
    return EXIT_PASS;
  const value = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args[at + 1];
  };
  const report = runConsumerTypes({
    root: fileURLToPath(new URL("..", import.meta.url)),
    version: value("--version"),
    games: value("--games"),
    env: process.env.JGENGINE_GAMES_DIR,
    keep: args.includes("--keep"),
    offline: args.includes("--offline"),
    log: (line) => console.log(line),
  });
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const lines = reportLines(report);
    for (const line of lines.stdout) console.log(line);
    for (const line of lines.stderr) console.error(line);
  }
  if (report.outcome === "pass") return EXIT_PASS;
  return report.outcome === "type-failure" ? EXIT_TYPE_FAILURE : EXIT_UNKNOWN;
}

if (import.meta.main) process.exit(main());
