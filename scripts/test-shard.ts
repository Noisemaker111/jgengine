// The CI `test` job runs this once per shard. One bun process over `packages apps scripts`
// (apps/dev, web, desktop) took 5m37s of test time on a runner, so the same files are
// split by measured cost into nine jobs. Every test file under those roots lands in
// exactly one shard - the last entry covers the rest - and `--check` fails if
// the split ever stops covering everything, so a new directory cannot drop its
// tests silently.
//
//   bun scripts/test-shard.ts a
//   bun scripts/test-shard.ts --check     # file counts per shard, no tests run
//   bun scripts/test-shard.ts --print a   # this shard's file paths, one per line
//
// The names are the nine letters in the ci.yml matrix, and the matrix is the only
// shard fact that file holds: which files each letter runs and what it prepares first
// lives here, so rebalancing never edits the workflow. `scripts/test-shard.test.ts`
// fails when the two lists disagree.
//
// Balance is measured, not guessed: the numbers below are what each shard's tests took on a
// runner (2026-10-23, runs 39892384209, 39900500138, 39901449536 and 39901783484 - docs-only
// pull requests, some with a full gate running beside them; one browser scenario moves 31-75 s
// between them, and that spread is the variance to plan against). Ten jobs against the
// account's 20-job cap queued a PR's shards into a second wave whenever another run was in
// flight. Eight fits the cap but measured +15-24 s on the deepest job, because merging core
// (6246 tests) with scripts put 6976 tests in one job whose own time swung 48-79 s across four
// runs. Nine keeps those two apart and still runs three jobs fewer than ten did.
//
// The floor is one file per shard: the editor round trip (a) and the editor scene io run (f)
// are single browser scenarios, and the harness pair (b, c) each waits out the harness's own
// 10 s give-up. Merging two shards adds their times, so a merged shard only goes where the job
// is already waiting on Chrome: the small packages fill a, shell rides behind c's browser file,
// and apps/dev joins e. React (41 s) cannot fold into anything without clearing 60 s, so it
// carries the editor's unit tests and nothing else. Moving a directory means re-timing the
// shard and updating these numbers in the same commit.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));

export const TEST_ROOTS = ["packages", "apps/dev", "apps/web", "apps/desktop", "scripts"] as const;

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".claude", "coverage", ".turbo", ".scratch", "games"]);

export interface Shard {
  name: string;
  /** What the shard runs, printed with its file count so a red `test (a)` says what broke. */
  label: string;
  include: string[];
  /**
   * Preparation this shard's tests need before `bun test`: `build` for the tests that read
   * published dist. Only the shard that needs it pays for it.
   */
  needs?: readonly "build"[];
  /**
   * `bun test` processes the shard's files run in at once, split by measured cost. A runner has 4
   * cores and one `bun test` uses one, so a shard of many files waits on a single core without it.
   */
  lanes?: number;
}

/**
 * Seconds the slowest test files took on a CI runner (run 41087291823, 2026-10-30), so a shard's
 * lanes split by time rather than count. Every other file counts as one second.
 */
export const SLOW_TEST_SECONDS: Readonly<Record<string, number>> = {
  "packages/core/src/landform/glacial/glacialErosion.test.ts": 148,
  "packages/core/src/physics/reference/bondedRock.test.ts": 137,
  "packages/core/src/physics/reference/discreteElementExperiments.test.ts": 88,
  "packages/core/src/landform/evolution/landscapeEvolution.browser.test.ts": 51,
};

/** Files split into at most `lanes` groups of near-equal cost, heaviest first. */
export function splitLanes(files: readonly string[], lanes: number, cost: Readonly<Record<string, number>> = SLOW_TEST_SECONDS): string[][] {
  const groups = Array.from({ length: Math.max(1, Math.min(lanes, files.length)) }, () => ({ files: [] as string[], total: 0 }));
  const ordered = [...files].sort((a, b) => (cost[b] ?? 1) - (cost[a] ?? 1) || a.localeCompare(b));
  for (const file of ordered) {
    const lightest = groups.reduce((low, group) => (group.total < low.total ? group : low));
    lightest.files.push(file);
    lightest.total += cost[file] ?? 1;
  }
  return groups.map((group) => group.files.sort());
}

