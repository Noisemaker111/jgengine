// The CI `test` job runs this once per shard. One bun process over `packages
// apps/dev scripts` took 5m37s of test time on a runner, so the same files are
// split by measured cost into six jobs. Every test file under those roots lands in
// exactly one shard - the last entry covers the rest - and `--check` fails if
// the split ever stops covering everything, so a new directory cannot drop its
// tests silently.
//
//   bun scripts/test-shard.ts a
//   bun scripts/test-shard.ts --check     # file counts per shard, no tests run
//   bun scripts/test-shard.ts --print a   # this shard's file paths, one per line
//
// The names are the six letters in the ci.yml matrix, and the matrix is the only
// shard fact that file holds: which files each letter runs lives here, so
// rebalancing never edits the workflow. `scripts/test-shard.test.ts` fails when
// the two lists disagree.
//
// Balance is measured, not guessed: the numbers below are what each shard's `bun test`
// step took on a runner (2026-10-23, run 39888130429, 377 s of test time over six jobs).
// Six bins left two of them at 91 s and 92 s because the four browser files and the core
// world/react/shell blocks are each 34-55 s and only just fit one per job; eight bins put
// every job under 56 s. The heaviest entry is still one file - the editor round trip at
// 55 s - so this is the floor until that scenario itself gets cheaper. Moving a directory
// means re-timing the shard and updating these numbers in the same commit.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));

export const TEST_ROOTS = ["packages", "apps/dev", "scripts"] as const;

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".claude", "coverage", ".turbo", ".scratch", "Games"]);

export interface Shard {
  name: string;
  /** What the shard runs, printed with its file count so a red `test (a)` says what broke. */
  label: string;
  include: string[];
}

/** Eight shards by measured cost; the CI matrix runs one job per entry, in this order. */
export const SHARDS: readonly Shard[] = [
  {
    name: "a",
    label: "editor round trip",
    // 55 s: one Chrome drives save/play/return/reopen across a reload, start to finish.
    include: ["packages/editor/src/CreatorApp.test.ts"],
  },
  {
    name: "b",
    label: "harness blocked targets",
    // 53 s: the five scenarios the drive harness must refuse, ~11 s each.
    include: ["packages/jgengine/src/harness.blockedTargets.browser.test.ts"],
  },
  {
    name: "c",
    label: "core world",
    // 48 s: 87 files, the generator and city suites among them.
    include: ["packages/core/src/world"],
  },
  {
    name: "d",
    label: "shell",
    // 43 s: the player shell lifecycle round plus 157 files of shell.
    include: ["packages/shell"],
  },
  {
    name: "e",
    label: "harness drive",
    // 39 s of harness drive plus the other 2 s of jgengine.
    include: ["packages/jgengine/src/harness.browser.test.ts", "packages/jgengine"],
  },
  {
    name: "f",
    label: "editor scene io",
    // 34 s: export/import and the failed-save round, plus the rest of the editor (2 s)
    // and the small packages that ship next to it.
    include: [
      "packages/editor/src/CreatorApp.sceneIo.test.ts",
      "packages/editor",
      "apps/dev",
      "packages/node",
      "packages/ws",
      "packages/assets",
      "packages/sql",
      "packages/rapier",
      "packages/convex",
      "packages/navbake",
      "packages/github",
    ],
  },
  {
    name: "g",
    label: "react",
    // 36 s: 66 files of hooks and input surfaces.
    include: ["packages/react"],
  },
  {
    name: "h",
    label: "scripts + core",
    // 30 s of scripts and the 19 s of core outside world; anything a new root adds lands here.
    include: ["scripts", "packages/core", ...TEST_ROOTS],
  },
];

/** Every test file under the roots, as repo-relative forward-slash paths. */
export function walkTestFiles(dir = root, roots: readonly string[] = TEST_ROOTS): string[] {
  const found: string[] = [];
  const walk = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(path, entry.name));
      } else if (TEST_FILE.test(entry.name)) {
        found.push(relative(dir, join(path, entry.name)).replace(/\\/g, "/"));
      }
    }
  };
  for (const name of roots) walk(join(dir, name));
  return found.sort();
}

export function matchingShard(file: string, shards: readonly Shard[] = SHARDS): Shard | null {
  return (
    shards.find((shard) => shard.include.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))) ?? null
  );
}

/** Split files by shard, throwing instead of dropping a file no shard covers. */
export function assignShards(files: readonly string[], shards: readonly Shard[] = SHARDS): Map<string, string[]> {
  const names = new Set<string>();
  for (const shard of shards) {
    if (names.has(shard.name)) throw new Error(`duplicate shard name ${shard.name}`);
    names.add(shard.name);
  }
  const assigned = new Map<string, string[]>(shards.map((shard) => [shard.name, []]));
  for (const file of files) {
    const shard = matchingShard(file, shards);
    if (shard === null) throw new Error(`no shard covers ${file}`);
    assigned.get(shard.name)!.push(file);
  }
  return assigned;
}

function counts(files: readonly string[], shards: readonly Shard[]): string[] {
  const assigned = assignShards(files, shards);
  return shards.map((shard) => `${shard.name} (${shard.label}): ${assigned.get(shard.name)!.length} file(s)`);
}

function main(): void {
  const argv = process.argv.slice(2);
  const files = walkTestFiles();

  if (argv.includes("--check")) {
    for (const line of counts(files, SHARDS)) console.log(line);
    console.log(`total: ${files.length} file(s)`);
    return;
  }

  if (argv.includes("--print")) {
    const name = argv.find((arg) => !arg.startsWith("--"));
    if (name === undefined || !SHARDS.some((entry) => entry.name === name)) {
      console.error(`test-shard: --print needs one of ${SHARDS.map((s) => s.name).join(", ")}`);
      process.exit(1);
    }
    for (const file of assignShards(files, SHARDS).get(name)!) console.log(file);
    return;
  }

  const name = argv.find((arg) => !arg.startsWith("--"));
  if (name === undefined) {
    console.error(`test-shard: pass a shard name (${SHARDS.map((s) => s.name).join(", ")}) or --check`);
    process.exit(1);
  }
  const shard = SHARDS.find((entry) => entry.name === name);
  if (shard === undefined) {
    console.error(`test-shard: unknown shard ${name}`);
    process.exit(1);
  }
  const assigned = assignShards(files, SHARDS).get(name)!;
  if (assigned.length === 0) {
    console.error(`test-shard: shard ${name} has no test files`);
    process.exit(1);
  }

  console.log(`test-shard ${name} (${shard.label}): ${assigned.length} of ${files.length} test file(s)`);
  const run = spawnSync("bun", ["test", "--timeout", "20000", ...assigned], {
    cwd: root,
    stdio: "inherit",
  });
  process.exit(run.status ?? 1);
}

if (import.meta.main) main();
