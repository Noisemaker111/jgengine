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

const LAUNCHES_BROWSER = /from\s+["']playwright-core["']|creatorAppFixture\(/;
const BUDGET = /setDefaultTimeout\(\s*([\d_]+)\s*\)/;

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
  const browserFiles = files.filter((file) => LAUNCHES_BROWSER.test(file.source)).length;
  console.log(`browser-test-budget: ok (${browserFiles} browser test file(s) declare a budget)`);
}
