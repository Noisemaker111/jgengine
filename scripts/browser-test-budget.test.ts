import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findMissingBrowserBudgets, MIN_BROWSER_TEST_BUDGET_MS } from "./browser-test-budget";
import { walkTestFiles } from "./test-shard";

const browserFile = (budget?: string) =>
  `import { expect, test } from "bun:test";\nimport { chromium } from "playwright-core";\n${budget === undefined ? "" : `setDefaultTimeout(${budget});\n`}`;

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
});
