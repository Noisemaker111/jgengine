import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { type Browser } from "playwright-core";
import { buildBrowserFixture } from "../../../../scripts/browser-lib";
import { sharedChromium } from "../../../../scripts/sharedChromium";

setDefaultTimeout(60_000);

// The comparison draws with raw GL, so only a real context can say it counts what differs.
const root = resolve(import.meta.dir, "../../../..").replaceAll("\\", "/");
// Under the package, so the fixture resolves three the way core does.
const scratch = `${root}/packages/core/.scratch/texture-comparer-browser-test`;
const CHECK = `
import * as THREE from "three";
import { TextureComparer } from "${root}/packages/core/src/render/textureComparer.draw";
export function compareCheck() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas") });
  // 40 is not a multiple of the 16-texel block, so the partial blocks at the edge count too.
  const size = 40;
  const target = () => new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const a = target();
  const b = target();
  renderer.setClearColor(0x336699, 1);
  for (const each of [a, b]) {
    renderer.setRenderTarget(each);
    renderer.clear();
  }
  // Six texels of b, a shade off in blue, across a block boundary.
  b.scissor.set(14, 30, 3, 2);
  b.scissorTest = true;
  renderer.setRenderTarget(b);
  renderer.setClearColor(0x33669a, 1);
  renderer.clear();
  renderer.setRenderTarget(null);
  const comparer = new TextureComparer();
  const counts = [
    comparer.count(renderer, a.texture, a.texture, size, size),
    comparer.count(renderer, a.texture, b.texture, size, size),
    comparer.count(renderer, a.texture, b.texture, size, size, 0.5),
    // A second run reuses the program and the block target.
    comparer.count(renderer, b.texture, a.texture, size, size),
  ];
  comparer.dispose();
  return counts.join(",");
}
`;

let browser: Browser;
let script = "";
beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await Bun.write(`${scratch}/check.ts`, CHECK);
  await Bun.write(`${scratch}/fixture.ts`, `import { compareCheck } from "./check";\n(globalThis as { compareCheck?: () => string }).compareCheck = compareCheck;\n`);
  script = buildBrowserFixture(`${scratch}/fixture.ts`);
  browser = await sharedChromium(["--no-sandbox", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(scratch, { recursive: true, force: true });
});

test("the comparer counts exactly the texels that differ, and none within a tolerance", async () => {
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: script, type: "module" });
  await page.waitForFunction("typeof globalThis.compareCheck === 'function'", undefined, { timeout: 10_000 });
  const result: unknown = await page.evaluate("globalThis.compareCheck()");
  await page.close();
  expect(result).toBe("0,6,0,6");
});
