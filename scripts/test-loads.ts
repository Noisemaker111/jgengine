// Which repository files each test file loaded the last time it passed, with each file's content
// digest at that time, counting the Bun processes it started; `scripts/test-loads-preload.ts` writes
// the raw logs while verify:fast's tests run. verify:fast drops a test the import graph reaches when
// its record shows it loads none of the changed files: a test can behave differently only through
// code it runs, and an engine change reached 1,195 tests through imports while 12 of them ran the
// changed file.
//
// A record says what the test loads only while the files it names keep their recorded bytes, so it is
// used only then (a file this branch changed may differ: the test loads it, so it runs). Ekstazi's
// argument: with every loaded file unchanged, the test runs the same code and loads the same files.
// Shared by every worktree of a clone, like the pass cache: a record is content, never a branch.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { writeAtomically } from "./verify-cache";

/** What one test file loaded: each repository file and its digest then, and whether it started something the recorder cannot see into. */
export interface LoadRecord {
  loads: Record<string, string>;
  opaque?: true;
}

/** Test file -> its record. */
export type LoadRecords = Record<string, LoadRecord>;

/** What a test loaded in one run, before digests. */
export interface TestLoads {
  files: Set<string>;
  opaque: boolean;
}

export function readTestLoads(file: string): LoadRecords {
  try {
    const parsed = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
    // A record from before processes were followed has no `loads`: it is not used.
    return Object.fromEntries(Object.entries(parsed).filter(([, record]) => typeof record === "object" && record !== null && "loads" in record)) as LoadRecords;
  } catch {
    return {};
  }
}

interface ProcessLog {
  parent: number;
  started: number;
  /** Test files this process ran, with when each started. */
  tests: { file: string; at: number }[];
  /** Each load or opaque start, with the test file running in this process then (`null` before its first). */
  events: { own: string | null; loaded?: string; opaque?: true }[];
}

/**
 * Test file -> what it loaded, from the preload's logs in `dir`, repo-relative with `/`. A process's
 * events belong to the test its oldest recorded ancestor was running when the chain of processes down
 * to it started, else to the test it was running itself.
 */
export function parseLoadLogs(root: string, dir: string, files: ReadonlySet<string>): Map<string, TestLoads> {
  const repoPath = (path: string): string => relative(root, path).replaceAll("\\", "/");
  // A log can hold several processes: Windows hands a finished process's id to a new one.
  const processes = new Map<number, ProcessLog[]>();
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const runs: ProcessLog[] = [];
    let log: ProcessLog | undefined;
    let own: string | null = null;
    for (const line of readFileSync(join(dir, name), "utf8").split("\n")) {
      const [kind, value = "", at = "0"] = line.split("\t");
      if (kind === "@") {
        runs.push((log = { parent: Number(value), started: Number(at), tests: [], events: [] }));
        own = null;
      } else if (log === undefined) continue;
      else if (kind === "#") {
        own = repoPath(value);
        log.tests.push({ file: own, at: Number(at) });
      } else if (kind === "L") log.events.push({ own, loaded: repoPath(value) });
      else if (kind === "O") log.events.push({ own, opaque: true });
    }
    processes.set(Number(name.replace(/\.log$/, "")), runs);
  }
  /** The process with this id that was running at `at`. */
  const runningAt = (pid: number, at: number): ProcessLog | undefined => processes.get(pid)?.filter((run) => run.started <= at).at(-1);
  const owners = new Map<ProcessLog, string | null>();
  /** The test an ancestor of `log` was running when the chain of processes down to it started. */
  const inheritedOwner = (log: ProcessLog, depth = 0): string | null => {
    if (owners.has(log)) return owners.get(log)!;
    const parent = depth > 64 ? undefined : runningAt(log.parent, log.started);
    const owner = parent === undefined ? null : (inheritedOwner(parent, depth + 1) ?? parent.tests.filter((test) => test.at <= log.started).at(-1)?.file ?? null);
    owners.set(log, owner);
    return owner;
  };
  const loads = new Map<string, TestLoads>();
  for (const log of [...processes.values()].flat()) {
    const inherited = inheritedOwner(log);
    for (const event of log.events) {
      const test = inherited ?? event.own;
      if (test === null || !files.has(test)) continue;
      let into = loads.get(test);
      if (into === undefined) loads.set(test, (into = { files: new Set(), opaque: false }));
      if (event.opaque === true) into.opaque = true;
      if (event.loaded !== undefined && files.has(event.loaded)) into.files.add(event.loaded);
    }
  }
  return loads;
}

/** Each test's record with today's digests, for the tests that passed in this run. */
export function recordLoads(loads: ReadonlyMap<string, TestLoads>, passed: ReadonlySet<string>, digest: (path: string) => string): LoadRecords {
  const records: LoadRecords = {};
  for (const [test, { files, opaque }] of loads) {
    // A test that failed may have stopped before loading the rest of what it reaches.
    if (!passed.has(test) || !files.has(test)) continue;
    records[test] = { loads: Object.fromEntries([...files].sort().map((file) => [file, digest(file)])), ...(opaque ? { opaque: true as const } : {}) };
  }
  return records;
}

/** Merge new records into the shared store; other lanes write it too. */
export function saveTestLoads(file: string, records: LoadRecords): void {
  if (Object.keys(records).length === 0) return;
  writeAtomically(file, `${JSON.stringify({ ...readTestLoads(file), ...records })}\n`);
}

/** What a current record says a test loads. */
export interface CurrentLoads {
  files: readonly string[];
  opaque: boolean;
}

/**
 * The tests whose record still says what they load: every file it names has its recorded bytes or is
 * one this branch changed.
 */
export function currentLoads(records: LoadRecords, digest: (path: string) => string, changed: ReadonlySet<string>): Map<string, CurrentLoads> {
  const current = new Map<string, CurrentLoads>();
  for (const [test, record] of Object.entries(records)) {
    const entries = Object.entries(record.loads);
    if (entries.every(([file, recorded]) => changed.has(file) || digest(file) === recorded)) {
      current.set(test, { files: entries.map(([file]) => file), opaque: record.opaque === true });
    }
  }
  return current;
}
