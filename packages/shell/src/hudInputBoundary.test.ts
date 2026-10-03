import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const scratch = resolve(import.meta.dir, "../../../.scratch/hud-input-boundary-test");
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(resolve(import.meta.dir, "../../react/node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  await mkdir(`${scratch}/node_modules/@react-three`, { recursive: true });
  for (const peer of ["@react-three/fiber", "@react-three/drei", "three", "three-stdlib"]) await symlink(resolve(import.meta.dir, "../node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  for (const pkg of ["core", "react", "shell"]) {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], { cwd: resolve(import.meta.dir, "../../", pkg), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
    await mkdir(`${scratch}/node_modules/@jgengine/${pkg}`, { recursive: true });
    execFileSync("tar", ["-xzf", pack.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: scratch });
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
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
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
}, 30000);
beforeEach(async () => {
  page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}`);
  try { await page.locator('[data-slot="0"]').waitFor({ timeout: 2000 }); }
  catch (error) { throw new Error(errors.join("\n") || String(error)); }
  expect(errors).toEqual([]);
});
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });
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