/** Eight shards by measured cost; the CI matrix runs one job per entry, in this order. */
export const SHARDS: readonly Shard[] = [
  {
    name: "a",
    label: "editor round trip + the small packages",
    // 44 s: one Chrome drives save/play/return/reopen across a reload, start to finish. The
    // small packages (8 s) fill the job that waits on it instead of standing up a ninth runner.
    include: [
      "packages/node",
      "packages/ws",
      "packages/assets",
      "packages/sql",
      "packages/rapier",
      "packages/convex",
      "packages/navbake",
      "packages/github",
      "packages/editor/src/CreatorApp.test.ts",
    ],
    needs: [],
  },
  {
    name: "b",
    label: "harness pointer-blocked targets",
    // 39 s: three scenarios the drive harness must refuse; each waits out the harness's own
    // 10 s give-up, so this shard is the harness's fixed cost, not the runner's.
    include: ["packages/jgengine/src/harness.blockedTargets.browser.test.ts"],
    needs: [],
  },
  {
    name: "c",
    label: "harness unreachable targets + shell",
    // 22 s of harness scenarios plus 26 s of shell. The browser file sorts first in this
    // process, which is the order that matters: the editor scene io file took 78 s after 85
    // files and 34 s first in its process.
    include: ["packages/jgengine/src/harness.unreachableTargets.browser.test.ts", "packages/shell"],
    needs: [],
  },
  {
    name: "d",
    label: "core world, landforms and the physics reference sims",
    // The world suite (seconds since the city generator moved out) plus the long simulations:
    // glacial erosion 148 s, bonded rock 137 s, the DEM experiments 88 s and landscape evolution
    // 51 s on a runner. In shard h they made it a 13-minute job; here four lanes hold it near the
    // longest file.
    include: ["packages/core/src/world", "packages/core/src/landform", "packages/core/src/physics/reference"],
    needs: [],
    lanes: 4,
  },
  {
    name: "e",
    label: "harness drive",
    // 42 s of harness drive plus the other 2 s of jgengine and apps/dev, and 1 s of apps/web and apps/desktop.
    include: ["packages/jgengine/src/harness.browser.test.ts", "packages/jgengine", "apps/dev", "apps/web", "apps/desktop"],
    needs: [],
  },
  {
    name: "f",
    label: "editor scene io",
    // 53-59 s: export/import and the failed-save round, seeding its scene through the real UI.
    include: ["packages/editor/src/CreatorApp.sceneIo.test.ts"],
    needs: [],
  },
  {
    name: "g",
    label: "react and the editor unit tests",
    // 41 s of react plus 3 s of editor tests that are not browser scenarios. React cannot fold
    // into another shard here without clearing 60 s, so this is the one job that is nearly a
    // single package.
    include: ["packages/react", "packages/editor"],
    needs: [],
  },
  {
    name: "h",
    label: "core",
    // 15-26 s: the 6246 core tests outside world. It is not merged with scripts any more: the
    // same content in one job measured 48, 57 and 79 s of test time across four runs, and the
    // deepest job has to stay under a minute for the gate to have any headroom.
    include: ["packages/core"],
    needs: [],
    // 1,000 files took 13 minutes in one process (runs 41018954039 to 41121415429); four lanes.
    lanes: 4,
  },
  {
    name: "i",
    label: "scripts and the built gate",
    // 35 s of repo gates and CLI tests; anything a new root adds lands here too. It is the only
    // shard that reads a built dist, so it is the only job that pays for the build.
    include: ["scripts", ...TEST_ROOTS],
    needs: ["build"],
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
  }
  return commands;
}

function counts(files: readonly string[], shards: readonly Shard[]): string[] {
  const assigned = assignShards(files, shards);
  return shards.map((shard) => `${shard.name} (${shard.label}): ${assigned.get(shard.name)!.length} file(s)`);
}

async function main(): Promise<void> {
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
  const groups = splitLanes(assigned, shard.lanes ?? 1);
  const codes = await Promise.all(
    groups.map(async (group, index) => {
      const lane = groups.length === 1 ? "" : ` lane ${index + 1}/${groups.length}`;
      let status = await runTests(group, groups.length > 1);
      if (status.bunCrashed) {
        // Bun itself aborted, so no test reached a verdict; the same files run once more.
        console.log(`test-shard ${name}${lane}: Bun crashed (not a test failure); running it once more`);
        status = await runTests(group, groups.length > 1);
      }
      if (groups.length > 1) console.log(`test-shard ${name}${lane}: ${group.length} file(s), exit ${status.code}`);
      return status.code;
    }),
  );
  process.exit(codes.find((code) => code !== 0) ?? 0);
}

/** Bun's own crash banner: printed by the runtime, never by a test. */
export const BUN_CRASH = /oh no: Bun has crashed|panic: abort\(\) called|Bun has crashed\. This indicates a bug in Bun/;

/**
 * Whether a run's output shows Bun aborting rather than a test failing. A `(fail)` line means a test
 * reached a verdict, so that run fails on its own and is never repeated.
 */
export function bunCrashed(output: string, code: number): boolean {
  return code !== 0 && BUN_CRASH.test(output) && !/^\(fail\) /m.test(output);
}

/**
 * `bun test` on the files, kept for the crash check. Alone it streams to the job's log as it runs;
 * beside other lanes its output prints whole when it ends, so two lanes never interleave.
 */
async function runTests(files: readonly string[], held = false): Promise<{ code: number; bunCrashed: boolean }> {
  const child = Bun.spawn(["bun", "test", "--timeout", "20000", ...files], { cwd: root, stdout: "pipe", stderr: "pipe" });
  let tail = "";
  const heldOut: Uint8Array[] = [];
  const tee = async (stream: ReadableStream<Uint8Array>, sink: NodeJS.WriteStream): Promise<void> => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      if (held) heldOut.push(chunk);
      else sink.write(chunk);
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(-200_000);
    }
  };
  const [, , code] = await Promise.all([tee(child.stdout, process.stdout), tee(child.stderr, process.stderr), child.exited]);
  for (const chunk of heldOut) process.stdout.write(chunk);
  return { code, bunCrashed: bunCrashed(tail, code) };
}

if (import.meta.main) await main();
