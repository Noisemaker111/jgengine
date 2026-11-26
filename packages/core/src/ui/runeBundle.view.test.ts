// The committed Rune UI bundle (native/wasm/jg-ui) mounted in a real browser: it must draw a tree
// without panicking, with WebGPU and without it. A Rust call that has no browser implementation
// (std's clock on wasm32-unknown-unknown, 11 Nov 2026) panics only here, never in `cargo test`, and
// it took every game on jgengine.com down with "RuntimeError: unreachable".
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { chromeGraphicsArgs, findChromeExecutable } from "../../../../scripts/browser-lib";

setDefaultTimeout(60_000);

const bundle = resolve(import.meta.dir, "../../../../native/wasm/jg-ui");
const PAGE = `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="jg-ui" style="position:fixed;inset:0;width:100%;height:100%"></canvas>
<script type="module">
  window.__frames = [];
  const mod = await import("/jg_ui.js");
  await mod.default();
  mod.mount("jg-ui", "{}", (payload) => window.__frames.push(payload));
  mod.set_layer_spec(1, 40, JSON.stringify({ children: [{ k: "native", id: "root", kind: "box", props: { fill: "#204060", width: 200, height: 80 },
    children: [{ k: "native", id: "label", kind: "text", props: { text: "Play" } }] }] }), 1);
  window.__mod = mod;
</script></body></html>`;

// Two z-ordered layers on ONE shared wasm instance and ONE canvas, removing one layer cleanly,
// then full unmount and reopen on the same wasm instance: what a game with loading cover + UI,
// or a page that closes and reopens a game, does.
const MULTI_LAYER_AND_REOPEN = `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="shared" style="position:fixed;inset:0;width:100%;height:100%"></canvas>
<script type="module">
  const tree = (id, fill, w, h) => JSON.stringify({ children: [{ k: "native", id, kind: "box", props: { fill, width: w, height: h } }] });
  window.__state = { frames: 0, lastRects: [] };
  const mod = await import("/jg_ui.js");
  await mod.default();
  const onFrame = (payload) => {
    window.__state.frames += 1;
    try { window.__state.lastRects = JSON.parse(payload).nativeRects ?? []; } catch {}
  };
  mod.mount("shared", "{}", onFrame);
  mod.set_layer_spec(1, 30, tree("n1", "#204060", 300, 120), 1);
  mod.set_layer_spec(2, 40, tree("n2", "#602040", 120, 60), 1);
  window.__removeLayer1 = () => {
    mod.remove_layer(1);
  };
  // Full teardown + reopen on the same wasm instance with a fresh canvas.
  window.__reopen = () => {
    mod.unmount();
    const old = document.getElementById("shared");
    const fresh = old.cloneNode(false);
    old.remove();
    document.body.appendChild(fresh);
    window.__state.frames = 0;
    window.__state.lastRects = [];
    mod.mount("shared", "{}", onFrame);
    mod.set_layer_spec(3, 40, tree("n3", "#206040", 180, 90), 1);
  };
  window.__mod = mod;
</script></body></html>`;

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/") return new Response(PAGE, { headers: { "content-type": "text/html" } });
      if (path === "/two") return new Response(MULTI_LAYER_AND_REOPEN, { headers: { "content-type": "text/html" } });
      if (path === "/favicon.ico") return new Response(null, { status: 204 });
      const file = Bun.file(join(bundle, ...path.split("/").filter((part) => part !== "" && part !== "..")));
      return file.size > 0 ? new Response(file) : new Response("missing", { status: 404 });
    },
  });
});

afterAll(() => {
  server?.stop(true);
});

/**
 * Software GL for the no-WebGPU test (on Windows hardware ANGLE the first WebGL2 frame waits ~25s
 * on D3D compiling Rune's shaders), and an aligned Vulkan-SwiftShader stack for software WebGPU so
 * Dawn and ANGLE do not split across mismatched GL/Vulkan SwiftShader surfaces or drop the GPU
 * instance on headless Linux CI.
 */
function browserArgs(disableWebGpu: boolean): string[] {
  const linux = process.platform === "linux";
  const base = ["--headless=new", "--no-sandbox", ...(linux ? ["--disable-dev-shm-usage"] : [])];
  if (disableWebGpu) return [...base, ...chromeGraphicsArgs({ JG_CAPTURE_SOFTWARE_GL: "1" })];
  const graphics = chromeGraphicsArgs();
  if (!graphics.includes("--use-angle=swiftshader")) return [...base, ...graphics, "--enable-unsafe-webgpu"];
  return [
    ...base,
    ...(linux ? ["--use-angle=vulkan", "--disable-vulkan-surface"] : []),
    "--use-vulkan=swiftshader",
    "--enable-features=Vulkan",
    "--use-webgpu-adapter=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-webgpu",
  ];
}

/**
 * Rune's own notice that the browser took its GPU device away (reason "unknown": Chrome's software
 * GPU process restarting under a loaded CI runner, run 44802931142). Rune handled it as designed, and
 * this file proves Rune does not panic; the frames it drew first still have to be there.
 */
function browserLostDevice(text: string): boolean {
  return text.startsWith("The GPU device was lost (unknown:");
}

