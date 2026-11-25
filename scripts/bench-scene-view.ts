/**
 * The small scene viewer next to the same house in plain three.js, at phone width: the bytes each
 * page downloads (gzip -9), the first frame and the draw time while a finger turns the house, and
 * how many frames each draws while the house sits still. Chrome runs at 377 x 700, device pixel
 * ratio 2, with the CPU slowed 4x (Chrome's "mid-tier mobile" preset).
 *
 *   bun scripts/bench-scene-view.ts [--runs 5] [--json out.json]
 */
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright-core";

import { chromeGraphicsArgs, findChromeExecutable } from "./browser-lib";

const here = join(import.meta.dir, "fixtures", "scene-view");
const out = resolve(import.meta.dir, "../.scratch/scene-view-bench");
const args = process.argv.slice(2);
const runs = Number(args[args.indexOf("--runs") + 1] ?? 5) || 5;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : undefined;

interface Page { name: string; entry: string }
const PAGES: Page[] = [
  { name: "jgengine scene view", entry: join(here, "viewerEntry.ts") },
  { name: "plain three.js", entry: join(here, "plainEntry.ts") },
];

async function build(page: Page): Promise<{ dir: string; files: { name: string; gzip: number }[] }> {
  const dir = join(out, page.name.replace(/\W+/g, "-"));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const result = await Bun.build({ entrypoints: [page.entry], outdir: dir, target: "browser", minify: true, splitting: true, naming: { entry: "[name].[ext]", chunk: "chunk-[hash].[ext]" } });
  if (!result.success) throw new AggregateError(result.logs, `build ${page.name} failed`);
  const files = await Promise.all(result.outputs.map(async (output) => ({ name: output.path.slice(dir.length + 1), gzip: gzipSync(await output.text(), { level: 9 }).length })));
  const main = files.find((file) => file.name.endsWith("Entry.js"))!.name;
  // Static chunks the entry imports get a modulepreload, as Vite writes them, so the page does not
  // wait for the entry to parse before it asks for three.js.
  const mainText = await Bun.file(join(dir, main)).text();
  const preloads = [...mainText.matchAll(/from\s*"\.\/(chunk-[\w-]+\.js)"/g)].map((match) => `<link rel=modulepreload href="./${match[1]}">`).join("");
  await Bun.write(join(dir, "index.html"), `<!doctype html><meta name=viewport content="width=device-width">${preloads}<style>html,body{margin:0;height:100%}canvas{display:block;width:100%;height:100%}</style><canvas></canvas><script type=module src="./${main}"></script>`);
  return { dir, files };
}

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? NaN; };
const p95 = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? NaN; };

const built = await Promise.all(PAGES.map(build));
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const [page, ...rest] = path.slice(1).split("/");
    const index = PAGES.findIndex((entry) => entry.name.replace(/\W+/g, "-") === page);
    if (index < 0) return new Response("no page", { status: 404 });
    const file = Bun.file(join(built[index]!.dir, rest.join("/") || "index.html"));
    return (await file.exists()) ? new Response(file) : new Response("missing", { status: 404 });
  },
});

const browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: [...chromeGraphicsArgs()] });
const report: Record<string, unknown>[] = [];
const samples = PAGES.map(() => ({ first: [] as number[], draws: [] as number[], idle: 0 }));
try {
  // Pages take turns run by run, so drift in the machine's load lands on both alike.
  for (let run = 0; run < runs; run++) {
    for (const [index, page] of PAGES.entries()) {
      const sample = samples[index]!;
      const context = await browser.newContext({ viewport: { width: 377, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const tab = await context.newPage();
      const cdp = await context.newCDPSession(tab);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await tab.goto(`http://localhost:${server.port}/${page.name.replace(/\W+/g, "-")}/`);
      await tab.waitForFunction(() => window.bench !== undefined);
      sample.first.push(await tab.evaluate(() => window.bench!.firstFrameMs));
      // Sitting still: count draws across 120 animation frames.
      const before = await tab.evaluate(() => window.bench!.renderCount());
      await tab.evaluate(() => new Promise<void>((done) => { let n = 0; const tick = () => (++n >= 120 ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }));
      sample.idle += (await tab.evaluate(() => window.bench!.renderCount())) - before;
      // A finger turning the house: 60 moves across the canvas, one per animation frame.
      const startDraws = await tab.evaluate(() => window.bench!.renders.length);
      await tab.mouse.move(100, 350);
      await tab.mouse.down();
      for (let step = 1; step <= 60; step++) {
        await tab.mouse.move(100 + step * 3, 350 + Math.sin(step / 6) * 40);
        await tab.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
      }
      await tab.mouse.up();
      sample.draws.push(...(await tab.evaluate((from) => window.bench!.renders.slice(from), startDraws)));
      await context.close();
    }
  }
  for (const [index, page] of PAGES.entries()) {
    const { first, draws, idle } = samples[index]!;
    const files = built[index]!.files;
    const row = {
      page: page.name,
      gzipKB: +(files.reduce((sum, file) => sum + file.gzip, 0) / 1024).toFixed(1),
      files: files.map((file) => `${file.name} ${(file.gzip / 1024).toFixed(1)} KB`),
      firstFrameMs: Math.round(median(first)),
      drawMsMedian: +median(draws).toFixed(2),
      drawMsP95: +p95(draws).toFixed(2),
      drawsWhileTurning: Math.round(draws.length / runs),
      drawsWhileStill: Math.round(idle / runs),
    };
    report.push(row);
    console.log(row);
  }
} finally {
  await browser.close();
  server.stop(true);
}
if (jsonOut !== undefined) await Bun.write(jsonOut, `${JSON.stringify({ measured: new Date().toISOString().slice(0, 10), runs, device: "377x700 @2x, CPU 4x slower", pages: report }, null, 2)}\n`);
