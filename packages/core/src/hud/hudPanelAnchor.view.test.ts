import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";
import { gotoFixture, installPublicPackages } from "../../../../scripts/browser-test-fixture";

/**
 * A flowing `HudPanel` that has not been moved takes its anchor from the prop on every render. A game
 * that picks its anchor per display profile must see the panel follow when the window crosses the
 * compact breakpoint in either direction. On compact the panel stacks above the right-edge panel
 * (`order` -1) instead of sitting in the bottom corner, so it never lands on a bottom-edge neighbour
 * or on the right-edge panel.
 */
setDefaultTimeout(30_000);
const root = resolve(import.meta.dir, "../../../..");
const scratch = `${root}/.scratch/hud-panel-anchor-test`;
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(`${root}/packages/react/node_modules/${peer}`, `${scratch}/node_modules/${peer}`, "dir");
  await installPublicPackages(scratch, ["core", "react"]);
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {HudCanvas,HudPanel,useHudLayout} from '@jgengine/core/hud/hudLayout.view';
    import {useDisplayProfile} from '@jgengine/core/ui/display.view';
    import {GameViewportProvider} from '@jgengine/core/ui/viewport.view';
    const box=(w,h)=><div style={{width:w,height:h,background:'#345'}}/>;
    function Fixture(){const layout=useHudLayout();const {compact}=useDisplayProfile();const [inspecting,setInspecting]=React.useState(false);
      React.useEffect(()=>{const t=setTimeout(()=>setInspecting(true),200);return ()=>clearTimeout(t)},[]);
      return <GameViewportProvider><HudCanvas layout={layout} editChord={false}>
      <HudPanel id="build" anchor="bottom">{box(360,110)}</HudPanel>
      <HudPanel id="rites" anchor={compact ? "right" : "bottom-right"} order={compact ? -1 : 0}>{box(190,70)}</HudPanel>
      {inspecting ? <HudPanel id="tower" anchor="right">{box(150,180)}</HudPanel> : null}
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

interface Placed { region: string | null; left: number; top: number; right: number; bottom: number }

async function settle(frames = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>(done => {
        const step = (left: number) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
        step(count);
      }),
    frames,
  );
}

type Id = "build" | "rites" | "tower";

async function placed(): Promise<Record<Id, Placed>> {
  await settle();
  return page.evaluate(() => {
    const out: Record<string, Placed> = {};
    for (const id of ["build", "rites", "tower"]) {
      const el = document.querySelector(`[data-hud-panel="${id}"]`);
      const r = el!.getBoundingClientRect();
      out[id] = { region: el!.getAttribute("data-hud-anchor"), left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return out as Record<Id, Placed>;
  });
}

function overlaps(a: Placed, b: Placed): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function gateReport(): Promise<string | null> {
  await settle(4);
  return page.evaluate(() => document.querySelector("[data-jg-viewport]")!.getAttribute("data-jg-layout-collision"));
}

test("a panel that mounts beside a stacked neighbour does not leave a stale overlap report", async () => {
  await page.setViewportSize({ width: 800, height: 450 });
  await gotoFixture(page, `http://127.0.0.1:${server.port}/`, () => page.locator('[data-hud-panel="tower"]').waitFor());
  expect(await gateReport()).toBeNull();
});

test("a flowing panel follows its anchor prop across the compact breakpoint, both ways", async () => {
  await page.setViewportSize({ width: 800, height: 450 });
  await gotoFixture(page, `http://127.0.0.1:${server.port}/`, () => page.locator('[data-hud-panel="tower"]').waitFor());
  const compactStart = await placed();
  expect(compactStart.rites.region).toBe("right");
  expect(compactStart.rites.bottom).toBeLessThanOrEqual(compactStart.tower.top);
  expect(overlaps(compactStart.build, compactStart.rites)).toBe(false);
  expect(overlaps(compactStart.tower, compactStart.rites)).toBe(false);

  await page.setViewportSize({ width: 1600, height: 900 });
  const wide = await placed();
  expect(wide.rites.region).toBe("bottom-right");
  expect(overlaps(wide.build, wide.rites)).toBe(false);

  await page.setViewportSize({ width: 800, height: 450 });
  const compactAgain = await placed();
  expect(compactAgain.rites.region).toBe("right");
  expect(overlaps(compactAgain.tower, compactAgain.rites)).toBe(false);
});
