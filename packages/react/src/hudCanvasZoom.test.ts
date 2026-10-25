import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";
import { gotoFixture, installPublicPackages } from "../../../scripts/browser-test-fixture";

/**
 * `HudCanvas` zooms the whole HUD on compact displays. Lane blocks must still reach the real right and
 * bottom edges: they once measured the lane frame in on-screen pixels and then placed blocks inside the
 * zoom, which left a dead band of about 100 px at 844x390 with `compactScale={0.86}`.
 */
setDefaultTimeout(30_000);
const root = resolve(import.meta.dir, "../../..");
const scratch = `${root}/.scratch/hud-canvas-zoom-test`;
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(`${root}/packages/react/node_modules/${peer}`, `${scratch}/node_modules/${peer}`, "dir");
  await installPublicPackages(scratch, ["core", "react"]);
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {HudCanvas,HudPanel,useHudLayout} from '@jgengine/react/hudLayout';
    const zoom=Number(new URLSearchParams(location.search).get('zoom')??'1');
    const box=(w,h)=><div style={{width:w,height:h,background:'#345'}}/>;
    function Fixture(){const layout=useHudLayout();return <HudCanvas layout={layout} editChord={false} compactScale={zoom}>
      <HudPanel id="kit" anchor="bottom-right" lane="kit" width={120} height={40}>{box(120,40)}</HudPanel>
      <HudPanel id="air" anchor="bottom-left" lane="air">{box(100,30)}</HudPanel>
      <HudPanel id="badge" anchor="top-right" lane="badge">{box(90,24)}</HudPanel>
      <HudPanel id="depth" anchor="top-right" lane="badge" order={1}>{box(90,24)}</HudPanel>
    </HudCanvas>}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  Bun.gc(true);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<style>body{margin:0}#root{position:fixed;inset:0}</style><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });

type Edges = Record<"kit" | "air" | "badge" | "depth", { left: number; top: number; right: number; bottom: number }>;

async function edgesAt(width: number, height: number, zoom: number): Promise<Edges> {
  await page.setViewportSize({ width, height });
  await gotoFixture(page, `http://127.0.0.1:${server.port}/?zoom=${zoom}`, () => page.locator('[data-hud-panel="depth"]').waitFor());
  // Let the lane frame and the measured block sizes settle (two layout passes).
  await page.waitForFunction(() => {
    const kit = document.querySelector('[data-hud-panel="kit"]')?.getBoundingClientRect();
    const air = document.querySelector('[data-hud-panel="air"]')?.getBoundingClientRect();
    return kit !== undefined && air !== undefined && kit.width > 0 && air.width > 0;
  });
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  return page.evaluate(() => {
    const out: Record<string, { left: number; top: number; right: number; bottom: number }> = {};
    for (const id of ["kit", "air", "badge", "depth"]) {
      const r = document.querySelector(`[data-hud-panel="${id}"]`)!.getBoundingClientRect();
      out[id] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return out;
  }) as Promise<Edges>;
}

// A compact HUD keeps a 10 px edge pad in its own pixels, which the zoom shrinks on screen.
for (const [width, height] of [[844, 390], [390, 844]] as const) {
  test(`lane blocks reach the real edges at ${width}x${height} with compactScale 0.86`, async () => {
    const zoom = 0.86;
    const pad = 10 * zoom;
    const edges = await edgesAt(width, height, zoom);
    expect(edges.kit.right).toBeCloseTo(width - pad, 0);
    expect(edges.kit.bottom).toBeCloseTo(height - pad, 0);
    expect(edges.air.left).toBeCloseTo(pad, 0);
    expect(edges.air.bottom).toBeCloseTo(height - pad, 0);
    expect(edges.badge.right).toBeCloseTo(width - pad, 0);
    expect(edges.badge.top).toBeCloseTo(pad, 0);
    // A measured block stacks right under its neighbour: its on-screen height is its zoomed size.
    expect(edges.badge.bottom - edges.badge.top).toBeCloseTo(24 * zoom, 0);
    expect(edges.depth.top).toBeGreaterThan(edges.badge.bottom);
    expect(edges.depth.top - edges.badge.bottom).toBeLessThan(16);
  });
}

test("an unzoomed desktop HUD keeps its 16 px edge pad", async () => {
  const edges = await edgesAt(1600, 900, 0.86);
  expect(edges.kit.right).toBeCloseTo(1600 - 16, 0);
  expect(edges.kit.bottom).toBeCloseTo(900 - 16, 0);
  expect(edges.air.left).toBeCloseTo(16, 0);
});
