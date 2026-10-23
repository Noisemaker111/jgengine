// The CI `test` job runs this once per shard. One bun process over `packages
// apps/dev scripts` took 5m37s of test time on a runner, so the same files are
// split by measured cost into eight jobs. Every test file under those roots lands in
// exactly one shard - the last entry covers the rest - and `--check` fails if
// the split ever stops covering everything, so a new directory cannot drop its
// tests silently.
//
//   bun scripts/test-shard.ts a
//   bun scripts/test-shard.ts --check     # file counts per shard, no tests run
//   bun scripts/test-shard.ts --print a   # this shard's file paths, one per line
//
// The names are the eight letters in the ci.yml matrix, and the matrix is the only
// shard fact that file holds: which files each letter runs and what it prepares first
// lives here, so rebalancing never edits the workflow. `scripts/test-shard.test.ts`
// fails when the two lists disagree.
//
// Balance is measured, not guessed: the numbers below are what each shard's tests took on a
// runner (2026-10-23, run 39892384209, a docs-only PR: 377 s of test time over ten jobs;
// run 39893307182 pushed the same content while a full gate ran and moved every shard by up
// to 20 s, which is the variance to expect). Ten jobs cost ten runners of fixed setup against
// the account's 20-job cap, so a PR racing another run queued its shards in two waves; eight
// is the fewest that keeps every shard at the slowest single file.
//
// The floor is one file per shard: the editor round trip (a) and the editor scene io run
// (f) are single browser scenarios, and the harness pair (b, e) each waits out the
// harness's own 10 s give-up. Merging two shards adds their times, so the cheap shards went
// where there was room rather than into each other: the old g 26, h 37, i 35 and j 15 are now
// the tail of c (the small packages and apps/dev) and the last two entries. Moving a
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
  /**
   * Preparation this shard's tests need before `bun test`: `build` for the tests that read
   * published dist, `games` for the repo gates that read the `./Games` clone. Every test job
   * used to pay both; only the shard that needs one pays it now.
   */
  needs?: readonly ("build" | "games")[];
}

/** Eight shards by measured cost; the CI matrix runs one job per entry, in this order. */
export const SHARDS: readonly Shard[] = [
  {
    name: "a",
    label: "editor round trip",
    // 34 s: one Chrome drives save/play/return/reopen across a reload, start to finish.
    include: ["packages/editor/src/CreatorApp.test.ts"],
    needs: [],
  },
  {
    name: "b",
    label: "harness pointer-blocked targets",
    // 42 s: three scenarios the drive harness must refuse; each waits out the harness's own
    // 10 s give-up, so this shard is the harness's fixed cost, not the runner's.
    include: ["packages/jgengine/src/harness.blockedTargets.browser.test.ts"],
    needs: [],
  },
  {
    name: "c",
    label: "harness unreachable targets + the small packages",
    // 34 s of harness scenarios plus the 8 s the small packages and apps/dev take together.
    // They sit here because this job waits on Chrome rather than on a core: it is the one shard
    // with room left, and adding them here is what keeps every other shard under 58 s.
    include: [
      "packages/jgengine/src/harness.unreachableTargets.browser.test.ts",
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
    needs: [],
  },
  {
    name: "d",
    label: "core world",
    // 53 s: 87 files, the generator and city suites among them; the city generator alone is
    // 28 s of it, so this is a single file's floor plus the world suite around it.
    include: ["packages/core/src/world"],
    needs: [],
  },
  {
    name: "e",
    label: "harness drive",
    // 43 s of harness drive plus the other 2 s of jgengine. A browser file runs alone:
    // the editor scene io file took 34 s first in its process and 78 s after 85 others.
    include: ["packages/jgengine/src/harness.browser.test.ts", "packages/jgengine"],
    needs: [],
  },
  {
    name: "f",
    label: "editor scene io",
    // 57 s: export/import and the failed-save round, seeding its scene through the real UI.
    include: ["packages/editor/src/CreatorApp.sceneIo.test.ts"],
    needs: [],
  },
  {
    name: "g",
    label: "shell, editor and react",
    // 26 s of shell, the 3 s of editor tests that are not browser scenarios, and 29 s of react.
    // This is the old shell+editor shard with the old react shard folded in. It clones Games for
    // one editor test that opens a real game scene (`packages/editor/src/mcp/loadGameLayers`).
    include: ["packages/shell", "packages/editor", "packages/react"],
    needs: ["games"],
  },
  {
    name: "h",
    label: "core, scripts and the built gate",
    // 15 s of core outside world plus 35 s of scripts; anything a new root adds lands here too.
    // It is the only shard that reads a built dist and the only one that reads `./Games`, so it
    // is the only job that pays for either: about 7 s on this step, and zero on the other seven.
    include: ["packages/core", ...TEST_ROOTS],
    needs: ["build", "games"],
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

/** Commands that prepare a shard, in the order they must run. */
export function preparation(shard: Shard): string[][] {
  const commands: string[][] = [];
  for (const need of shard.needs ?? []) {
    if (need === "build") commands.push(["run", "build"]);
    else commands.push(["run", "games:clone"]);
  }
  return commands;
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
  for (const args of preparation(shard)) {
    const prepared = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
    if (prepared.status !== 0) process.exit(prepared.status ?? 1);
  }
  const run = spawnSync("bun", ["test", "--timeout", "20000", ...assigned], {
    cwd: root,
    stdio: "inherit",
  });
  process.exit(run.status ?? 1);
}

if (import.meta.main) main();
