// The committed Rune UI bundle (native/wasm/jg-ui) mounted in a real browser: it must draw a tree
// without panicking, with WebGPU and without it. A Rust call that has no browser implementation
// (std's clock on wasm32-unknown-unknown, 11 Nov 2026) panics only here, never in `cargo test`, and
// it took every game on jgengine.com down with "RuntimeError: unreachable".
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { chromeGraphicsArgs, findChromeExecutable } from "../../../../scripts/browser-lib";

setDefaultTimeout(60_000);

const bundle = resolve(import.meta.dir, "../../../../native/wasm/jg-ui");
const PAGE = `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="jg-ui" style="position:fixed;inset:0;width:100%;height:100%"></canvas>
<script type="module">
  window.__frames = [];
  window.__jgUiFrame = (payload) => window.__frames.push(payload);
  const mod = await import("/jg_ui.js");
  await mod.default();
  mod.mount("jg-ui", "{}");
  mod.set_spec(JSON.stringify({ children: [{ k: "native", id: "root", kind: "box", props: { fill: "#204060", width: 200, height: 80 },
    children: [{ k: "native", id: "label", kind: "text", props: { text: "Play" } }] }] }), 1);
  window.__mod = mod;
</script></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
/** Software GL, as a visitor without a WebGPU adapter has: on Windows hardware ANGLE, the first WebGL2 frame waits ~25s on D3D compiling Rune's shaders. */
let softwareBrowser: Browser;

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/") return new Response(PAGE, { headers: { "content-type": "text/html" } });
      if (path === "/favicon.ico") return new Response(null, { status: 204 });
      const file = Bun.file(join(bundle, ...path.split("/").filter((part) => part !== "" && part !== "..")));
      return file.size > 0 ? new Response(file) : new Response("missing", { status: 404 });
    },
  });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), args: ["--headless=new", ...chromeGraphicsArgs(), "--enable-unsafe-webgpu"] });
  softwareBrowser = await chromium.launch({ executablePath: findChromeExecutable(), args: ["--headless=new", ...chromeGraphicsArgs({ JG_CAPTURE_SOFTWARE_GL: "1" })] });
});

afterAll(async () => {
  await browser?.close();
  await softwareBrowser?.close();
  server?.stop(true);
});

async function draws(disableWebGpu: boolean): Promise<{ errors: string[]; frames: number }> {
  const page = await (disableWebGpu ? softwareBrowser : browser).newPage({ viewport: { width: 640, height: 360 } });
  // No WebGPU is what older Safari, Firefox and blocklisted GPUs give a visitor.
  if (disableWebGpu) await page.addInitScript(() => { delete (Navigator.prototype as { gpu?: unknown }).gpu; });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.goto(`http://localhost:${server.port}/`);
  let frames = 0;
  for (let waited = 0; waited < 15_000 && frames === 0 && errors.length === 0; waited += 250) {
    await page.waitForTimeout(250);
    frames = await page.evaluate(() => (window as unknown as { __mod?: { frames_drawn(): number } }).__mod?.frames_drawn() ?? 0);
  }
  await page.close();
  return { errors, frames };
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