async function draws(disableWebGpu: boolean, noAdapter = false): Promise<{ errors: string[]; frames: number }> {
  // With no adapter only WebGL2 draws, so that case gets the software GL the no-WebGPU case uses:
  // on hardware ANGLE its first frame waited ~20 s on D3D compiling Rune's shaders.
  const args = noAdapter ? [...browserArgs(true), "--enable-unsafe-webgpu"] : browserArgs(disableWebGpu);
  const browser = await chromium.launch({ executablePath: findChromeExecutable(), args });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    // No WebGPU is what older Safari, Firefox and blocklisted GPUs give a visitor.
    if (disableWebGpu) await page.addInitScript(() => { delete (Navigator.prototype as { gpu?: unknown }).gpu; });
    // WebGPU that finds no adapter is what headless Linux CI's software WebGPU sometimes gives, and a
    // visitor whose driver the browser refuses.
    if (noAdapter) await page.addInitScript(() => { GPU.prototype.requestAdapter = () => Promise.resolve(null); });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource") && !browserLostDevice(message.text())) errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
    await page.goto(`http://localhost:${server.port}/`);
    let frames = 0;
    for (let waited = 0; waited < 15_000 && frames === 0 && errors.length === 0; waited += 250) {
      await page.waitForTimeout(250);
      frames = await page.evaluate(() => (window as unknown as { __mod?: { frames_drawn(): number } }).__mod?.frames_drawn() ?? 0);
    }
    // Unmount Rune cleanly before closing the tab so its WebGPU device is destroyed with reason
    // "destroyed" and the winit event loop exits instead of racing page teardown.
    if (errors.length === 0) {
      await page.evaluate(async () => {
        (window as unknown as { __mod?: { unmount(): void } }).__mod?.unmount();
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
    }
    await page.close();
    return { errors, frames };
  } finally {
    await browser.close();
  }
}

test("the Rune bundle mounts and draws a tree in the browser without panicking", async () => {
  const result = await draws(false);
  expect(result.errors).toEqual([]);
  expect(result.frames).toBeGreaterThan(0);
});

test("without WebGPU the Rune bundle still draws, through WebGL2", async () => {
  const result = await draws(true);
  expect(result.errors).toEqual([]);
  expect(result.frames).toBeGreaterThan(0);
});

// The canvas keeps the first context it is asked for, so WebGPU must not take it before it has an
// adapter, or the WebGL2 fallback finds the canvas "already in use" and nothing draws.
test("WebGPU without an adapter leaves the canvas free, and the bundle draws through WebGL2", async () => {
  const fallback = await draws(false, true);
  expect(fallback.errors).toEqual([]);
  expect(fallback.frames).toBeGreaterThan(0);
});

// On WebGL2, as a visitor without WebGPU draws: headless Linux CI's software WebGPU finds no adapter
// for a reopened device in one page once one was destroyed (run 44536132147), which says nothing
// about Rune's reopen, and a hardware GPU reopens on WebGPU (checked on Windows).
test("one shared Rune instance composites multiple z-ordered layers, removes one cleanly, and tears down + reopens", async () => {
  const browser = await chromium.launch({ executablePath: findChromeExecutable(), args: browserArgs(true) });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript(() => { delete (Navigator.prototype as { gpu?: unknown }).gpu; });
  const errors: string[] = [];
  const log: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    log.push(`${message.type()}: ${message.text()}`);
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) errors.push(message.text());
  });
  await page.goto(`http://localhost:${server.port}/two`);
  const readState = () => (window as unknown as { __state?: { frames: number; lastRects: [string, number[]][] } }).__state;
  await page.waitForFunction(() => {
    const s = (window as unknown as { __state?: { frames: number; lastRects: [string, number[]][] } }).__state;
    return s !== undefined && s.frames > 0 && s.lastRects.some(([id]) => id === "n1") && s.lastRects.some(([id]) => id === "n2");
  });
  const bothLayers = await page.evaluate(readState);
  expect(await page.locator("canvas").count()).toBe(1);

  await page.evaluate(() => (window as unknown as { __removeLayer1(): void }).__removeLayer1());
  await page.waitForFunction(() => {
    const s = (window as unknown as { __state?: { lastRects: [string, number[]][] } }).__state;
    return s !== undefined && !s.lastRects.some(([id]) => id === "n1") && s.lastRects.some(([id]) => id === "n2");
  });

  await page.evaluate(() => (window as unknown as { __reopen(): void }).__reopen());
  // A reopen that never draws says what the page printed, not only that the wait ran out.
  const drew = await page.waitForFunction(() => {
    const s = (window as unknown as { __state?: { frames: number; lastRects: [string, number[]][] } }).__state;
    return s !== undefined && s.frames > 0 && s.lastRects.some(([id]) => id === "n3");
  }).then(() => true, () => false);
  const after = await page.evaluate(readState);
  await browser.close();
  expect(errors).toEqual([]);
  expect(drew, `the reopened instance never drew; the page printed:\n${log.join("\n")}`).toBe(true);
  expect(bothLayers!.frames).toBeGreaterThan(0);
  expect(after!.frames).toBeGreaterThan(0);
});
