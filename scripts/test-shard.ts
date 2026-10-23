// The CI `test` job runs this once per shard. One bun process over `packages
// apps/dev scripts` took 5m37s of test time on a runner, so the same files are
// split by measured cost into four jobs. Every test file under those roots lands in
// exactly one shard - the last entry covers the rest - and `--check` fails if
// the split ever stops covering everything, so a new directory cannot drop its
// tests silently.
//
//   bun scripts/test-shard.ts a
//   bun scripts/test-shard.ts --check     # file counts per shard, no tests run
//   bun scripts/test-shard.ts --print a   # this shard's file paths, one per line
//
// The names are the four letters in the ci.yml matrix, and the matrix is the only
// shard fact that file holds: which files each letter runs lives here, so
// rebalancing never edits the workflow. `scripts/test-shard.test.ts` fails when
// the two lists disagree.
//
// Balance is measured, not guessed: each number below is that shard's `bun test`
// step on a runner, timed per file with `--reporter=junit` (2026-10-23):
// a 86 s, b 99 s, c 86 s, d 77 s, out of 352 s of test time for one job. b holds a
// single file because `packages/editor/src/CreatorApp.test.ts` is 99 s on its own -
// it boots Chrome and drives real frames through a save/play/return round - so it
// sets the floor no matter where it goes; the other three carry the rest. Moving a
// directory means re-timing the shard and updating these numbers in the same commit.
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

/** Four shards by measured cost; the CI matrix runs one job per entry, in this order. */
export const SHARDS: readonly Shard[] = [
  { name: "a", label: "core + react", include: ["packages/core", "packages/react"] },
  { name: "b", label: "editor browser", include: ["packages/editor/src/CreatorApp.test.ts"] },
  {
    name: "c",
    label: "sdk",
    include: [
      "packages/jgengine",
      "packages/rapier",
      "packages/convex",
      "packages/github",
      "packages/assets",
      "packages/sql",
      "packages/navbake",
    ],
  },
  {
    name: "d",
    label: "scripts + shell",
    include: ["scripts", "apps/dev", "packages/shell", "packages/ws", "packages/node", "packages/editor", ...TEST_ROOTS],
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
