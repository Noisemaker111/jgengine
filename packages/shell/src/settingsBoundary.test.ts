import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const scratch = resolve(import.meta.dir, "../../../.scratch/settings-boundary-test");
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(resolve(import.meta.dir, "../../react/node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  await mkdir(`${scratch}/node_modules/@react-three`, { recursive: true });
  for (const peer of ["@react-three/fiber", "@react-three/drei", "three", "three-stdlib"]) await symlink(resolve(import.meta.dir, "../node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  for (const pkg of ["core", "react", "shell", "ws"]) {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], { cwd: resolve(import.meta.dir, "../../", pkg), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
    await mkdir(`${scratch}/node_modules/@jgengine/${pkg}`, { recursive: true });
    execFileSync("tar", ["-xzf", pack.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: scratch });
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {defineGame} from '@jgengine/shell/gameKit';import {ShellHudPresentation} from '@jgengine/shell/ShellHudPresentation';
    import {SettingsTrigger,useSettings} from '@jgengine/react/settings';
    import {createGameContext} from '@jgengine/core/runtime/gameContext';import {createActionStateTracker} from '@jgengine/core/input/actionBindings';
    import {createSettingsStore,BUILT_IN_SETTING_CATEGORIES} from '@jgengine/core/settings/settingsModel';
    import {playControlsActive} from '@jgengine/core/game/controlGate';import {createAudioEngine} from '@jgengine/shell/audio/audioEngine';
    const mode=new URLSearchParams(location.search).get('mode');const calls=[];const errors=[];
    const store=createSettingsStore();if(mode==='saved'&&!sessionStorage.getItem('settings-seeded')){store.set('survey.hints',false);sessionStorage.setItem('settings-seeded','true');}
    const settings=mode==='disabled'?false:mode==='default'?undefined:{variant:'sheet',surface:mode==='quick'?'quick':false,
      hide:mode==='quick'?[]:BUILT_IN_SETTING_CATEGORIES,
      categories:mode==='saved'?[{id:'survey',label:'Survey'}]:[],
      extra:mode==='saved'?[{id:'survey.hints',label:'Hints',category:'survey',kind:'toggle',default:true}]:[],
      actions:[{id:'restart',label:'Restart survey',run:ctx=>calls.push(ctx)}]};
    let snapshot;function Hud(){const s=useSettings();snapshot={variant:s.variant,surface:s.surface,open:s.isOpen,actions:s.actions.map(a=>a.id),categories:s.categories.map(c=>c.id)};return <><SettingsTrigger label="Survey settings"/><output id="ready">Ready</output></>;}
    const playable=defineGame({name:'Configured survey settings',multiplayer:'off',presentation:'hud',settings,GameUI:Hud});
    const ctx=createGameContext({definition:playable.game,content:playable.content,player:{userId:'settings-user',isNew:true}});
    const audio=createAudioEngine();const root=createRoot(document.getElementById('root'));
    window.fixture={snapshot:()=>snapshot,calls:()=>calls.length,sameContext:()=>calls.every(c=>c===ctx),active:()=>playControlsActive(ctx),saved:()=>store.get('survey.hints',true),configDefault:()=>settings?.extra?.[0]?.default,errors:()=>errors,unmount:()=>root.unmount()};
    root.render(<ShellHudPresentation playable={playable} ctx={ctx} multiplayer={null} serverIdRef={{current:null}}
      tracker={createActionStateTracker({})} pointerAxisRef={{current:null}} gateRef={{current:false}} wrapperRef={{current:null}}
      f2HeldRef={{current:false}} yawRef={{current:0}} pitchRef={{current:0}} touchScheme={null} touchSink={{onCodeDown:()=>{},onCodeUp:()=>{}}}
      orientationGate={false} orientationGateEl={null} coarsePointer={false} uiScale={1} diagnostics={[]} devtoolsEnabled={false}
      devtoolsOpen={false} setDevtoolsOpen={()=>{}} reportRuntimeError={(e,p)=>errors.push(p+': '+String(e))}
      trackPointerAxis={()=>{}} deactivatePointerAxis={()=>{}} onPointerResumeAudio={()=>{}} settingsStore={store}
      bindingOverrides={{}} rebindAction={()=>{}} resetActionBinding={()=>{}} audioEngine={audio} poster={false}/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  Bun.gc(true);
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
}, 30000);
beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); Bun.gc(true); });
async function open(mode: string) {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}/?mode=${mode}`);
  try { await page.locator("#ready").waitFor({ timeout: 2000 }); } catch (error) { throw new Error(errors.join("\n") || String(error)); }
  expect(errors).toEqual([]); expect(await page.evaluate(() => (window as any).fixture.errors())).toEqual([]);
}
test("configured action-only HUD trigger opens the authored sheet and runs against its real context", async () => {
  await open("actions");
  expect(await page.evaluate(() => (window as any).fixture.snapshot())).toEqual({ variant: "sheet", surface: false, open: false, actions: ["restart"], categories: [] });
  await page.getByRole("button", { name: "Survey settings", exact: true }).click();
  expect(await page.getByRole("dialog", { name: "Settings", exact: true }).count()).toBe(1);
  expect(await page.evaluate(() => (window as any).fixture.active())).toBe(false);
  await page.getByRole("button", { name: "Restart survey", exact: true }).click();
  expect(await page.evaluate(() => (window as any).fixture.calls())).toBe(1);
  expect(await page.evaluate(() => (window as any).fixture.sameContext())).toBe(true);
  expect(await page.getByRole("dialog").count()).toBe(0);
  expect(await page.evaluate(() => (window as any).fixture.active())).toBe(true);
});
test("configured quick controls reach the actual shell chrome", async () => {
  await open("quick"); expect(await page.getByRole("button", { name: "Volume", exact: true }).count()).toBe(1);
  await page.getByRole("button", { name: "Volume", exact: true }).click();
  expect(await page.getByRole("slider", { name: "Master volume", exact: true }).count()).toBe(1);
  expect((await page.evaluate(() => (window as any).fixture.snapshot())).surface).toBe("quick");
});
test("explicit settings false removes settings entries and categories", async () => {
  await open("disabled"); expect(await page.getByRole("button", { name: "Survey settings", exact: true }).count()).toBe(0);
  expect(await page.evaluate(() => (window as any).fixture.snapshot())).toEqual({ variant: "panel", surface: false, open: false, actions: [], categories: [] });
});
test("omitted settings retain built-in categories without forcing quick chrome", async () => {
  await open("default"); expect(await page.getByRole("button", { name: "Survey settings", exact: true }).count()).toBe(1);
  expect(await page.getByRole("button", { name: "Volume", exact: true }).count()).toBe(0);
  expect((await page.evaluate(() => (window as any).fixture.snapshot())).actions).toEqual([]);
});
test("saved player values override configured defaults and survive a mounted shell replacement", async () => {
  await open("saved"); expect((await page.evaluate(() => (window as any).fixture.snapshot())).categories).toEqual(["survey"]); await page.getByRole("button", { name: "Survey settings", exact: true }).click();
  await page.getByRole("button", { name: "Survey", exact: true }).click();
  const hints=page.getByRole("switch", { name: "Hints", exact: true });
  expect(await hints.getAttribute("aria-checked")).toBe("false");
  await hints.click(); expect(await hints.getAttribute("aria-checked")).toBe("true");
  expect(await page.evaluate(() => (window as any).fixture.saved())).toBe(true);
  expect(await page.evaluate(() => (window as any).fixture.configDefault())).toBe(true);
  await hints.click(); expect(await hints.getAttribute("aria-checked")).toBe("false");
  expect(await page.evaluate(() => (window as any).fixture.saved())).toBe(false);
  await page.evaluate(() => (window as any).fixture.unmount());
  await page.reload(); await page.locator("#ready").waitFor({timeout:2000});
  expect(await page.evaluate(() => (window as any).fixture.saved())).toBe(false);
  expect(await page.evaluate(() => (window as any).fixture.configDefault())).toBe(true);
});
