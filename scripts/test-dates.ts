// `bun scripts/test-dates.ts [dates...]`: the whole suite run as if the machine's clock said each of
// three days (`JG_TEST_DATE`, see test-date-preload.ts), then the tests whose result was not the same
// on every day. A test that passes on one date and fails on another reads the wall clock where the
// game's own clock belongs. Exits 1 when any result moved or any day failed.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Three days far apart: a leap day, a year-end in another year, and a mid-year date across a DST change. */
const DEFAULT_DATES = ["2028-02-29T23:30:00Z", "2031-12-31T12:00:00Z", "2026-07-04T03:00:00Z"] as const;

/** The failing tests a `bun test` run printed, one name per `(fail)` line. */
export function failedTests(output: string): Set<string> {
  const failed = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    // bun's own `(fail) name [12ms]`, or the runner's footer `path: (fail) name - first error`.
    const match = /^(?:(\S+\.test\.\w+): )?\(fail\) (.+?)(?: \[[\d.]+m?s\])?(?: - .*)?$/.exec(line.trim());
    if (match !== null) failed.add(match[1] === undefined ? match[2]! : `${match[1]}: ${match[2]!}`);
  }
  return failed;
}

/** Tests that failed on some days and not others, with the days each failed on. */
export function movedResults(runs: ReadonlyMap<string, Set<string>>): Map<string, string[]> {
  const all = new Set([...runs.values()].flatMap((set) => [...set]));
  const moved = new Map<string, string[]>();
  for (const name of all) {
    const days = [...runs].filter(([, failed]) => failed.has(name)).map(([day]) => day);
    if (days.length !== runs.size) moved.set(name, days);
  }
  return moved;
}

if (import.meta.main) {
  const dates = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [...DEFAULT_DATES];
  const runs = new Map<string, Set<string>>();
  for (const date of dates) {
    console.log(`test-dates: the suite on ${date}...`);
    // One offset for the whole run, in the environment every test process and its children inherit.
    const offset = String(Date.parse(date) - Date.now());
    const run = spawnSync("bun", ["scripts/run-tests.ts"], { cwd: root, encoding: "utf8", env: { ...process.env, JG_TEST_DATE: date, JG_TEST_DATE_OFFSET: offset }, maxBuffer: 1024 * 1024 * 1024 });
    const failed = failedTests(`${run.stdout ?? ""}\n${run.stderr ?? ""}`);
    runs.set(date, failed);
    console.log(`  ${failed.size} failing test(s)${failed.size > 0 ? `: ${[...failed].slice(0, 10).join(" | ")}` : ""}`);
  }
  const moved = movedResults(runs);
  for (const [name, days] of moved) console.log(`  moved: ${name} — failed on ${days.join(", ")}`);
  const steady = [...runs.values()].every((failed) => failed.size === 0);
  console.log(moved.size === 0 && steady ? `test-dates: the same results on all ${dates.length} days` : `test-dates: ${moved.size} result(s) moved with the date`);
  process.exit(moved.size === 0 && steady ? 0 : 1);
}
