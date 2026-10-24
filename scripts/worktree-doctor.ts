/**
 * Report and repair agent worktree installs across the engine and games repos.
 *
 * A disk that fills during `bun install` leaves a half-hardlinked node_modules:
 * the directory exists, some `@jgengine/*` entries do not, and the tree fails
 * later with confusing resolution errors instead of a loud install failure.
 * Nothing in the repo noticed - this does.
 *
 *   bun run worktree:doctor                  table of every worktree, worst first
 *   bun run worktree:doctor --repair         repair broken installs in clean trees, then re-report
 *   bun run worktree:doctor --self           only this tree; exit 1 when its install is broken (ship:preflight)
 *   bun run worktree:doctor --games <path>   sibling games repo (default ../jgengine-games)
 *
 * Exit code is 1 while any install is still broken. Repair runs only in a clean
 * tree; it never touches a branch, a worktree or uncommitted work.
 */
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, statfsSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { linkAssets } from "./agent-worktree";
import { gamesCheckout, type GamesCheckoutState } from "./games-scope";

export type RepoKind = "engine" | "games";

const short = (sha: string | null | undefined): string => (sha === null || sha === undefined ? "unknown" : sha.slice(0, 7));

export interface WorktreeRef {
  path: string;
  branch: string | null;
  locked: boolean;
}

export interface WorktreeReport {
  repo: string;
  kind: RepoKind;
  name: string;
  path: string;
  branch: string | null;
  /** false when the directory is gone but git still registers the worktree. */
  directory: boolean;
  nodeModules: boolean;
  expectedDeps: number;
  missingDeps: string[];
  /** `@jgengine/*` from the registry (games repo); empty where they resolve from source. */
  expectedJge: number;
  missingJge: string[];
  /** Informational: in-repo tests resolve `@jgengine/*` to source, so no build is required. */
  dist: boolean | null;
  lock: "match" | "differs" | "missing";
  staleInstall: boolean;
  dirty: boolean;
  changes: number;
  /** Which `Games/` commit this tree's game gates read, against the pin (engine worktrees only). */
  games?: GamesCheckoutState | null;
  gamesHead?: string | null;
  gamesPin?: string | null;
  severity: number;
}

/** The tree cannot resolve its own dependencies: a rerun fails in confusing ways. */
export const BROKEN = 4;

/** Installing is what fills the disk, so repair stops before repeating tonight's failure. */
const MIN_FREE_GB = 10;

export function parseWorktreeList(porcelain: string): WorktreeRef[] {
  const refs: WorktreeRef[] = [];
  for (const block of porcelain.split(/\r?\n\r?\n/)) {
    let path = "";
    let branch: string | null = null;
    let locked = false;
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length).trim();
      else if (line.startsWith("branch ")) branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
      else if (line === "detached") branch = null;
      else if (line === "locked" || line.startsWith("locked ")) locked = true;
    }
    if (path) refs.push({ path, branch, locked });
  }
  return refs;
}

export interface DepsPlan {
  root: string[];
  workspaces: { dir: string; deps: string[] }[];
}

/**
 * Which dependencies each tree must be able to resolve: the root manifest's own
 * dependencies at the root, and every workspace package's `dependencies` inside
 * that package. Bun installs the engine's third-party packages per workspace and
 * the games' `@jgengine/*` inside each game, so a root-only check misses the
 * install half that actually broke.
 */
export function dependencyPlan(root: string): DepsPlan {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    workspaces?: string[] | { packages?: string[] };
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const own = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ];
  const patterns = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : (manifest.workspaces?.packages ?? []);
  const workspaces: DepsPlan["workspaces"] = [];
  for (const pattern of patterns) {
    for (const dir of expandWorkspacePattern(root, pattern)) {
      const manifestPath = join(root, dir, "package.json");
      if (!existsSync(manifestPath)) continue;
      try {
        const pkg = JSON.parse(readFileSync(manifestPath, "utf8")) as { dependencies?: Record<string, string> };
        const deps = Object.keys(pkg.dependencies ?? {});
        if (deps.length > 0) workspaces.push({ dir, deps });
      } catch {}
    }
  }
  return { root: [...new Set(own)].sort(), workspaces };
}

