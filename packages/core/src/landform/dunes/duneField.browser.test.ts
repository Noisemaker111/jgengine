import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../../scripts/browser-lib";

setDefaultTimeout(60_000);

// The same dune field grows in bun (JSC) and in Chrome (V8), under three winds, two of them oblique.
const root = resolve(import.meta.dir, "../../../../..").replaceAll("\\", "/");
const scratch = `${root}/.scratch/landform-dunes-browser-test`;
const CHECK = `
import { createDuneField } from "${root}/packages/core/src/landform/dunes/duneField";
export function duneCheck() {
  const field = createDuneField({
    grid: { cols: 64, rows: 48, cellSize: 1.5, reposeAngle: 33 },
    seed: "browser",
    initial: { sand: 1.2 },
    params: { windPeriod: 6, hop: 2, shadowAngle: 14, wind: [{ toward: 75, share: 3 }, { toward: 200, share: 1 }, { toward: 310, share: 1 }] },
  });
  const hashes = [];
  for (let k = 0; k < 4; k += 1) {
    field.step(40);
    hashes.push(field.hash());
  }
  return hashes.join(",");
}
`;

let browser: Browser;
let script = "";
let bunResult = "";
beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await Bun.write(`${scratch}/check.ts`, CHECK);
  await Bun.write(`${scratch}/fixture.ts`, `import { duneCheck } from "./check";\n(globalThis as { duneCheck?: () => string }).duneCheck = duneCheck;\n`);
  script = buildBrowserFixture(`${scratch}/fixture.ts`);
  const check: { duneCheck: () => string } = await import(`${scratch}/check.ts`);
  bunResult = check.duneCheck();
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(scratch, { recursive: true, force: true });
});

test("Chrome grows the same dune field as bun, bit for bit", async () => {
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: script, type: "module" });
  const chromeResult: unknown = await page.evaluate("globalThis.duneCheck()");
  await page.close();
  expect(typeof chromeResult).toBe("string");
  expect(String(chromeResult)).toBe(bunResult);
});
