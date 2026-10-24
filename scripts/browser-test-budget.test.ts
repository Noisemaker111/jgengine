import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findMissingBrowserBudgets, findShortSetupBudgets, MIN_BROWSER_TEST_BUDGET_MS, PLAYWRIGHT_LAUNCH_DEFAULT_MS } from "./browser-test-budget";
import { walkTestFiles } from "./test-shard";

const browserFile = (budget?: string) =>
  `import { expect, test } from "bun:test";\nimport { chromium } from "playwright-core";\n${budget === undefined ? "" : `setDefaultTimeout(${budget});\n`}`;

const launchingFile = (hookBudget?: string) =>
  `import { beforeAll } from "bun:test";\nimport { chromium } from "playwright-core";\nsetDefaultTimeout(30_000);\nbeforeAll(async () => {\n  browser = await chromium.launch({ headless: true });\n}${hookBudget === undefined ? "" : `, ${hookBudget}`});\n`;

describe("findMissingBrowserBudgets", () => {
  test("names a browser file that inherits the runner default", () => {
    expect(findMissingBrowserBudgets([{ path: "packages/react/src/a.test.ts", source: browserFile() }])).toEqual([
      "packages/react/src/a.test.ts: launches a browser with no setDefaultTimeout(...)",
    ]);
  });

  test("accepts a browser file with a budget at or above the floor", () => {
    expect(findMissingBrowserBudgets([{ path: "a.test.ts", source: browserFile("30_000") }])).toEqual([]);
    expect(findMissingBrowserBudgets([{ path: "a.test.ts", source: browserFile(String(MIN_BROWSER_TEST_BUDGET_MS)) }])).toEqual([]);
  });

  test("rejects a budget under the floor and leaves non-browser files alone", () => {
    expect(findMissingBrowserBudgets([{ path: "a.test.ts", source: browserFile("5_000") }])).toEqual([
      "a.test.ts: setDefaultTimeout(5_000) is under 20000ms",
    ]);
    expect(findMissingBrowserBudgets([{ path: "b.test.ts", source: 'import { test } from "bun:test";\n' }])).toEqual([]);
  });
});

test("every Playwright test file in the repo declares its own budget", () => {
  const root = join(import.meta.dir, "..");
  const files = walkTestFiles(root)
    .filter((path) => path !== "scripts/browser-test-budget.test.ts")
    .map((path) => ({ path, source: readFileSync(join(root, path), "utf8") }));
  expect(files.filter((file) => file.source.includes("playwright-core")).length).toBeGreaterThan(10);
  expect(findMissingBrowserBudgets(files)).toEqual([]);
  expect(findShortSetupBudgets(files)).toEqual([]);
});

describe("findShortSetupBudgets", () => {
  test("names a setup hook that expires with Playwright's launch default", () => {
    expect(findShortSetupBudgets([{ path: "a.test.ts", source: launchingFile(String(PLAYWRIGHT_LAUNCH_DEFAULT_MS)) }])).toEqual([
      `a.test.ts: beforeAll runs under ${PLAYWRIGHT_LAUNCH_DEFAULT_MS}ms, at or under Playwright's ${PLAYWRIGHT_LAUNCH_DEFAULT_MS}ms launch default`,
    ]);
  });

  test("accepts a setup hook that outlives the launch it waits on", () => {
    expect(findShortSetupBudgets([{ path: "a.test.ts", source: launchingFile("60_000") }])).toEqual([]);
  });

  test("reads the inherited budget when the hook declares none, and Bun's default when the file sets none", () => {
    expect(findShortSetupBudgets([{ path: "a.test.ts", source: launchingFile() }])).toEqual([
      `a.test.ts: beforeAll runs under 30000ms, at or under Playwright's ${PLAYWRIGHT_LAUNCH_DEFAULT_MS}ms launch default`,
    ]);
    expect(findShortSetupBudgets([{ path: "b.test.ts", source: launchingFile().replace("setDefaultTimeout(30_000);\n", "") }])).toEqual([
      "b.test.ts: beforeAll cannot name a stalled Chrome launch - it runs on Bun's 5 s default",
    ]);
  });

  test("leaves a file that never launches a browser alone", () => {
    expect(findShortSetupBudgets([{ path: "c.test.ts", source: 'import { test } from "bun:test";\nbeforeAll(async () => {});\n' }])).toEqual([]);
  });
});
