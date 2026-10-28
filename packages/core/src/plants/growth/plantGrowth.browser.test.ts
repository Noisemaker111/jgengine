import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../../scripts/browser-lib";

setDefaultTimeout(60_000);

// The same check runs in bun (JSC) and in Chrome (V8): plantMath bit patterns and the structure hash
// of a 160-year tree, past the bud cap. Any engine-dependent rounding in the growth path shows up as a
// mismatch.
const root = resolve(import.meta.dir, "../../../../..").replaceAll("\\", "/");
const scratch = `${root}/.scratch/plant-growth-browser-test`;
const CHECK = `
import { plantAcos, plantAtan, plantAtan2, plantCos, plantExp, plantLog, plantPow, plantSin } from "${root}/packages/core/src/plants/growth/plantMath";
import { createPlantGrowth } from "${root}/packages/core/src/plants/growth/plantGrowth";
import { OPEN_TEMPERATE_SITE } from "${root}/packages/core/src/plants/growth/plantEnvironment";
import { ACER_SACCHARUM } from "${root}/packages/core/src/plants/species/data/acerSaccharum";
import { hashPlantStructure } from "${root}/packages/core/src/plants/structure/plantStructure";
export function plantCheck() {
  const view = new DataView(new ArrayBuffer(8));
  const bits = (x) => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16); };
  const out = [];
  for (let i = 0; i < 64; i += 1) {
    const x = -9.7 + i * 0.3137;
    out.push(bits(plantExp(x)), bits(plantSin(x)), bits(plantCos(x)), bits(plantAtan(x)), bits(plantAtan2(x, 0.7)));
    out.push(bits(plantLog(0.01 + i * 1.77)), bits(plantPow(0.01 + i * 1.77, 1.15)), bits(plantAcos(-0.99 + i * 0.031)));
  }
  const plant = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, "browser");
  plant.step(160);
  return JSON.stringify({ math: out.join(","), hash: hashPlantStructure(plant.structure()) });
}
`;

let browser: Browser;
let script = "";
let bunResult = "";
beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await Bun.write(`${scratch}/check.ts`, CHECK);
  await Bun.write(`${scratch}/fixture.ts`, `import { plantCheck } from "./check";\n(globalThis as { plantCheck?: () => string }).plantCheck = plantCheck;\n`);
  script = buildBrowserFixture(`${scratch}/fixture.ts`);
  const check: { plantCheck: () => string } = await import(`${scratch}/check.ts`);
  bunResult = check.plantCheck();
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(scratch, { recursive: true, force: true });
});

test("Chrome computes the same plantMath bits and the same tree as bun", async () => {
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: script, type: "module" });
  const chromeResult: unknown = await page.evaluate("globalThis.plantCheck()");
  await page.close();
  expect(typeof chromeResult).toBe("string");
  expect(String(chromeResult)).toBe(bunResult);
});
