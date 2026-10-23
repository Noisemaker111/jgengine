// Proves the failure behind #2143 stays fixed: a browser test that outruns the runner's 5 s default
// keeps its browser. Without the budget below, this file's Chrome is reaped mid-test and the second
// test fails with "Target page, context or browser has been closed" — the symptom users saw.
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { findChromeExecutable } from "./browser-lib";

setDefaultTimeout(30_000);

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
  await page.goto("data:text/html,<h1>alive</h1>");
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

test("a test that outruns 5 s keeps the browser", async () => {
  await page.waitForTimeout(6_500);
  expect(await page.locator("h1").textContent()).toBe("alive");
});

test("the next test in the file still owns it", async () => {
  expect(browser.isConnected()).toBe(true);
  expect(await page.locator("h1").textContent()).toBe("alive");
});
