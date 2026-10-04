import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";
import { cleanupBrowserFixture } from "../../../scripts/browser-fixture-cleanup";

let scratch: string | undefined;
let browser: Browser | undefined, context: BrowserContext | undefined, page: Page;
let server: ReturnType<typeof Bun.serve> | undefined;
async function setupStep<T>(name: string, run: () => T | Promise<T>): Promise<T> {
  const start = performance.now();
  console.info(`[HUD input setup] ${name}`);
  try {
    const result = await run();
    console.info(`[HUD input setup] ${name}: ${Math.round(performance.now() - start)}ms`);
    return result;
  } catch (cause) {
    throw new Error(`[HUD input setup] ${name} failed after ${Math.round(performance.now() - start)}ms`, { cause });
  }
}
async function cleanup() {
  const directory = scratch;
  try {
    await cleanupBrowserFixture({ browser, server, removeScratch: () => directory === undefined ? Promise.resolve() : rm(directory, { recursive: true, force: true }) });
  } finally {
    browser = undefined;
    server = undefined;
    scratch = undefined;
  }
}
beforeAll(async () => {
  try {
    const directory = scratch = await mkdtemp(join(tmpdir(), "jgengine-hud-input-"));
    await setupStep("link browser peers", async () => {
      await Promise.all([mkdir(`${directory}/node_modules/@jgengine`, { recursive: true }), mkdir(`${directory}/node_modules/@react-three`, { recursive: true })]);
      await Promise.all([
        ...["react", "react-dom"].map(peer => symlink(resolve(import.meta.dir, "../../react/node_modules", peer), `${directory}/node_modules/${peer}`, "dir")),
        ...["@react-three/fiber", "@react-three/drei", "three", "three-stdlib"].map(peer => symlink(resolve(import.meta.dir, "../node_modules", peer), `${directory}/node_modules/${peer}`, "dir")),
      ]);
    });
    const packages = ["core", "react", "shell"];
    const packs = await setupStep("pack public core/react/shell", () => JSON.parse(execFileSync("npm", ["pack", ...packages.map(pkg => `--workspace=packages/${pkg}`), "--ignore-scripts", "--json", "--pack-destination", directory], {
      cwd: resolve(import.meta.dir, "../../.."), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024, timeout: 25_000,
    })) as { name: string; filename: string }[]);
    await setupStep("extract public packages", async () => {
      for (const pkg of packages) {
        const pack = packs.find(candidate => candidate.name === `@jgengine/${pkg}`);
        if (pack === undefined) throw new Error(`Missing packed @jgengine/${pkg}`);
        await mkdir(`${directory}/node_modules/@jgengine/${pkg}`, { recursive: true });
        execFileSync("tar", ["-xzf", pack.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: directory });
      }
    });
    await Bun.write(`${directory}/fixture.tsx`, `
      import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
      import {InventoryGrid} from '@jgengine/react/inventoryGrid';import {GameProvider} from '@jgengine/react/provider';
      import {Window} from '@jgengine/react/panels';import {createShellKeyHandlers} from '@jgengine/shell/ShellChrome';
      import {defineGameDefinition} from '@jgengine/core/game/defineGame';import {createAssetCatalog} from '@jgengine/core/scene/assetCatalog';
      import {createGameContext} from '@jgengine/core/runtime/gameContext';import {createActionStateTracker,toActionStateBindingMap} from '@jgengine/core/input/actionBindings';
      const ctx=createGameContext({definition:defineGameDefinition({name:'HUD key boundary',assets:createAssetCatalog(),multiplayer:'off',inventories:{bag:{slots:4}}}),content:{},player:{userId:'hud-user',isNew:true}});
      ctx.player.inventory.put('bag','sword',1,{slot:0});
      const tracker=createActionStateTracker(toActionStateBindingMap({move:['ArrowRight','KeyD'],jump:['Space'],use:['Enter'],tab:['Tab']}));
      const presses=[];const keys=createShellKeyHandlers({f2HeldRef:{current:false},tracker:{...tracker,handleDown:code=>{const action=tracker.handleDown(code);if(action!==null)presses.push(action);return action}},devtoolsEnabled:false,setDevtoolsOpen:()=>{},controlsActive:()=>true});
      function Fixture(){const[open,setOpen]=useState(false),[choice,setChoice]=useState(0);
        window.fixture={slots:()=>ctx.player.inventory.state('bag').slots,presses:()=>presses,held:()=>tracker.actions().filter(action=>tracker.isDown(action))};
        return <div id="play" tabIndex={0} onKeyDown={keys.onKeyDown} onKeyUp={keys.onKeyUp} onBlur={keys.onBlur} style={{width:800,height:600}}>
          <GameProvider context={ctx}><div id="standalone"><InventoryGrid inventoryId="bag" columns={2}/></div>
            <button id="bag-toggle" onClick={()=>setOpen(!open)}>Bag</button>{open&&<Window title="Bag" onClose={()=>setOpen(false)} x={200} y={50}><InventoryGrid inventoryId="bag" columns={2}/><input aria-label="Search bag"/></Window>}
          </GameProvider>
          <div id="custom" tabIndex={0} onKeyDown={event=>{if(event.key==='ArrowRight'){event.preventDefault();setChoice(value=>value+1)}}}>Choice {choice}</div>
          <div id="toolbar" role="toolbar" tabIndex={0}>Caller command strip</div>
          <input id="chat" aria-label="Chat"/>
          <canvas id="canvas" tabIndex={0} width={160} height={80} onClick={event=>event.currentTarget.requestPointerLock()}/>
        </div>;
      }createRoot(document.getElementById('root')).render(<Fixture/>);
    `);
    const script = await setupStep("build public browser fixture", () => buildBrowserFixture(`${directory}/fixture.tsx`));
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
    browser = await setupStep("launch Chromium", () => chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] }));
  } catch (error) {
    try { await cleanup(); } catch (cleanupError) { console.error("[HUD input setup] cleanup failed", cleanupError); }
    throw error;
  }
}, 30000);
beforeEach(async () => {
  context = await browser!.newContext();
  page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server!.port}`);
  try { await page.locator('[data-slot="0"]').waitFor({ timeout: 2000 }); }
  catch (error) { throw new Error(errors.join("\n") || String(error)); }
  expect(errors).toEqual([]);
});
afterEach(async () => { try { await context?.close(); } finally { context = undefined; } });
afterAll(cleanup);
async function presses() { return page.evaluate(() => (window as any).fixture.presses()); }
async function held() { return page.evaluate(() => (window as any).fixture.held()); }

for (const windowed of [false, true]) {
  test(`${windowed ? "windowed" : "standalone"} inventory keys move live items without gameplay presses`, async () => {
    if (windowed) await page.locator("#bag-toggle").click();
    const grid = page.locator(windowed ? '[data-jg-window] [role="grid"]' : '#standalone [role="grid"]');
    await grid.locator('[data-slot="0"]').focus();
    await page.keyboard.press("Space"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
    expect(await page.evaluate(() => (window as any).fixture.slots())).toEqual([null, { itemId: "sword", count: 1 }, null, null]);
    expect(await presses()).toEqual([]); expect(await held()).toEqual([]);
  });
}
test("a custom widget's prevented key and toolbar focus remain owned by the HUD", async () => {
  await page.locator("#custom").focus(); await page.keyboard.press("ArrowRight");
  expect(await page.locator("#custom").textContent()).toBe("Choice 1"); expect(await presses()).toEqual([]);
  await page.locator("#toolbar").focus(); await page.keyboard.press("d");
  expect(await presses()).toEqual([]); expect(await held()).toEqual([]);
});
test("text focus retires a held play key and return to play requires a fresh key", async () => {
  await page.locator("#play").focus(); await page.keyboard.down("d"); expect(await held()).toEqual(["move"]);
  await page.locator("#chat").focus(); expect(await held()).toEqual([]);
  await page.keyboard.type("d "); expect(await page.locator("#chat").inputValue()).toBe("d ");
  expect(await presses()).toEqual(["move"]);
  await page.keyboard.up("d"); await page.locator("#play").focus(); expect(await held()).toEqual([]);
  await page.keyboard.press("Space"); expect(await presses()).toEqual(["move", "jump"]); expect(await held()).toEqual([]);
});
test("window inventory keys stay owned while pointer lock remains caller-controlled", async () => {
  await page.locator("#canvas").click();
  await page.waitForFunction(() => document.pointerLockElement?.id === "canvas");
  await page.locator("#bag-toggle").focus(); await page.keyboard.press("Enter");
  const grid = page.locator('[data-jg-window] [role="grid"]');
  await grid.locator('[data-slot="0"]').focus();
  await page.keyboard.press("Space"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
  expect(await page.evaluate(() => (window as any).fixture.slots()[1])).toEqual({ itemId: "sword", count: 1 });
  expect(await presses()).toEqual([]); expect(await held()).toEqual([]);
  await page.getByRole("button", { name: "Close", exact: true }).focus(); await page.keyboard.press("Enter");
  expect(await page.locator("[data-jg-window]").count()).toBe(0);
  expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("canvas");
  await page.locator("#canvas").focus(); expect(await held()).toEqual([]);
  await page.keyboard.press("Space"); expect(await presses()).toEqual(["jump"]); expect(await held()).toEqual([]);
});
