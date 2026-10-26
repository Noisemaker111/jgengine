import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";
import { gotoFixture, installPublicPackages } from "../../../../scripts/browser-test-fixture";

/**
 * `HudCanvas` places panels from every anchor together. At a phone-sized 800x450 a left-edge column
 * used to run into the top-left card and a centred bottom bar into the bottom-right card, because each
 * anchor laid itself out alone. Now no two panels intersect at any size, a crowded tertiary panel folds
 * into a toggle that opens it, and a panel that pops up mid-play pushes into free room.
 */
setDefaultTimeout(30_000);
const root = resolve(import.meta.dir, "../../../..");
const scratch = `${root}/.scratch/hud-panel-layout-test`;
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;

const IDS = ["terminal", "missions", "stash", "vitals", "build", "stones", "tower", "log"] as const;

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(`${root}/packages/react/node_modules/${peer}`, `${scratch}/node_modules/${peer}`, "dir");
  await installPublicPackages(scratch, ["core", "react"]);
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {HudCanvas,HudPanel,useHudLayout} from '@jgengine/core/hud/hudLayout.view';
    import {GameViewportProvider} from '@jgengine/core/ui/viewport.view';
    const box=(w,h)=><div style={{width:w,height:h,background:'#345'}}/>;
    function Fixture(){const layout=useHudLayout();const [inspecting,setInspecting]=React.useState(false);
      React.useEffect(()=>{const t=setTimeout(()=>setInspecting(true),300);return ()=>clearTimeout(t)},[]);
      return <GameViewportProvider><HudCanvas layout={layout} editChord={false}>
      <HudPanel id="terminal" anchor="top-left" priority="critical">{box(190,130)}</HudPanel>
      <HudPanel id="missions" anchor="left">{box(180,110)}</HudPanel>
      <HudPanel id="stash" anchor="left" order={1}>{box(180,100)}</HudPanel>
      <HudPanel id="vitals" anchor="bottom-left" priority="critical">{box(170,80)}</HudPanel>
      <HudPanel id="build" anchor="bottom" priority="critical">{box(460,100)}</HudPanel>
      <HudPanel id="stones" anchor="bottom-right">{box(190,70)}</HudPanel>
      {inspecting ? <HudPanel id="tower" anchor="right" priority="critical">{box(170,200)}</HudPanel> : null}
      <HudPanel id="log" anchor="right" order={1} priority="tertiary" chip="log">{box(200,160)}</HudPanel>
    </HudCanvas></GameViewportProvider>}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  Bun.gc(true);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<style>body{margin:0}#root{position:fixed;inset:0}</style><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });

interface Box { left: number; top: number; right: number; bottom: number; collapsed: boolean }

async function settle(frames = 4): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>(done => {
        const step = (left: number) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
        step(count);
      }),
    frames,
  );
}

async function boxes(): Promise<Record<string, Box>> {
  await settle();
  return page.evaluate((ids) => {
    const out: Record<string, Box> = {};
    for (const id of ids) {
      const el = document.querySelector(`[data-hud-panel="${id}"]`);
      if (el === null) continue;
      const r = el.getBoundingClientRect();
      out[id] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, collapsed: el.hasAttribute("data-hud-collapsed") };
    }
    return out;
  }, [...IDS]);
}

function overlapping(placed: Record<string, Box>): string[] {
  const ids = Object.keys(placed);
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = placed[ids[i]!]!, b = placed[ids[j]!]!;
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) out.push(`${ids[i]}∩${ids[j]}`);
    }
  }
  return out;
}

async function load(width: number, height: number): Promise<Record<string, Box>> {
  await page.setViewportSize({ width, height });
  await gotoFixture(page, `http://127.0.0.1:${server.port}/`, () => page.locator('[data-hud-panel="tower"]').waitFor());
  await page.waitForFunction(() => document.querySelector('[data-hud-panel="tower"]')?.getAttribute("style")?.includes("visibility") === false);
  return boxes();
}

for (const [width, height] of [[800, 450], [1024, 768], [1600, 900]] as const) {
  test(`no two panels intersect at ${width}x${height}, and the engine reports no collision`, async () => {
    const placed = await load(width, height);
    expect(Object.keys(placed).sort()).toEqual([...IDS].sort());
    expect(overlapping(placed)).toEqual([]);
    for (const box of Object.values(placed)) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.bottom).toBeLessThanOrEqual(height);
    }
    expect(await page.evaluate(() => document.querySelector("[data-jg-viewport]")!.getAttribute("data-jg-layout-collision"))).toBeNull();
  });
}

test("at full size every panel shows in full; on a phone the tertiary log folds into a toggle that opens it", async () => {
  const wide = await load(1600, 900);
  expect(Object.values(wide).some((box) => box.collapsed)).toBe(false);
  const phone = await load(800, 450);
  expect(phone.log!.collapsed).toBe(true);
  expect(phone.tower!.collapsed).toBe(false);
  expect(phone.build!.collapsed).toBe(false);
  await page.locator('[data-hud-panel="log"] [data-hud-chip]').click();
  await settle();
  const popover = await page.locator('[data-hud-panel="log"] [data-hud-chip-popover]').boundingBox();
  expect(popover).not.toBeNull();
  expect(popover!.width).toBeCloseTo(200 * 0.85, 0);
});
