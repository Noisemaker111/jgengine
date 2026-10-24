/**
 * A Playwright test file launches Chrome as a child of the test process, and Bun's test runner reaps
 * a test file's child processes when one of its tests times out ("killed 1 dangling process"). The
 * runner's default is 5 s, which a browser test outruns under load, so the file loses its browser and
 * every later test in it fails with "Target page, context or browser has been closed". CI passed
 * `--timeout 20000` on the shard command, which hid that; a bare `bun test` did not.
 *
 * So every file that drives a real browser declares its own budget, and this check fails a new one
 * that does not. Run standalone with `bun scripts/browser-test-budget.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walkTestFiles } from "./test-shard";

/** Budget a browser test file needs: enough for a fixture build and a slow frame on a busy machine. */
export const MIN_BROWSER_TEST_BUDGET_MS = 20_000;

/**
 * The launch budget Playwright uses when a `chromium.launch` call passes none. A setup hook with a
 * budget at or under it is the shape that hides a stalled launch: on PR #2326 the `test (g)` job
 * reported only "(unnamed) hook timed out" plus "killed 1 dangling process" after 30.0 s, because
 * the launch and the hook expired together and the hook's anonymous timeout was reported first.
 * Above it, the launch's own "Timeout 30000ms exceeded" is what CI shows.
 */
export const PLAYWRIGHT_LAUNCH_DEFAULT_MS = 30_000;

const LAUNCHES_BROWSER = /from\s+["']playwright-core["']|creatorAppFixture\(/;
const BUDGET = /setDefaultTimeout\(\s*([\d_]+)\s*\)/;
/** The unindented `}, 30_000);` closing a hook's arrow body, which is how every file here writes it. */
const HOOK_BUDGET = /\n\}\s*,\s*([\d_]+)\s*\)/;

/** Repo-relative paths of browser test files whose per-test budget is missing or too small. */
export function findMissingBrowserBudgets(files: readonly { path: string; source: string }[]): string[] {
  const failures: string[] = [];
  for (const file of files) {
    if (!LAUNCHES_BROWSER.test(file.source)) continue;
    const budget = BUDGET.exec(file.source);
    if (budget === null) {
      failures.push(`${file.path}: launches a browser with no setDefaultTimeout(...)`);
      continue;
    }
    const ms = Number(budget[1]!.replaceAll("_", ""));
    if (!(ms >= MIN_BROWSER_TEST_BUDGET_MS)) {
      failures.push(`${file.path}: setDefaultTimeout(${budget[1]}) is under ${MIN_BROWSER_TEST_BUDGET_MS}ms`);
    }
  }
  return failures;
}

/**
 * The budget the file's `beforeAll` hook runs under: the number closing its arrow body, else the
 * file-wide default. `null` when the file sets neither, which means Bun's 5 s runner default.
 */
export function setupBudgetMs(source: string): number | null {
  const start = source.indexOf("beforeAll(");
  if (start >= 0) {
    const hook = HOOK_BUDGET.exec(source.slice(start));
    if (hook !== null) return Number(hook[1]!.replaceAll("_", ""));
  }
  const budget = BUDGET.exec(source);
  return budget === null ? null : Number(budget[1]!.replaceAll("_", ""));
}

/** Repo-relative paths of browser test files whose setup hook cannot outlast a stalled Chrome launch. */
export function findShortSetupBudgets(files: readonly { path: string; source: string }[]): string[] {
  const failures: string[] = [];
  for (const file of files) {
    if (!LAUNCHES_BROWSER.test(file.source)) continue;
    const budget = setupBudgetMs(file.source);
    if (budget === null) {
      failures.push(`${file.path}: beforeAll cannot name a stalled Chrome launch - it runs on Bun's 5 s default`);
    } else if (!(budget > PLAYWRIGHT_LAUNCH_DEFAULT_MS)) {
      failures.push(`${file.path}: beforeAll runs under ${budget}ms, at or under Playwright's ${PLAYWRIGHT_LAUNCH_DEFAULT_MS}ms launch default`);
    }
  }
  return failures;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const files = walkTestFiles(root)
    // This checker's own test holds a browser file without a budget as fixture text.
    .filter((path) => path !== "scripts/browser-test-budget.test.ts")
    .map((path) => ({ path, source: readFileSync(join(root, path), "utf8") }));
  const failures = findMissingBrowserBudgets(files);
  if (failures.length > 0) {
    console.error("browser-test-budget: browser test files whose tests inherit the runner's 5 s default\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      "\nA test that outruns its budget makes Bun reap the browser, and every later test in the file" +
        "\nfails with \"Target page, context or browser has been closed\". Add `setDefaultTimeout(30_000)`" +
        "\nnear the top of the file and keep any longer per-test timeout you already pass.",
    );
    process.exit(1);
  }
  const shortSetups = findShortSetupBudgets(files);
  if (shortSetups.length > 0) {
    console.error("browser-test-budget: browser test files whose setup hook outlives no stalled launch\n");
    for (const failure of shortSetups) console.error(`  ${failure}`);
    console.error(
      "\nA beforeAll that launches Chrome under a budget at or under Playwright's 30 s launch default" +
        "\nexpires with the launch, so CI reports only \"(unnamed) hook timed out\" and a dangling" +
        "\nchrome process. Give the hook more than the launch, e.g. `beforeAll(..., 60_000)`.",
    );
    process.exit(1);
  }
  const browserFiles = files.filter((file) => LAUNCHES_BROWSER.test(file.source)).length;
  console.log(`browser-test-budget: ok (${browserFiles} browser test file(s) declare a budget)`);
}
