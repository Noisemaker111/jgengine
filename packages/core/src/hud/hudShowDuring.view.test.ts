import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";
import { gotoFixture, installPublicPackages } from "../../../../scripts/browser-test-fixture";

/**
 * A `HudCanvas` gated by `showDuring` renders nothing on a title screen and mounts its canvas when play
 * starts. It used to measure the viewport only on first mount, when the canvas did not exist yet, so a
 * game that boots to its title showed every panel `visibility: hidden` for the whole run (#2246: Beacon's
 * war horn never appeared after New Defense).
 */
setDefaultTimeout(30_000);
const root = resolve(import.meta.dir, "../../../..");
const scratch = `${root}/.scratch/hud-show-during-test`;
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(`${root}/packages/react/node_modules/${peer}`, `${scratch}/node_modules/${peer}`, "dir");
  await installPublicPackages(scratch, ["core", "react"]);
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React from '@jgengine/core/ui/jsx';import {createRoot} from '@jgengine/core/ui/jsx/client.view';
    import {HudCanvas,HudPanel,useHudLayout} from '@jgengine/core/hud/hudLayout.view';
    import {GameViewportProvider} from '@jgengine/core/ui/viewport.view';
    function Fixture(){const layout=useHudLayout();const [playing,setPlaying]=React.useState(false);
      React.useEffect(()=>{const t=setTimeout(()=>setPlaying(true),200);return ()=>clearTimeout(t)},[]);
      // Without a game context the phase reads "playing"; a menu-only gate stands in for the title screen.
      return <GameViewportProvider><HudCanvas layout={layout} editChord={false} showDuring={playing ? ['playing'] : ['menu']}>
      <HudPanel id="horn" anchor="top-left"><div style={{width:180,height:60,background:'#345'}}>Begin first assault</div></HudPanel>
    </HudCanvas></GameViewportProvider>}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  Bun.gc(true);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<style>body{margin:0}#root{position:fixed;inset:0}</style><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox", "--mute-audio"] });
  page = await browser.newPage();
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });

test("a HUD that first appears when play starts places and shows its panels", async () => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoFixture(page, `http://127.0.0.1:${server.port}/`, () => page.locator('[data-hud-panel="horn"]').waitFor({ state: "attached" }));
  await page.waitForFunction(() => {
    const panel = document.querySelector<HTMLElement>('[data-hud-panel="horn"]');
    return panel !== null && getComputedStyle(panel).visibility === "visible";
  }, undefined, { timeout: 5000 });
  expect(await page.evaluate(() => document.body.innerText)).toContain("Begin first assault");
});
