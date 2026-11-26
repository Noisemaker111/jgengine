// Which repository files each test file loaded the last time it passed, with each file's content
// digest at that time; `scripts/test-loads-preload.ts` writes the raw log while verify:fast's tests
// run. verify:fast drops a test the import graph reaches when its record shows it loads none of the
// changed files: a test can behave differently only through code it runs, and an engine change
// reached 1,195 tests through imports while 12 of them ran the changed file.
//
// A record says what the test loads only while the files it names keep their recorded bytes, so it is
// used only then (a file this branch changed may differ: the test loads it, so it runs). Ekstazi's
// argument: with every loaded file unchanged, the test runs the same code and loads the same files.
// Shared by every worktree of a clone, like the pass cache: a record is content, never a branch.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { writeAtomically } from "./verify-cache";

/** Test file -> every repository file it loaded -> that file's digest then. */
export type LoadRecords = Record<string, Record<string, string>>;

export function readTestLoads(file: string): LoadRecords {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as LoadRecords) : {};
  } catch {
    return {};
  }
}

/** Test file -> the repository files it loaded, from the preload's logs in `dir` (repo-relative, `/`). */
export function parseLoadLogs(root: string, dir: string, files: ReadonlySet<string>): Map<string, Set<string>> {
  const loads = new Map<string, Set<string>>();
  const repoPath = (path: string): string => relative(root, path).replaceAll("\\", "/");
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    for (const line of readFileSync(join(dir, name), "utf8").split("\n")) {
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const test = repoPath(line.slice(0, tab));
      const loaded = repoPath(line.slice(tab + 1));
      if (!files.has(test) || !files.has(loaded)) continue;
      let into = loads.get(test);
      if (into === undefined) loads.set(test, (into = new Set()));
      into.add(loaded);
    }
  }
  return loads;
}

/** Each test's record with today's digests, for the tests that passed in this run. */
export function recordLoads(loads: ReadonlyMap<string, ReadonlySet<string>>, passed: ReadonlySet<string>, digest: (path: string) => string): LoadRecords {
  const records: LoadRecords = {};
  for (const [test, files] of loads) {
    // A test that failed may have stopped before loading the rest of what it reaches.
    if (!passed.has(test) || !files.has(test)) continue;
    records[test] = Object.fromEntries([...files].sort().map((file) => [file, digest(file)]));
  }
  return records;
}

/** Merge new records into the shared store; other lanes write it too. */
export function saveTestLoads(file: string, records: LoadRecords): void {
  if (Object.keys(records).length === 0) return;
  writeAtomically(file, `${JSON.stringify({ ...readTestLoads(file), ...records })}\n`);
}

/**
 * The tests whose record still says what they load: every file it names has its recorded bytes or is
 * one this branch changed. Test file -> the files it loads.
 */
export function currentLoads(records: LoadRecords, digest: (path: string) => string, changed: ReadonlySet<string>): Map<string, string[]> {
  const current = new Map<string, string[]>();
  for (const [test, files] of Object.entries(records)) {
    const entries = Object.entries(files);
    if (entries.every(([file, recorded]) => changed.has(file) || digest(file) === recorded)) current.set(test, entries.map(([file]) => file));
  }
  return current;
}
