import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../../scripts/browser-lib";

setDefaultTimeout(60_000);

// The same landscape grows in bun (JSC) and in Chrome (V8): every process runs, with a nonlinear slope
// exponent, tilted strata, deposition, a sea and landslides, plus D∞ routing. Any engine-dependent
// rounding shows up as a different hash.
const root = resolve(import.meta.dir, "../../../../..").replaceAll("\\", "/");
const scratch = `${root}/.scratch/landform-browser-test`;
const CHECK = `
import { createLandscapeEvolution, hashLandformArrays } from "${root}/packages/core/src/landform/evolution/landscapeEvolution";
import { dInfinityArea } from "${root}/packages/core/src/landform/flow/dInfinity";
import { landformTopology } from "${root}/packages/core/src/landform/grid/landformGrid";
export function landformCheck() {
  const grid = { cols: 48, rows: 40, cellSize: 80, outlets: ["south", "west"] };
  const model = createLandscapeEvolution({
    grid,
    seed: "browser",
    initial: { roughness: 20 },
    params: {
      uplift: 2e-3,
      slopeExponent: 1.3,
      areaExponent: 0.6,
      erodibility: 3e-6,
      deposition: 0.8,
      seaLevel: 5,
      timeStep: 5e3,
      strata: { top: 30, dip: 12, dipDirection: 230, layers: [{ id: "sandstone", thickness: 25, erodibility: 0.3, criticalAngle: 60 }, { id: "shale", thickness: 1, erodibility: 2.5, criticalAngle: 32 }] },
    },
  });
  const hashes = [];
  for (let k = 0; k < 80; k += 1) {
    model.step();
    if (k % 20 === 19) hashes.push(model.hash());
  }
  const routing = model.routing();
  hashes.push(hashLandformArrays(dInfinityArea(landformTopology(grid), routing.drain, routing.receiver)));
  return hashes.join(",");
}
`;

let browser: Browser;
let script = "";
let bunResult = "";
beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await Bun.write(`${scratch}/check.ts`, CHECK);
  await Bun.write(`${scratch}/fixture.ts`, `import { landformCheck } from "./check";\n(globalThis as { landformCheck?: () => string }).landformCheck = landformCheck;\n`);
  script = buildBrowserFixture(`${scratch}/fixture.ts`);
  const check: { landformCheck: () => string } = await import(`${scratch}/check.ts`);
  bunResult = check.landformCheck();
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(scratch, { recursive: true, force: true });
});

test("Chrome grows the same landscape as bun, bit for bit", async () => {
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: script, type: "module" });
  const chromeResult: unknown = await page.evaluate("globalThis.landformCheck()");
  await page.close();
  expect(typeof chromeResult).toBe("string");
  expect(String(chromeResult)).toBe(bunResult);
});