function expandWorkspacePattern(root: string, pattern: string): string[] {
  if (!pattern.includes("*")) {
    return existsSync(join(root, pattern, "package.json")) ? [pattern] : [];
  }
  const segments = pattern.split("/");
  const last = segments.pop() ?? "*";
  const base = segments.join("/");
  const baseDir = join(root, base);
  if (!existsSync(baseDir)) return [];
  const matcher = new RegExp(
    `^${last.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
  );
  return readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && matcher.test(entry.name))
    .map((entry) => (base ? `${base}/${entry.name}` : entry.name));
}


/** Resolve through node_modules the way a test or typecheck would, symlinks included. */
export function missingPackages(worktree: string, expected: string[]): string[] {
  return expected.filter((name) => !existsSync(join(worktree, "node_modules", name, "package.json")));
}

export function probeInstall(
  worktree: string,
  plan: DepsPlan,
): { expected: number; missing: string[]; expectedJge: number; missingJge: string[] } {
  const missing: string[] = [];
  let expected = 0;
  for (const name of plan.root) {
    expected += 1;
    if (!existsSync(join(worktree, "node_modules", name, "package.json"))) missing.push(name);
  }
  for (const workspace of plan.workspaces) {
    for (const name of workspace.deps) {
      expected += 1;
      if (!existsSync(join(worktree, workspace.dir, "node_modules", name, "package.json"))) {
        missing.push(`${workspace.dir}/${name}`);
      }
    }
  }
  const jgeNames = [
    ...plan.root.filter((name) => name.startsWith("@jgengine/")),
    ...plan.workspaces.flatMap((workspace) => workspace.deps.filter((name) => name.startsWith("@jgengine/"))),
  ];
  return {
    expected,
    missing,
    expectedJge: jgeNames.length,
    missingJge: missing.filter((entry) => entry.includes("@jgengine/")),
  };
}

export function lockVerdict(worktree: string, parentLock: string | null): "match" | "differs" | "missing" {
  const lockPath = join(worktree, "bun.lock");
  if (!existsSync(lockPath)) return "missing";
  if (parentLock === null) return "match";
  return readFileSync(lockPath, "utf8") === parentLock ? "match" : "differs";
}

/** An install older than its lockfile predates a dependency change. */
export function installStale(worktree: string): boolean {
  try {
    const lock = statSync(join(worktree, "bun.lock")).mtimeMs;
    const modules = statSync(join(worktree, "node_modules")).mtimeMs;
    return lock > modules;
  } catch {
    return false;
  }
}

export function severityOf(row: Omit<WorktreeReport, "severity">): number {
  if (!row.directory) return 6;
  if (!row.nodeModules) return 5;
  if (row.missingDeps.length > 0) return BROKEN;
  if (row.games === "stale" || row.games === "absent" || row.games === "unknown-head") return BROKEN;
  if (row.staleInstall) return 2;
  if (row.dirty) return 1;
  return 0;
}

/** Whether a rerun of `bun install` is what this row needs; a games row never is. */
export function installBroken(row: WorktreeReport): boolean {
  return row.directory && (!row.nodeModules || row.missingDeps.length > 0);
}

/** A worktree whose game gates read no Games/ commit at all: repairable with one junction. */
export function gamesUnlinked(row: WorktreeReport): boolean {
  return row.kind === "engine" && row.directory && (row.games === "absent" || row.games === "unknown-head");
}

export function statusOf(severity: number): string {
  if (severity >= 6) return "GONE";
  if (severity >= 5) return "NO-INSTALL";
  if (severity >= BROKEN) return "BROKEN";
  if (severity === 2) return "warn";
  return "ok";
}

/** Worst first: install severity, then dirty ahead of clean, then repo and name. */
export function sortReports(rows: WorktreeReport[]): WorktreeReport[] {
  return [...rows].sort(
    (a, b) =>
      b.severity - a.severity ||
      Number(b.dirty) - Number(a.dirty) ||
      a.repo.localeCompare(b.repo) ||
      a.name.localeCompare(b.name),
  );
}

function cell(row: WorktreeReport): string[] {
  const games =
    row.kind !== "engine"
      ? "-"
      : row.games === undefined || row.games === null
        ? "-"
        : row.games === "at-pin"
          ? "pin"
          : row.games === "stale"
            ? `stale ${short(row.gamesHead ?? null)}`
            : row.games === "override"
              ? "override"
              : row.games;
  if (!row.directory) return [row.repo, row.name, row.branch ?? "detached", "gone", "-", "-", "-", "-", "-", "-", statusOf(row.severity)];
  const install = row.nodeModules ? (row.staleInstall ? "ok(stale)" : "ok") : "missing";
  const deps = row.expectedDeps === 0 ? "-" : `${row.expectedDeps - row.missingDeps.length}/${row.expectedDeps}`;
  const jge = row.expectedJge === 0 ? "-" : `${row.expectedJge - row.missingJge.length}/${row.expectedJge}`;
  const dist = row.dist === null ? "-" : row.dist ? "ok" : "missing";
  return [
    row.repo,
    row.name,
    row.branch ?? "detached",
    install,
    deps,
    jge,
    dist,
    row.lock,
    row.dirty ? `dirty(${row.changes})` : "clean",
    games,
    statusOf(row.severity),
  ];
}

const HEADER = ["REPO", "WORKTREE", "BRANCH", "INSTALL", "DEPS", "JGE", "DIST", "LOCK", "TREE", "GAMES", "STATUS"];

export function formatTable(rows: WorktreeReport[]): string {
  const body = sortReports(rows).map(cell);
  const widths = HEADER.map((title, column) =>
    Math.max(title.length, ...body.map((line) => line[column]!.length)),
  );
  const render = (line: string[]) =>
    line.map((value, column) => value.padEnd(widths[column]!)).join("  ").trimEnd();
  return [render(HEADER), ...body.map(render)].join("\n");
}

export function planRepair(rows: WorktreeReport[]): { repair: WorktreeReport[]; refused: WorktreeReport[] } {
  const broken = rows.filter((row) => row.severity >= BROKEN && row.directory && installBroken(row));
  return {
    repair: broken.filter((row) => !row.dirty),
    refused: broken.filter((row) => row.dirty),
  };
}

/** `--only foo,bar` picks worktrees by substring of `repo/name`; no patterns means every repairable one. */
export function filterOnly(rows: WorktreeReport[], patterns: string[]): WorktreeReport[] {
  if (patterns.length === 0) return rows;
  return rows.filter((row) =>
    patterns.some((pattern) => `${row.repo}/${row.name}`.toLowerCase().includes(pattern.toLowerCase())),
  );
}

function git(cwd: string, args: string[], timeoutMs = 120_000): { ok: boolean; out: string } {
  try {
    const result = Bun.spawnSync(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      timeout: timeoutMs,
    });
    return { ok: result.exitCode === 0, out: (result.stdout?.toString() ?? "").trim() };
  } catch {
    return { ok: false, out: "" };
  }
}

export function buildReport(input: {
  repo: string;
  kind: RepoKind;
  mainRoot: string;
  ref: WorktreeRef;
  plan: DepsPlan;
  parentLock: string | null;
}): WorktreeReport {
  const { repo, kind, mainRoot, ref, plan, parentLock } = input;
  const name = resolve(ref.path) === resolve(mainRoot) ? "(root)" : basename(ref.path);
  const directory = existsSync(ref.path);
  const planned = plan.root.length + plan.workspaces.reduce((sum, workspace) => sum + workspace.deps.length, 0);
  if (!directory) {
    const gone: Omit<WorktreeReport, "severity"> = {
      repo,
      kind,
      name,
      path: ref.path,
      branch: ref.branch,
      directory,
      nodeModules: false,
      expectedDeps: planned,
      missingDeps: [],
      expectedJge: 0,
      missingJge: [],
      dist: null,
      lock: "missing",
      staleInstall: false,
      dirty: false,
      changes: 0,
    };
    return { ...gone, severity: severityOf(gone) };
  }
  const nodeModules = existsSync(join(ref.path, "node_modules"));
  const status = git(ref.path, ["status", "--porcelain"]);
  const changes = status.out === "" ? 0 : status.out.split(/\r?\n/).filter(Boolean).length;
  const probe = probeInstall(ref.path, plan);
  const checkout = kind === "engine" ? gamesCheckout(ref.path) : null;
  const base: Omit<WorktreeReport, "severity"> = {
    repo,
    kind,
    name,
    path: ref.path,
    branch: ref.branch,
    directory,
    nodeModules,
    expectedDeps: probe.expected,
    missingDeps: probe.missing,
    expectedJge: probe.expectedJge,
    missingJge: probe.missingJge,
    dist: kind === "engine" ? existsSync(join(ref.path, "packages", "core", "dist", "index.js")) : null,
    lock: lockVerdict(ref.path, parentLock),
    staleInstall: installStale(ref.path),
    dirty: changes > 0,
    changes,
    games: checkout?.state ?? null,
    gamesHead: checkout?.head ?? null,
    gamesPin: checkout?.pin ?? null,
  };
  return { ...base, severity: severityOf(base) };
}

function readParentLock(root: string): string | null {
  const lockPath = join(root, "bun.lock");
  return existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null;
}

function detectKind(root: string): RepoKind {
  return existsSync(join(root, "packages", "core", "package.json")) ? "engine" : "games";
}

/** The main checkout, whichever worktree asked: `.git` of a linked worktree is a file. */
function mainRootOf(worktree: string): string {
  const common = git(worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common.ok || common.out === "") return worktree;
  return dirname(common.out);
}

function scanRepo(gitRoot: string): WorktreeReport[] {
  const listed = git(gitRoot, ["worktree", "list", "--porcelain"]);
  if (!listed.ok) return [];
  const mainRoot = mainRootOf(gitRoot);
  const root = existsSync(join(mainRoot, "package.json")) ? mainRoot : gitRoot;
  const kind = detectKind(root);
  const plan = dependencyPlan(root);
  const parentLock = readParentLock(root);
  const repo = basename(root);
  return parseWorktreeList(listed.out).map((ref) =>
    buildReport({ repo, kind, mainRoot: root, ref, plan, parentLock }),
  );
}

/** Directories under .claude/worktrees that git does not know about - report, never touch. */
export function strayDirectories(worktreesRoot: string, refs: WorktreeRef[]): string[] {
  if (!existsSync(worktreesRoot)) return [];
  const registered = new Set(refs.map((ref) => resolve(ref.path)));
  return readdirSync(worktreesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(worktreesRoot, entry.name))
    .filter((path) => !registered.has(resolve(path)))
    .map((path) => basename(path))
    .sort();
}

/**
 * Delete this worktree's node_modules directory, never a shared dependency store:
 * `agent:worktree` junctions the root node_modules to the main checkout, and
 * removing that link with a recursive delete would wipe the main checkout too.
 */
export function removeNodeModules(worktree: string): "unlinked" | "removed" {
  const path = join(worktree, "node_modules");
  if (lstatSync(path).isSymbolicLink()) {
    try {
      unlinkSync(path);
    } catch {
      rmSync(path, { recursive: false, force: true });
    }
    return "unlinked";
  }
  rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  return "removed";
}

function installOnce(worktree: string): number {
  const result = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], {
    cwd: worktree,
    stdout: "inherit",
    stderr: "inherit",
    timeout: 15 * 60_000,
  });
  return result.exitCode ?? 1;
}

/** Free gigabytes on the volume holding `path`, or null when the runtime cannot say. */
export function freeGigabytes(path: string): number | null {
  try {
    const stats = statfsSync(path);
    return (Number(stats.bavail) * Number(stats.bsize)) / 1e9;
  } catch {
    return null;
  }
}

function repair(row: WorktreeReport, plan: DepsPlan): boolean {
  const label = `${row.repo}/${row.name}`;
  const started = Date.now();
  console.log(`worktree-doctor: repairing ${label} (${statusOf(row.severity)}) - bun install --frozen-lockfile`);
  const first = installOnce(row.path);
  let missing = probeInstall(row.path, plan).missing;
  if (first !== 0 || missing.length > 0) {
    // bun reports success on an existing half-linked store, so the only reliable
    // repair is a clean store: delete it here and install again.
    if (existsSync(join(row.path, "node_modules"))) {
      const how = removeNodeModules(row.path);
      console.log(`worktree-doctor: ${label} still missing ${missing.length} package(s) - node_modules ${how}, installing again`);
      const second = installOnce(row.path);
      if (second !== 0) {
        console.log(`worktree-doctor: ${label} repair failed after ${Math.round((Date.now() - started) / 1000)}s (bun install exit ${second})`);
        return false;
      }
      missing = probeInstall(row.path, plan).missing;
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  if (missing.length > 0) {
    console.log(`worktree-doctor: ${label} still missing ${missing.slice(0, 3).join(", ")} after reinstall (${seconds}s)`);
    return false;
  }
  console.log(`worktree-doctor: ${label} repaired in ${seconds}s`);
  return true;
}

function summary(rows: WorktreeReport[]): string {
  const gone = rows.filter((row) => row.severity >= 6);
  const broken = rows.filter((row) => row.severity === BROKEN || row.severity === 5);
  const noInstall = rows.filter((row) => row.severity === 5);
  const warn = rows.filter((row) => row.severity === 2);
  const gamesWrong = rows.filter(
    (row) => row.kind === "engine" && (row.games === "stale" || row.games === "absent" || row.games === "unknown-head"),
  );
  const parts = [
    `${rows.length} worktrees`,
    `${broken.length} broken (${noInstall.length} with no install at all)`,
    `${warn.length} warn`,
  ];
  if (gone.length > 0) parts.push(`${gone.length} directory missing (git still registers them - prune by hand)`);
  if (gamesWrong.length > 0) parts.push(`${gamesWrong.length} do not measure the Games/ pin`);
  return parts.join(", ");
}

/** One line per Games/ problem, naming both commits so the wrong tree is never anonymous. */
function gamesProblems(rows: WorktreeReport[]): string[] {
  const stale = rows.filter((row) => row.games === "stale");
  const lines: string[] = [];
  if (stale.length > 0) {
    const first = stale[0]!;
    lines.push(
      `worktree-doctor: ${stale.length} worktree(s) measure Games/ at ${short(first.gamesHead)}, pin is ${short(first.gamesPin)} — ` +
        "one shared clone, so `bun run games:update` at the main checkout moves every lane to the pin",
    );
  }
  const unlinked = rows.filter((row) => gamesUnlinked(row));
  if (unlinked.length > 0) {
    const names = unlinked.slice(0, 6).map((row) => row.name);
    const more = unlinked.length > names.length ? ` (+${unlinked.length - names.length} more)` : "";
    lines.push(`worktree-doctor: ${unlinked.length} worktree(s) have no Games/ link, so their game gates fail: ${names.join(", ")}${more}`);
  }
  return lines;
}

function help(): void {
  console.log(`worktree-doctor: check every agent worktree install in both repos

  bun run worktree:doctor              table, worst first
  bun run worktree:doctor --repair     repair broken installs in clean trees, then re-report
  bun run worktree:doctor --only <p>   limit --repair to worktrees matching p (substring of repo/name, comma separated)
  bun run worktree:doctor --self       only this tree; exit 1 when its install is broken
  bun run worktree:doctor --games <p>  sibling games repo (default ../jgengine-games)

Columns
  INSTALL  node_modules present; "stale" means it predates bun.lock
  JGE      @jgengine/* packages that resolve through node_modules
  DIST     packages/core/dist present (informational: in-repo work resolves to source)
  LOCK     bun.lock matches the repo root's lockfile
  TREE     uncommitted changes in that worktree
  GAMES    which Games/ commit that worktree's game gates read: "pin", or "stale <sha>" against the pin

Exit 1 while a broken install, or a worktree measuring a Games/ that is not the
pin, is left unfixed. Repair only runs in a clean tree, deletes that tree's
node_modules and reinstalls, and links a missing Games/ (one junction, no
network). A stale Games/ is one shared clone: "bun run games:update" moves every
lane to the pin. Neither touches a branch, a worktree or uncommitted work.`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    help();
    process.exit(0);
  }
  const self = args.includes("--self");
  const doRepair = args.includes("--repair");
  const only = args.flatMap((arg, index) =>
    arg === "--only" ? (args[index + 1] ?? "").split(",").map((name) => name.trim()).filter(Boolean) : [],
  );
  const gamesIndex = args.indexOf("--games");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const mainRoot = mainRootOf(root);
  const gamesRoot =
    gamesIndex >= 0 ? resolve(args[gamesIndex + 1] ?? "") : resolve(mainRoot, "..", "jgengine-games");

  if (self) {
    const toplevel = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
    const path = toplevel.ok ? toplevel.out : process.cwd();
    const mainRoot = mainRootOf(path);
    const kind = detectKind(mainRoot);
    const branch = git(path, ["branch", "--show-current"]);
    const row = buildReport({
      repo: basename(mainRoot),
      kind,
      mainRoot,
      ref: { path, branch: branch.out === "" ? null : branch.out, locked: false },
      plan: dependencyPlan(mainRoot),
      parentLock: readParentLock(mainRoot),
    });
    const where = basename(path);
    if (row.severity >= BROKEN) {
      const detail = row.nodeModules ? row.missingDeps.slice(0, 3).join(", ") : "no node_modules";
      if (installBroken(row)) console.error(`worktree-doctor: ${where} install is broken (${detail})`);
      if (row.games === "stale") {
        console.error(
          `worktree-doctor: ${where} measures Games/ at ${short(row.gamesHead)}, pin is ${short(row.gamesPin)} (measuring an unpinned checkout)`,
        );
        console.error("worktree-doctor: run `bun run games:update` — the clone is shared, so this moves every lane to the pin");
      } else if (row.games === "absent" || row.games === "unknown-head") {
        console.error(`worktree-doctor: ${where} has no Games/ link (pin ${short(row.gamesPin)}), so its game gates cannot run`);
        console.error("worktree-doctor: run `bun run agent:worktree -- <name>` here, or `bun run worktree:doctor --repair`");
      }
      if (installBroken(row)) console.error("worktree-doctor: run `bun run worktree:doctor --repair` here, or `bun run agent:bootstrap`");
      process.exit(1);
    }
    console.log(`worktree-doctor: ${where} install ok`);
    process.exit(0);
  }

  const roots = [mainRoot];
  if (existsSync(join(gamesRoot, "package.json")) && existsSync(join(gamesRoot, ".git"))) roots.push(gamesRoot);

  const strays = roots.flatMap((repoRoot) =>
    strayDirectories(
      join(repoRoot, ".claude", "worktrees"),
      parseWorktreeList(git(repoRoot, ["worktree", "list", "--porcelain"]).out),
    ).map((name) => `${basename(repoRoot)}: ${name}`),
  );

  const before = roots.flatMap(scanRepo);
  console.log("worktree-doctor: before");
  console.log(formatTable(before));
  console.log(`worktree-doctor: ${summary(before)}`);
  for (const line of gamesProblems(before)) console.log(line);
  if (strays.length > 0) {
    console.log(`worktree-doctor: stray directories (not git worktrees, left alone): ${strays.join(", ")}`);
  }

  let rows = before;
  if (doRepair) {
    const gone = before.filter((row) => !row.directory);
    for (const row of gone) {
      console.log(`worktree-doctor: ${row.repo}/${row.name} directory is missing (git still registers it) - not touching it; \`git worktree prune\` removes the registration`);
    }
    const selected = filterOnly(before, only);
    if (only.length > 0) {
      console.log(`worktree-doctor: --only ${only.join(",")} selected ${selected.length} of ${before.length} worktrees`);
    }
    const unlinked = selected.filter(gamesUnlinked);
    if (unlinked.length > 0) {
      const games = existsSync(join(mainRoot, "Games"));
      console.log(
        games
          ? `worktree-doctor: linking Games/ into ${unlinked.length} worktree(s) from the main checkout (one junction each, no install, no network)`
          : "worktree-doctor: the main checkout has no Games/ clone, so no worktree can link one - run `bun run games:clone` there first",
      );
      if (games) {
        for (const row of unlinked) {
          const made = linkAssets(mainRoot, row.path, ["Games"]);
          if (made.length > 0) console.log(`worktree-doctor: ${row.repo}/${row.name} linked ${made.join(", ")}`);
        }
      }
    }
    const { repair: queue, refused } = planRepair(selected);
    for (const row of refused) {
      console.log(
        `worktree-doctor: refusing ${row.repo}/${row.name} - ${statusOf(row.severity)} but dirty (${row.changes} uncommitted changes); commit or stash there first`,
      );
    }
    if (queue.length === 0) console.log("worktree-doctor: nothing safe to repair");
    const startedWith = freeGigabytes(mainRoot);
    let stopped = false;
    for (const row of queue) {
      const free = freeGigabytes(row.path);
      if (free !== null && free < MIN_FREE_GB) {
        console.log(
          `worktree-doctor: stopping at ${row.repo}/${row.name} - ${free.toFixed(1)} GB free, below the ${MIN_FREE_GB} GB floor (a filling disk is what broke these installs)`,
        );
        stopped = true;
        break;
      }
      repair(row, dependencyPlan(mainRootOf(row.path)));
    }
    const endedWith = freeGigabytes(mainRoot);
    if (startedWith !== null && endedWith !== null) {
      console.log(`worktree-doctor: disk free ${startedWith.toFixed(1)} GB -> ${endedWith.toFixed(1)} GB after repairs${stopped ? " (stopped early)" : ""}`);
    }
    rows = roots.flatMap(scanRepo);
    console.log("worktree-doctor: after");
    console.log(formatTable(rows));
    console.log(`worktree-doctor: ${summary(rows)}`);
  }

  const remaining = rows.filter((row) => row.severity >= BROKEN && row.directory);
  if (remaining.length > 0) {
    const names = remaining.slice(0, 8).map((row) => `${row.repo}/${row.name}`);
    const more = remaining.length > names.length ? ` (+${remaining.length - names.length} more)` : "";
    console.error(`worktree-doctor: ${remaining.length} broken install(s) left: ${names.join(", ")}${more}`);
    process.exit(1);
  }
}
